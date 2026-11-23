import type { User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import type { Expense } from "@/src/features/expenses/types";
import type { Settlement } from "@/src/features/settlements/types";
import type { RoomState } from "./types";

export type UserProfile = {
  name: string;
  email: string;
  phone: string;
  upiId: string;
  roomId: string | null;
};

export type RoomMembership = {
  roomId: string;
  roomName: string;
  role: "owner" | "roommate";
};

export type CloudRoom = {
  id: string;
  code: string;
  name: string;
  budgetCap: number;
  ownerUid: string;
  roommateUid: string | null;
  inviteToken: string;
};

export type RoomMember = {
  uid: string;
  name: string;
  phone: string;
  upiId: string;
  role: "owner" | "roommate";
};

export function mapCloudRoomMembership(
  roomId: string,
  data: Record<string, unknown>,
): RoomMembership | null {
  if (
    data.roomId !== roomId
    || typeof data.roomName !== "string"
    || data.roomName.trim().length === 0
    || (data.role !== "owner" && data.role !== "roommate")
  ) {
    return null;
  }

  return {
    roomId,
    roomName: data.roomName,
    role: data.role,
  };
}

const expenseCategories: Expense["category"][] = [
  "rent",
  "electricity",
  "water",
  "vegetables",
  "groceries",
  "internet",
  "gas",
  "other",
];

const expenseSplits: Expense["split"][] = ["50-50", "100-other", "personal"];

export function mapCloudExpense(
  id: string,
  data: Record<string, unknown>,
  currentUid: string,
): Expense | null {
  if (
    typeof data.title !== "string"
    || data.title.trim().length === 0
    || typeof data.amount !== "number"
    || !Number.isFinite(data.amount)
    || data.amount <= 0
    || typeof data.date !== "string"
    || typeof data.category !== "string"
    || !expenseCategories.includes(data.category as Expense["category"])
    || typeof data.split !== "string"
    || !expenseSplits.includes(data.split as Expense["split"])
    || typeof data.paidByUid !== "string"
    || typeof data.createdByUid !== "string"
  ) {
    return null;
  }

  return {
    id,
    title: data.title,
    amount: data.amount,
    date: data.date,
    category: data.category as Expense["category"],
    split: data.split as Expense["split"],
    note: typeof data.note === "string" && data.note.length > 0 ? data.note : undefined,
    paidByUid: data.paidByUid,
    createdByUid: data.createdByUid,
    paidBy: data.paidByUid === currentUid ? "you" : "friend",
    createdBy: data.createdByUid === currentUid ? "you" : "friend",
  };
}

export function mapCloudSettlement(
  id: string,
  data: Record<string, unknown>,
  currentUid: string,
): Settlement | null {
  if (
    typeof data.amount !== "number"
    || !Number.isFinite(data.amount)
    || data.amount <= 0
    || typeof data.date !== "string"
    || typeof data.fromUid !== "string"
    || typeof data.createdByUid !== "string"
  ) {
    return null;
  }

  return {
    id,
    amount: data.amount,
    date: data.date,
    note: typeof data.note === "string" && data.note.length > 0 ? data.note : undefined,
    fromUid: data.fromUid,
    createdByUid: data.createdByUid,
    from: data.fromUid === currentUid ? "you" : "friend",
    createdBy: data.createdByUid === currentUid ? "you" : "friend",
  };
}

function createInviteToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getMemberName(user: User, profile: UserProfile, fallback: string) {
  const name = profile.name.trim() || user.displayName?.trim() || user.email?.split("@")[0] || fallback;
  return name.slice(0, 80);
}

export function subscribeToProfile(
  db: Firestore,
  uid: string,
  fallbackProfile: UserProfile,
  onProfile: (profile: UserProfile) => void,
  onError: (error: Error) => void,
) {
  const profileRef = doc(db, "users", uid);
  return onSnapshot(
    profileRef,
    (snapshot) => {
      if (snapshot.exists()) {
        onProfile({ ...snapshot.data(), roomId: snapshot.data().roomId ?? null } as UserProfile);
        return;
      }
      onProfile(fallbackProfile);
    },
    onError,
  );
}

export function subscribeToUserRooms(
  db: Firestore,
  uid: string,
  onRooms: (rooms: RoomMembership[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    collection(db, "users", uid, "rooms"),
    (snapshot) => {
      const rooms: RoomMembership[] = [];
      for (const item of snapshot.docs) {
        const room = mapCloudRoomMembership(item.id, item.data());
        if (!room) {
          onError(new Error("Your room list contains invalid membership data."));
          return;
        }
        rooms.push(room);
      }
      onRooms(rooms);
    },
    onError,
  );
}

export async function migrateLegacyRoomMembership(
  db: Firestore,
  uid: string,
  roomId: string,
): Promise<RoomMembership | null> {
  const membershipRef = doc(db, "users", uid, "rooms", roomId);
  const membershipSnapshot = await getDoc(membershipRef);
  if (membershipSnapshot.exists()) {
    const membership = mapCloudRoomMembership(roomId, membershipSnapshot.data());
    if (!membership) throw new Error("Your room membership data is invalid.");
    return membership;
  }

  const [roomSnapshot, memberSnapshot] = await Promise.all([
    getDoc(doc(db, "rooms", roomId)),
    getDoc(doc(db, "rooms", roomId, "members", uid)),
  ]);
  if (!roomSnapshot.exists() || !memberSnapshot.exists()) return null;

  const roomName = roomSnapshot.data().name;
  const role = memberSnapshot.data().role;
  if (
    typeof roomName !== "string"
    || (role !== "owner" && role !== "roommate")
    || memberSnapshot.data().uid !== uid
  ) {
    throw new Error("Your existing room membership is invalid.");
  }

  const membership: RoomMembership = { roomId, roomName, role };
  await setDoc(membershipRef, membership);
  return membership;
}

export function subscribeToRoom(
  db: Firestore,
  roomId: string,
  user: User,
  handlers: {
    onRoom: (room: CloudRoom) => void;
    onMembers: (members: RoomMember[]) => void;
    onExpenses: (expenses: Expense[]) => void;
    onSettlements: (settlements: Settlement[]) => void;
    onError: (error: Error) => void;
  },
) {
  const roomRef = doc(db, "rooms", roomId);
  const unsubscribeRoom = onSnapshot(
    roomRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        handlers.onError(new Error("This room is no longer available."));
        return;
      }
      const data = snapshot.data();
      handlers.onRoom({
        id: snapshot.id,
        code: data.code,
        name: data.name,
        budgetCap: data.budgetCap,
        ownerUid: data.ownerUid,
        roommateUid: data.roommateUid ?? null,
        inviteToken: data.inviteToken,
      });
    },
    handlers.onError,
  );
  const unsubscribeMembers = onSnapshot(
    collection(db, "rooms", roomId, "members"),
    (snapshot) => handlers.onMembers(snapshot.docs.map((item) => ({ ...item.data(), uid: item.id }) as RoomMember)),
    handlers.onError,
  );
  const unsubscribeExpenses = onSnapshot(
    collection(db, "rooms", roomId, "expenses"),
    (snapshot) => {
      const expenses = snapshot.docs
        .map((item) => mapCloudExpense(item.id, item.data(), user.uid))
        .filter((expense): expense is Expense => expense !== null);
      handlers.onExpenses(expenses);
    },
    handlers.onError,
  );
  const unsubscribeSettlements = onSnapshot(
    collection(db, "rooms", roomId, "settlements"),
    (snapshot) => {
      const settlements = snapshot.docs
        .map((item) => mapCloudSettlement(item.id, item.data(), user.uid))
        .filter((settlement): settlement is Settlement => settlement !== null);
      handlers.onSettlements(settlements);
    },
    handlers.onError,
  );
  return () => {
    unsubscribeRoom();
    unsubscribeMembers();
    unsubscribeExpenses();
    unsubscribeSettlements();
  };
}

