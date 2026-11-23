import type { User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
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
) {
  const roomRef = doc(collection(db, "rooms"));
  const inviteToken = createInviteToken();
  const batch = writeBatch(db);
  batch.set(roomRef, {
    code: roomRef.id.slice(0, 6).toUpperCase(),
    name: roomName.trim(),
    budgetCap,
    ownerUid: user.uid,
    roommateUid: null,
    inviteToken,
    createdAt: Date.now(),
  });
  batch.set(doc(db, "rooms", roomRef.id, "members", user.uid), {
    uid: user.uid,
    name: profile.name || user.displayName || "Room owner",
    phone: profile.phone || "",
    upiId: profile.upiId || "",
    role: "owner",
  });
  batch.set(doc(db, "roomInvites", inviteToken), {
    roomId: roomRef.id,
    ownerUid: user.uid,
  });
  batch.set(doc(db, "users", user.uid), { ...profile, roomId: roomRef.id }, { merge: true });
  await batch.commit();
  return roomRef.id;
}

export async function joinRoom(
  db: Firestore,
  user: User,
  profile: UserProfile,
  inviteToken: string,
) {
  const inviteSnapshot = await getDoc(doc(db, "roomInvites", inviteToken));
  if (!inviteSnapshot.exists()) throw new Error("This invite link is invalid or expired.");
  const { roomId } = inviteSnapshot.data() as { roomId: string };
  if (!roomId) throw new Error("This invite link is invalid.");

  const batch = writeBatch(db);
  batch.update(doc(db, "rooms", roomId), {
    roommateUid: user.uid,
    joinedWithInviteToken: inviteToken,
  });
  batch.set(doc(db, "rooms", roomId, "members", user.uid), {
    uid: user.uid,
    name: profile.name || user.displayName || "Roommate",
    phone: profile.phone || "",
    upiId: profile.upiId || "",
    role: "roommate",
    inviteToken,
  });
  batch.set(doc(db, "users", user.uid), { ...profile, roomId }, { merge: true });
  await batch.commit();
  return roomId;
}

export async function saveUserProfile(
  db: Firestore,
  uid: string,
  profile: UserProfile,
) {
  const batch = writeBatch(db);
  batch.set(doc(db, "users", uid), profile, { merge: true });
  if (profile.roomId) {
    batch.update(doc(db, "rooms", profile.roomId, "members", uid), {
      name: profile.name,
      phone: profile.phone,
      upiId: profile.upiId,
    });
  }
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
  name: string,
  budgetCap: number,
) {
  await updateDoc(doc(db, "rooms", roomId), { name, budgetCap });
}

export async function removeDocument(
  db: Firestore,
  roomId: string,
  collectionName: "expenses" | "settlements",
  documentId: string,
) {
  await deleteDoc(doc(db, "rooms", roomId, collectionName, documentId));
}