export async function createRoom(
  db: Firestore,
  user: User,
  profile: UserProfile,
  roomName: string,
  budgetCap: number,
): Promise<RoomMembership> {
  const roomRef = doc(collection(db, "rooms"));
  const inviteToken = createInviteToken();
  const normalizedName = roomName.trim();
  if (!normalizedName || normalizedName.length > 80) {
    throw new Error("Room name must be between 1 and 80 characters.");
  }
  if (!Number.isFinite(budgetCap) || budgetCap < 0 || budgetCap > 1000000000) {
    throw new Error("Monthly budget must be between ₹0 and ₹1,000,000,000.");
  }
  const memberName = getMemberName(user, profile, "Room owner");
  const batch = writeBatch(db);
  batch.set(roomRef, {
    code: roomRef.id.slice(0, 6).toUpperCase(),
    name: normalizedName,
    budgetCap,
    ownerUid: user.uid,
    roommateUid: null,
    inviteToken,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, "rooms", roomRef.id, "members", user.uid), {
    uid: user.uid,
    name: memberName,
    phone: profile.phone || "",
    upiId: profile.upiId || "",
    role: "owner",
  });
  batch.set(doc(db, "roomInvites", inviteToken), {
    roomId: roomRef.id,
    ownerUid: user.uid,
    roomName: normalizedName,
  });
  batch.set(doc(db, "users", user.uid, "rooms", roomRef.id), {
    roomId: roomRef.id,
    roomName: normalizedName,
    role: "owner",
  });
  batch.set(doc(db, "users", user.uid), {
    ...profile,
    name: memberName,
    roomId: roomRef.id,
  }, { merge: true });
  await batch.commit();
  return { roomId: roomRef.id, roomName: normalizedName, role: "owner" };
}

export async function joinRoom(
  db: Firestore,
  user: User,
  profile: UserProfile,
  inviteToken: string,
): Promise<RoomMembership> {
  const inviteSnapshot = await getDoc(doc(db, "roomInvites", inviteToken));
  if (!inviteSnapshot.exists()) throw new Error("This invite link is invalid or expired.");
  const invite = inviteSnapshot.data();
  const roomId = invite.roomId;
  if (typeof roomId !== "string" || roomId.length === 0) {
    throw new Error("This invite link is invalid.");
  }

  const membershipSnapshot = await getDoc(doc(db, "users", user.uid, "rooms", roomId));
  if (membershipSnapshot.exists()) {
    const membership = mapCloudRoomMembership(roomId, membershipSnapshot.data());
    if (!membership) throw new Error("Your room membership data is invalid.");
    return membership;
  }
  if (profile.roomId === roomId) {
    const legacyMembership = await migrateLegacyRoomMembership(db, user.uid, roomId);
    if (legacyMembership) return legacyMembership;
  }

  const roomRef = doc(db, "rooms", roomId);
  const memberRef = doc(db, "rooms", roomId, "members", user.uid);
  const roomName = typeof invite.roomName === "string" && invite.roomName.trim()
    ? invite.roomName.trim()
    : `Room ${roomId.slice(0, 6)}`;
  const memberName = getMemberName(user, profile, "Roommate");
  const batch = writeBatch(db);
  batch.update(roomRef, {
    roommateUid: user.uid,
    joinedWithInviteToken: inviteToken,
  });
  batch.set(memberRef, {
    uid: user.uid,
    name: memberName,
    phone: profile.phone || "",
    upiId: profile.upiId || "",
    role: "roommate",
    inviteToken,
  });
  batch.set(doc(db, "users", user.uid, "rooms", roomId), {
    roomId,
    roomName,
    role: "roommate",
  });
  batch.set(doc(db, "users", user.uid), {
    ...profile,
    name: memberName,
    roomId,
  }, { merge: true });
  await batch.commit();
  return { roomId, roomName, role: "roommate" };
}

export async function saveUserProfile(
  db: Firestore,
  uid: string,
  profile: UserProfile,
  rooms: RoomMembership[],
) {
  const batch = writeBatch(db);
  batch.set(doc(db, "users", uid), profile, { merge: true });
  rooms.forEach(({ roomId }) => {
    batch.update(doc(db, "rooms", roomId, "members", uid), {
      name: profile.name,
      phone: profile.phone,
      upiId: profile.upiId,
    });
  });
  await batch.commit();
}

export function toRoomState(
  room: CloudRoom,
  members: RoomMember[],
  expenses: Expense[],
  settlements: Settlement[],
  currentUid: string,
): RoomState {
  const own = members.find((member) => member.uid === currentUid);
  const friend = members.find((member) => member.uid !== currentUid);
  const expensesForUser = expenses.map((expense) => ({
    ...expense,
    paidBy: expense.paidByUid === currentUid ? "you" as const : "friend" as const,
    createdBy: expense.createdByUid === currentUid ? "you" as const : "friend" as const,
  }));
  const settlementsForUser = settlements.map((settlement) => ({
    ...settlement,
    from: settlement.fromUid === currentUid ? "you" as const : "friend" as const,
    createdBy: settlement.createdByUid === currentUid ? "you" as const : "friend" as const,
  }));
  return {
    room: {
      code: room.code,
      name: room.name,
      budgetCap: room.budgetCap,
      youName: own?.name || "You",
      youPhone: own?.phone || "",
      youUpi: own?.upiId || "",
      friendName: friend?.name || "Roommate",
      friendPhone: friend?.phone || "",
      friendUpi: friend?.upiId || "",
    },
    expenses: expensesForUser,
    settlements: settlementsForUser,
  };
}

export async function updateRoomSettings(
  db: Firestore,
  roomId: string,
  inviteToken: string,
  name: string,
  budgetCap: number,
  members: RoomMember[],
) {
  if (!name.trim() || name.trim().length > 80) {
    throw new Error("Room name must be between 1 and 80 characters.");
  }
  if (!Number.isFinite(budgetCap) || budgetCap < 0 || budgetCap > 1000000000) {
    throw new Error("Monthly budget must be between ₹0 and ₹1,000,000,000.");
  }
  const normalizedName = name.trim();
  const batch = writeBatch(db);
  batch.update(doc(db, "rooms", roomId), { name: normalizedName, budgetCap });
  batch.set(doc(db, "roomInvites", inviteToken), { roomName: normalizedName }, { merge: true });
  members.forEach((member) => {
    batch.set(doc(db, "users", member.uid, "rooms", roomId), {
      roomId,
      roomName: normalizedName,
      role: member.role,
    }, { merge: true });
  });
  await batch.commit();
}

export async function removeDocument(
  db: Firestore,
  roomId: string,
  collectionName: "expenses" | "settlements",
  documentId: string,
) {
  await deleteDoc(doc(db, "rooms", roomId, collectionName, documentId));
}
