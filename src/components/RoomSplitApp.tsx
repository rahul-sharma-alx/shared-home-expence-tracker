"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  RecaptchaVerifier,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut,
  type ConfirmationResult,
  type User,
} from "firebase/auth";
import {
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import QRCode from "react-qr-code";
import {
  ArrowLeftRight,
  Download,
  Home,
  LayoutDashboard,
  Plus,
  ReceiptText,
  Settings,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { AccountMenu } from "@/src/components/AccountMenu";
import { VoiceExpenseInput } from "@/src/components/VoiceExpenseInput";
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from "chart.js";
import { Doughnut, Bar } from "react-chartjs-2";
import { CATEGORIES, type Expense, type ExpenseCategoryId, type ExpenseSplit } from "@/src/features/expenses/types";
import { calculateBalances, categoryTotals, filterExpensesByMonth, formatINR, getSettlementMessage, buildUpiUri, buildWhatsAppUri, exportFilteredCsv } from "@/src/features/expenses/calculations";
import type { Settlement } from "@/src/features/settlements/types";
import type { RoomPerspective, RoomState } from "@/src/features/room/types";
import { firebaseAuth, firestore, isFirebaseConfigured } from "@/src/lib/firebase/client";
import {
  createRoom,
  joinRoom,
  removeDocument,
  saveUserProfile,
  migrateLegacyRoomMembership,
  subscribeToProfile,
  subscribeToRoom,
  subscribeToUserRooms,
  toRoomState,
  updateRoomSettings,
  type CloudRoom,
  type RoomMember,
  type RoomMembership,
  type UserProfile,
} from "@/src/features/room/cloud-repository";

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

type Tab = "overview" | "ledger" | "settlements" | "security";
type Modal = "expense" | "settings" | "settlement" | null;

const FIXED_BILLS = [
  { title: "Monthly Room Rent (Nov)", amount: 9000, category: "rent" as ExpenseCategoryId },
  { title: "Airtel Xstream Fiber Wi-Fi", amount: 799, category: "internet" as ExpenseCategoryId },
  { title: "Water Supply Bill", amount: 360, category: "water" as ExpenseCategoryId },
];

const EMPTY_ROOM_STATE: RoomState = {
  room: {
    code: "",
    name: "",
    budgetCap: 0,
    youName: "",
    youPhone: "",
    youUpi: "",
    friendName: "",
    friendPhone: "",
    friendUpi: "",
  },
  expenses: [],
  settlements: [],
};

function createId() {
  return crypto.randomUUID();
}

function getLocalDateString() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function RoomSplitApp() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [cloudRoom, setCloudRoom] = useState<CloudRoom | null>(null);
  const [roomMemberships, setRoomMemberships] = useState<RoomMembership[]>([]);
  const [roomMembershipsLoaded, setRoomMembershipsLoaded] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [cloudExpenses, setCloudExpenses] = useState<Expense[]>([]);
  const [cloudSettlements, setCloudSettlements] = useState<Settlement[]>([]);
  const [dataError, setDataError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [month, setMonth] = useState("all");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [payerFilter, setPayerFilter] = useState("all");
  const [modal, setModal] = useState<Modal>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [toast, setToast] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [budgetCap, setBudgetCap] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const legacyMigrationAttempts = useRef(new Set<string>());

  useEffect(() => {
    try {
      window.localStorage.removeItem("roomsplit_state_v2");
    } catch (error) {
      console.error("Could not remove legacy demo data from local storage.", error);
    }
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    const frame = window.requestAnimationFrame(() => {
      setInviteToken(new URLSearchParams(window.location.hash.slice(1)).get("join") || "");
      if (!firebaseAuth) {
        setAuthReady(true);
        return;
      }
      unsubscribe = onAuthStateChanged(
        firebaseAuth,
        (user) => {
          setAuthUser(user);
          if (user) setMonth(getLocalDateString().slice(0, 7));
          setAuthReady(true);
          setProfile(null);
          setCloudRoom(null);
          setRoomMemberships([]);
          setRoomMembershipsLoaded(false);
          setActiveRoomId(null);
          setMembers([]);
          setMembersLoaded(false);
          setCloudExpenses([]);
          setCloudSettlements([]);
          setDataError("");
          legacyMigrationAttempts.current.clear();
        },
        (error) => {
          setDataError(error.message);
          setAuthReady(true);
        },
      );
    });
    return () => {
      window.cancelAnimationFrame(frame);
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!firestore || !authUser) return;
    return subscribeToProfile(
      firestore,
      authUser.uid,
      {
        name: authUser.displayName || "",
        email: authUser.email || "",
        phone: "",
        upiId: "",
        roomId: null,
      },
      (nextProfile) => {
        setProfile(nextProfile);
      },
      (error) => {
        setDataError(error.message);
      },
    );
  }, [authUser]);

  useEffect(() => {
    if (!firestore || !authUser) return;
    return subscribeToUserRooms(
      firestore,
      authUser.uid,
      (rooms) => {
        setRoomMemberships(rooms);
        setRoomMembershipsLoaded(true);
        setActiveRoomId((current) => current || rooms[0]?.roomId || null);
      },
      (error) => {
        setDataError(error.message);
        setRoomMembershipsLoaded(true);
      },
    );
  }, [authUser]);

  useEffect(() => {
    const legacyRoomId = profile?.roomId;
    if (
      !firestore
      || !authUser
      || !roomMembershipsLoaded
      || !legacyRoomId
      || roomMemberships.some((room) => room.roomId === legacyRoomId)
    ) {
      return;
    }

    const attemptKey = `${authUser.uid}:${legacyRoomId}`;
    if (legacyMigrationAttempts.current.has(attemptKey)) return;
    legacyMigrationAttempts.current.add(attemptKey);
    let cancelled = false;
    void migrateLegacyRoomMembership(firestore, authUser.uid, legacyRoomId)
      .then((membership) => {
        if (!membership || cancelled) return;
        setRoomMemberships((current) => current.some((room) => room.roomId === membership.roomId)
          ? current
          : [...current, membership]);
        setActiveRoomId((current) => current || membership.roomId);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDataError(error instanceof Error ? error.message : "Could not load your existing room.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authUser, profile?.roomId, roomMemberships, roomMembershipsLoaded]);

  useEffect(() => {
    if (!firestore || !authUser || !activeRoomId) return;
    return subscribeToRoom(firestore, activeRoomId, authUser, {
      onRoom: (room) => {
        setCloudRoom(room);
      },
      onMembers: (nextMembers) => {
        setMembers(nextMembers);
        setMembersLoaded(true);
      },
      onExpenses: setCloudExpenses,
      onSettlements: setCloudSettlements,
      onError: (error) => {
        setDataError(error.message);
      },
    });
  }, [activeRoomId, authUser]);

  const activeCloudRoom = cloudRoom?.id === activeRoomId ? cloudRoom : null;
  const state = useMemo(
    () => activeCloudRoom && authUser
      ? toRoomState(activeCloudRoom, members, cloudExpenses, cloudSettlements, authUser.uid)
      : EMPTY_ROOM_STATE,
    [activeCloudRoom, members, cloudExpenses, cloudSettlements, authUser],
  );
  const roomLoading = Boolean(activeRoomId && !activeCloudRoom);
  const hasRooms = roomMemberships.length > 0 || Boolean(profile?.roomId);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredExpenses = useMemo(() => {
    let items = filterExpensesByMonth(state.expenses, month);
    if (query.trim()) {
      const needle = query.toLowerCase();
      items = items.filter((expense) =>
        `${expense.title} ${expense.note || ""}`.toLowerCase().includes(needle),
      );
    }
    if (categoryFilter !== "all") items = items.filter((expense) => expense.category === categoryFilter);
    if (payerFilter !== "all") items = items.filter((expense) => expense.paidBy === payerFilter);
    return items;
  }, [state.expenses, month, query, categoryFilter, payerFilter]);

  const periodExpenses = useMemo(() => filterExpensesByMonth(state.expenses, month), [state.expenses, month]);
  const availableMonths = useMemo(() => {
    const months = new Set(state.expenses.map((expense) => expense.date.slice(0, 7)));
    if (month !== "all") months.add(month);
    return [...months].sort((a, b) => b.localeCompare(a));
  }, [state.expenses, month]);
  const balances = useMemo(
    () => calculateBalances(periodExpenses, state.settlements, month),
    [periodExpenses, state.settlements, month],
  );

  function canModify(expense: Expense) {
    return Boolean(authUser && expense.createdByUid === authUser.uid);
  }

  function switchRoom(roomId: string) {
    if (roomId === activeRoomId) return;
    setActiveRoomId(roomId);
    setCloudRoom(null);
    setMembers([]);
    setMembersLoaded(false);
    setCloudExpenses([]);
    setCloudSettlements([]);
    setDataError("");
    setMonth("all");
    setQuery("");
    setCategoryFilter("all");
    setPayerFilter("all");
    setTab("overview");
  }

  function activateMembership(membership: RoomMembership) {
    setRoomMemberships((current) => [
      ...current.filter((room) => room.roomId !== membership.roomId),
      membership,
    ]);
    switchRoom(membership.roomId);
  }

  function openExpense(expense?: Expense) {
    setEditingExpense(expense || null);
    setModal("expense");
  }

  async function saveExpense(expense: Expense) {
    if (!firestore || !authUser || !activeRoomId) return;
    try {
      await setDoc(doc(firestore, "rooms", activeRoomId, "expenses", expense.id), {
        title: expense.title,
        amount: expense.amount,
        date: expense.date,
        category: expense.category,
        split: expense.split,
        note: expense.note || "",
        paidByUid: authUser.uid,
        createdByUid: editingExpense?.createdByUid || authUser.uid,
        updatedAt: serverTimestamp(),
      });
      setModal(null);
      setToast(editingExpense ? "Expense updated" : "Expense added");
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Could not save this expense.");
    }
  }

  async function deleteExpense(id: string) {
    if (!firestore || !activeRoomId) return;
    try {
      await removeDocument(firestore, activeRoomId, "expenses", id);
      setToast("Expense deleted");
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Could not delete this expense.");
    }
  }

  async function addFixedBill(template: (typeof FIXED_BILLS)[number]) {
    const exists = state.expenses.some((expense) =>
      expense.date.startsWith(month) &&
      expense.category === template.category &&
      expense.title.toLowerCase().includes(template.title.split(" (Nov)")[0].toLowerCase()),
    );
    if (month === "all") {
      setToast("Choose a month before adding a fixed bill");
      return;
    }
    if (exists) {
      setToast("Fixed bill already exists for this month");
      return;
    }
    await saveExpense({
      id: createId(),
      title: `${template.title.replace(" (Nov)", "")} (${month})`,
      amount: template.amount,
      date: `${month}-01`,
      category: template.category,
      paidBy: "you",
      split: "50-50",
      createdBy: "you",
      createdByUid: authUser?.uid,
      paidByUid: authUser?.uid,
    });
  }

  async function handleGoogleSignIn() {
    if (!firebaseAuth) return;
    setLoginBusy(true);
    setDataError("");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(firebaseAuth, provider);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Google sign-in failed.");
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleSignOut() {
    if (!firebaseAuth) return;
    try {
      await signOut(firebaseAuth);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Could not sign out.");
    }
  }

  async function handleCreateRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!firestore || !authUser || !profile) return;
    setFormBusy(true);
    setDataError("");
    try {
      const membership = await createRoom(firestore, authUser, profile, roomName, Number(budgetCap));
      activateMembership(membership);
      setRoomName("");
      setBudgetCap("");
      setCreateRoomOpen(false);
      setToast("Room created");
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Could not create this room.");
    } finally {
      setFormBusy(false);
    }
  }

  async function handleJoinRoom() {
    if (!firestore || !authUser || !profile || !inviteToken) return;
    setFormBusy(true);
    setDataError("");
    try {
      const membership = await joinRoom(firestore, authUser, profile, inviteToken);
      activateMembership(membership);
      setInviteToken("");
      window.history.replaceState(null, "", window.location.pathname);
      setToast("You joined the room");
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Could not join this room.");
    } finally {
      setFormBusy(false);
    }
  }

  async function handleSaveProfile(nextProfile: UserProfile) {
    if (!firestore || !authUser) return;
    try {
      await saveUserProfile(firestore, authUser.uid, nextProfile, roomMemberships);
      setProfile(nextProfile);
      setProfileOpen(false);
      setToast("Profile saved");
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Could not save your profile.");
    }
  }

  async function handleSaveRoom(name: string, budget: number) {
    if (!firestore || !authUser || !activeCloudRoom || !membersLoaded) return;
    try {
      await updateRoomSettings(
        firestore,
        activeCloudRoom.id,
        activeCloudRoom.inviteToken,
        name,
        budget,
        members,
      );
      setRoomMemberships((current) => current.map((room) =>
        room.roomId === activeCloudRoom.id ? { ...room, roomName: name } : room,
      ));
      setModal(null);
      setToast("Room settings saved");
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Could not update room settings.");
    }
  }

  async function saveSettlement(settlement: Settlement) {
    if (!firestore || !authUser || !activeRoomId) return;
    try {
      await setDoc(doc(firestore, "rooms", activeRoomId, "settlements", settlement.id), {
        amount: settlement.amount,
        date: settlement.date,
        note: settlement.note || "",
        fromUid: authUser.uid,
        createdByUid: authUser.uid,
      });
      setModal(null);
      setToast("Settlement recorded");
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Could not record this settlement.");
    }
  }

  async function deleteSettlement(id: string) {
    if (!firestore || !activeRoomId) return;
    try {
      await removeDocument(firestore, activeRoomId, "settlements", id);
      setToast("Settlement deleted");
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Could not delete this settlement.");
    }
  }

  async function copyRoomInvite() {
    if (!activeCloudRoom) return;
    await copyText(`${window.location.origin}/#join=${activeCloudRoom.inviteToken}`, "Invite link copied");
  }

  function downloadCsv() {
    const csv = exportFilteredCsv(filteredExpenses);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `roomsplit-${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyText(value: string, success: string) {
    try {
      await navigator.clipboard.writeText(value);
      setToast(success);
    } catch {
      setToast("Could not copy");
    }
  }

  const netText =
    Math.abs(balances.net) < 1
      ? "All settled"
      : balances.net > 0
        ? `${state.room.friendName} owes ${state.room.youName}`
        : `${state.room.youName} owes ${state.room.friendName}`;
  const settlementMessage = getSettlementMessage(
    balances.net,
    state.room.friendName,
  );
  const periodLabel = month === "all"
    ? "All time"
    : new Intl.DateTimeFormat("en-IN", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${month}-01T00:00:00Z`));
  const budgetPercent = state.room.budgetCap
    ? (balances.totalSpent / state.room.budgetCap) * 100
    : 0;

  const categoryMap = categoryTotals(periodExpenses);
  const doughnutData = {
    labels: CATEGORIES.map((category) => category.name),
    datasets: [{
      data: CATEGORIES.map((category) => categoryMap.get(category.id) || 0),
      backgroundColor: CATEGORIES.map((category) => category.color),
      borderWidth: 0,
    }],
  };

  const payerData = {
    labels: CATEGORIES.map((category) => category.name),
    datasets: [
      { label: state.room.youName, data: CATEGORIES.map((category) => periodExpenses.filter((expense) => expense.category === category.id && expense.paidBy === "you").reduce((sum, expense) => sum + expense.amount, 0)), backgroundColor: "#8bd9cf" },
      { label: state.room.friendName, data: CATEGORIES.map((category) => periodExpenses.filter((expense) => expense.category === category.id && expense.paidBy === "friend").reduce((sum, expense) => sum + expense.amount, 0)), backgroundColor: "#537f7a" },
    ],
  };

  const accountProfile = profile || {
    name: authUser?.displayName || "",
    email: authUser?.email || "",
    phone: "",
    upiId: "",
    roomId: null,
  };
  const googleProvider = authUser?.providerData.find(
    (provider) => provider.providerId === GoogleAuthProvider.PROVIDER_ID,
  );
  const profilePhotoUrl = googleProvider?.photoURL || (googleProvider ? authUser?.photoURL : null) || null;
  const availableRooms = roomMemberships.map(({ roomId, roomName }) => ({ roomId, roomName }));
  if (
    profile?.roomId
    && !availableRooms.some((room) => room.roomId === profile.roomId)
  ) {
    availableRooms.push({
      roomId: profile.roomId,
      roomName: activeCloudRoom?.id === profile.roomId
        ? activeCloudRoom.name
        : `Room ${profile.roomId.slice(0, 6)}`,
    });
  }

  if (!authReady) return <CenteredMessage message="Loading RoomSplit…" />;

  if (!isFirebaseConfigured) {
    return <LoginScreen configured={false} busy={false} error="Firebase is not configured. Add the NEXT_PUBLIC_FIREBASE_* values to .env.local to enable sign-in." onSignIn={handleGoogleSignIn} />;
  }

  if (!authUser) {
    return <LoginScreen configured busy={loginBusy} error={dataError} onSignIn={handleGoogleSignIn} />;
  }

  if (!profile) {
    return <CenteredMessage message={dataError || "Loading your account…"} error={Boolean(dataError)} />;
  }
  if (!roomMembershipsLoaded && !hasRooms) {
    return <CenteredMessage message={dataError || "Loading your rooms…"} error={Boolean(dataError)} />;
  }
  if (hasRooms && !activeRoomId) {
    return <CenteredMessage message={dataError || "Loading your room list…"} error={Boolean(dataError)} />;
  }
  if (activeRoomId && roomLoading && !dataError) return <CenteredMessage message="Loading selected room…" />;
  if (hasRooms && !activeCloudRoom && dataError) return <CenteredMessage message={dataError} error />;

  if (!hasRooms) {
    if (!authUser) return <CenteredMessage message="Loading your account…" />;
    return (
      <>
        <RoomSetupScreen
          authUser={authUser}
          profile={profile}
          inviteToken={inviteToken}
          roomName={roomName}
          budgetCap={budgetCap}
          busy={formBusy}
          error={dataError}
          onRoomNameChange={setRoomName}
          onBudgetChange={setBudgetCap}
          onCreate={handleCreateRoom}
          onJoin={handleJoinRoom}
          photoUrl={profilePhotoUrl}
          onOpenProfile={() => setProfileOpen(true)}
          onSignOut={handleSignOut}
        />
        {profileOpen && (
          <ProfileModal
            profile={accountProfile}
            authEmail={authUser?.email || ""}
            onClose={() => setProfileOpen(false)}
            onSave={handleSaveProfile}
          />
        )}
      </>
    );
  }
  if (!activeCloudRoom) {
    return <CenteredMessage message={dataError || "Loading selected room…"} error={Boolean(dataError)} />;
  }

  return (
    <div className="roomsplit-shell min-h-dvh bg-zinc-50 text-zinc-900">
      <header className="app-header sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-900 text-white">
              <Home size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight">RoomSplit</span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">Live</span>
              </div>
              <p className="max-w-36 truncate text-xs text-zinc-500 sm:max-w-none">{state.room.name} · {state.room.code}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <AccountMenu
              displayName={accountProfile.name || authUser.displayName || "Profile"}
              email={authUser.email}
              photoUrl={profilePhotoUrl}
              onOpenProfile={() => setProfileOpen(true)}
              onSignOut={handleSignOut}
            />
            <button type="button" onClick={() => openExpense()} aria-label="Add expense" className="flex h-9 items-center gap-2 rounded-lg bg-zinc-900 px-2.5 text-xs font-semibold text-white sm:px-3">
              <Plus size={15} /> <span className="hidden sm:inline">Add Expense</span>
            </button>
          </div>
        </div>
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 pb-3 sm:px-6">
          <label className="sr-only" htmlFor="active-room">Active room</label>
          <select
            id="active-room"
            value={activeRoomId || ""}
            onChange={(event) => switchRoom(event.target.value)}
            aria-label="Switch room"
            className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold sm:max-w-sm"
          >
            {availableRooms.map((room) => (
              <option key={room.roomId} value={room.roomId}>{room.roomName}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setCreateRoomOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold"
          >
            <Plus size={14} /> <span>New room</span>
          </button>
        </div>
        <nav className="mx-auto hidden max-w-7xl gap-5 overflow-x-auto px-4 md:flex sm:px-6" aria-label="Main navigation">
          {([
            ["overview", "Overview"],
            ["ledger", "Ledger"],
            ["settlements", "Settlements"],
            ["security", "Security & Plan"],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-current={tab === key ? "page" : undefined}
              className={`border-b-2 py-3 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 ${tab === key ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-500"}`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mobile-main mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-5">
        {dataError && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{dataError}</p>}
        {inviteToken && (
          <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div>
              <p className="text-sm font-bold text-emerald-900">Room invitation</p>
              <p className="mt-1 text-xs text-emerald-800">Join another room without changing or losing this room’s ledger.</p>
            </div>
            <button type="button" disabled={formBusy} onClick={() => void handleJoinRoom()} className="rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
              {formBusy ? "Joining…" : "Join room"}
            </button>
          </section>
        )}
        {tab !== "security" && (
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Current period</p>
              <h1 className="mt-1 text-xl font-bold">{state.room.name} summary</h1>
            </div>
            <select
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
              aria-label="Month"
            >
              {availableMonths
                .map((key) => <option key={key} value={key}>{new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`))}</option>)}
              <option value="all">All time</option>
            </select>
          </div>
        )}

        {tab === "overview" && (
          <section aria-label="Settlement summary" aria-live="polite" className="settlement-summary mb-5 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{periodLabel} settlement</p>
            <h2 className="mt-2 text-base font-bold sm:text-lg">{settlementMessage}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Room expenses: {formatINR(balances.totalSpent)} · {state.room.youName} paid {formatINR(balances.youPaid)} · {state.room.friendName} paid {formatINR(balances.friendPaid)}.
            </p>
            <p className="mt-1 text-xs text-zinc-500">Based on this room’s expenses, split settings, and payments recorded in this period.</p>
          </section>
        )}

        {tab !== "security" && (
          <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Net balance" value={formatINR(Math.abs(balances.net))} detail={netText} accent />
            <Kpi label="Total spent" value={formatINR(balances.totalSpent)} detail={`${periodExpenses.length} entries`} />
            <Kpi label={`${state.room.youName} paid`} value={formatINR(balances.youPaid)} detail={`Share ${formatINR(balances.youShare)}`} />
            <Kpi label={`${state.room.friendName} paid`} value={formatINR(balances.friendPaid)} detail={`Share ${formatINR(balances.friendShare)}`} />
          </section>
        )}

        {tab === "overview" && (
          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <section className="rounded-xl border border-zinc-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-bold">Monthly budget</h2>
                <button type="button" onClick={() => setModal("settings")} disabled={activeCloudRoom.ownerUid !== authUser.uid || !membersLoaded} aria-label="Edit monthly budget" className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-zinc-900"><Settings size={16} /></button>
              </div>
              <div className="mb-2 flex items-end justify-between">
                <span className="text-2xl font-bold">{formatINR(balances.totalSpent)}</span>
                <span className="text-xs text-zinc-500">of {formatINR(state.room.budgetCap)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className={`h-full ${budgetPercent >= 100 ? "bg-red-600" : budgetPercent >= 80 ? "bg-amber-500" : "bg-zinc-900"}`}
                  style={{ width: `${Math.min(budgetPercent, 100)}%` }}
                />
              </div>
              {budgetPercent >= 80 && (
                <p className={`mt-3 text-xs ${budgetPercent >= 100 ? "text-red-600" : "text-amber-600"}`}>
                  {budgetPercent >= 100 ? "Over budget" : "80% budget warning"}
                </p>
              )}
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="h-56"><Doughnut data={doughnutData} options={{ maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { color: "#a4acab", boxWidth: 10, font: { size: 11 } } } } }} /></div>
                <div className="h-56"><Bar data={payerData} options={{ maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { color: "#a4acab" } } }, scales: { y: { beginAtZero: true, ticks: { color: "#a4acab" }, grid: { color: "rgba(255,255,255,0.08)" } }, x: { ticks: { color: "#a4acab", font: { size: 9 } }, grid: { display: false } } } }} /></div>
              </div>
            </section>
            <section className="rounded-xl border border-zinc-200 bg-white p-5">
              <h2 className="mb-4 text-sm font-bold">Recent entries</h2>
              <div className="space-y-3">
                {periodExpenses.slice(0, 6).map((expense) => (
                  <div key={expense.id} className="flex items-center justify-between border-b border-zinc-100 pb-3 last:border-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{expense.title}</p>
                      <p className="text-xs text-zinc-400">{expense.date} · {expense.paidBy === "you" ? state.room.youName : state.room.friendName}</p>
                    </div>
                    <span className="ml-3 text-sm font-bold">{formatINR(expense.amount)}</span>
                  </div>
                ))}
                {periodExpenses.length === 0 && <p className="text-sm text-zinc-400">No entries for this period.</p>}
              </div>
            </section>
          </div>
        )}

        {tab === "ledger" && (
          <section className="rounded-xl border border-zinc-200 bg-white">
            <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 p-4">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search entries" aria-label="Search expenses" className="min-w-44 flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Filter by category" className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm sm:flex-none">
                <option value="all">All categories</option>
                {CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <select value={payerFilter} onChange={(event) => setPayerFilter(event.target.value)} aria-label="Filter by payer" className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm sm:flex-none">
                <option value="all">All payers</option>
                <option value="you">{state.room.youName}</option>
                <option value="friend">{state.room.friendName}</option>
              </select>
              <button type="button" onClick={downloadCsv} className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm"><Download size={14} /> CSV</button>
            </div>
            <div className="grid gap-2 border-b border-zinc-100 p-4 sm:grid-cols-3">
              {FIXED_BILLS.map((bill) => (
                <button key={bill.category} type="button" onClick={() => addFixedBill(bill)} className="rounded-lg border border-zinc-200 p-3 text-left hover:bg-zinc-50">
                  <p className="text-xs font-semibold">{bill.title}</p>
                  <p className="mt-1 text-sm font-bold">{formatINR(bill.amount)}</p>
                </button>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[42rem] text-left">
                <thead className="text-xs text-zinc-400">
                  <tr><th className="px-4 py-3">Entry</th><th className="px-4 py-3">Payer</th><th className="px-4 py-3">Split</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3"></th></tr>
                </thead>
                <tbody>
                  {filteredExpenses.map((expense) => (
                    <tr key={expense.id} className="border-t border-zinc-100 text-sm">
                      <td className="px-4 py-3"><p className="font-semibold">{expense.title}</p><p className="text-xs text-zinc-400">{expense.date}</p></td>
                      <td className="px-4 py-3">{expense.paidBy === "you" ? state.room.youName : state.room.friendName}</td>
                      <td className="px-4 py-3">{expense.split}</td>
                      <td className="px-4 py-3 text-right font-bold">{formatINR(expense.amount)}</td>
                      <td className="px-4 py-3">
                        {canModify(expense) && (
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => openExpense(expense)} className="text-xs font-semibold text-zinc-600">Edit</button>
                            <button type="button" onClick={() => deleteExpense(expense.id)} aria-label={`Delete ${expense.title}`} className="text-zinc-400"><Trash2 size={14} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredExpenses.length === 0 && <p className="p-8 text-center text-sm text-zinc-400">No matching expenses.</p>}
            </div>
          </section>
        )}

        {tab === "settlements" && (
          <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
            <section className="rounded-xl border border-zinc-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-bold">Payment history</h2>
                <button type="button" onClick={() => setModal("settlement")} className="flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white"><ArrowLeftRight size={14} /> Record payment</button>
              </div>
              {state.settlements.filter((settlement) => month === "all" || settlement.date.startsWith(month)).map((settlement) => (
                <div key={settlement.id} className="flex items-center justify-between gap-3 border-b border-zinc-100 py-3 last:border-0">
                  <div className="min-w-0"><p className="break-words text-sm font-semibold">{settlement.from === "you" ? state.room.youName : state.room.friendName} → {settlement.from === "you" ? state.room.friendName : state.room.youName}</p><p className="break-words text-xs text-zinc-400">{settlement.date} · {settlement.note || "Payment"}</p></div>
                  <div className="flex shrink-0 items-center gap-3"><span className="font-bold">{formatINR(settlement.amount)}</span>{canModifySettlement(settlement) && <button type="button" onClick={() => void deleteSettlement(settlement.id)} aria-label="Delete settlement" className="rounded p-1 focus-visible:outline-2 focus-visible:outline-zinc-900"><Trash2 size={14} /></button>}</div>
                </div>
              ))}
            </section>
            <section className="rounded-xl border border-zinc-200 bg-white p-5">
              <h2 className="text-sm font-bold">Payment actions</h2>
              <PaymentActions state={state} balances={balances} onToast={setToast} />
            </section>
          </div>
        )}

        {tab === "security" && (
          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <div className="flex items-start gap-3">
              <ShieldCheck className="text-emerald-700" />
              <div>
                <h1 className="text-lg font-bold">Security & Plan</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">Room data is shared only with authenticated members. Firestore rules enforce room membership and record ownership; each roommate manages their own contact and UPI details.</p>
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setModal("settings")} disabled={activeCloudRoom.ownerUid !== authUser.uid || !membersLoaded} className="rounded-lg border border-zinc-200 p-4 text-left disabled:opacity-50"><p className="font-semibold">Room settings</p><p className="mt-1 text-xs text-zinc-500">Name and monthly budget · owner only</p></button>
              {activeCloudRoom.roommateUid ? (
                <div className="rounded-lg border border-zinc-200 p-4"><p className="font-semibold">Roommate joined</p><p className="mt-1 text-xs text-zinc-500">{state.room.friendName} is a member of this room.</p></div>
              ) : (
                <button type="button" onClick={() => void copyRoomInvite()} className="rounded-lg border border-zinc-200 p-4 text-left"><p className="font-semibold">Invite roommate</p><p className="mt-1 text-xs text-zinc-500">Copy a private link for room {state.room.code}</p></button>
              )}
            </div>
          </section>
        )}
      </main>

      <nav className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-30 flex border-t border-zinc-200 bg-white/95 pt-2 shadow-[0_-8px_24px_rgba(24,24,27,0.06)] backdrop-blur md:hidden" aria-label="Mobile navigation">
        {([
          ["overview", "Overview", LayoutDashboard],
          ["ledger", "Ledger", ReceiptText],
          ["settlements", "Settlements", ArrowLeftRight],
          ["security", "Security", ShieldCheck],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={tab === key ? "page" : undefined}
            className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-900 ${tab === key ? "bg-zinc-100 text-zinc-950" : "text-zinc-500"}`}
          >
            <Icon size={19} strokeWidth={tab === key ? 2.4 : 1.9} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {modal === "expense" && (
        <ExpenseModal
          expense={editingExpense}
          state={state}
          month={month}
          authUid={authUser?.uid || ""}
          busy={formBusy}
          onClose={() => setModal(null)}
          onSave={saveExpense}
        />
      )}
      {modal === "settings" && (
        activeCloudRoom && <SettingsModal room={activeCloudRoom} onClose={() => setModal(null)} onSave={handleSaveRoom} />
      )}
      {modal === "settlement" && (
        <SettlementModal state={state} balances={balances} onClose={() => setModal(null)} onSave={saveSettlement} />
      )}

      {profileOpen && (
        <ProfileModal
          profile={accountProfile}
          authEmail={authUser?.email || ""}
          onClose={() => setProfileOpen(false)}
          onSave={handleSaveProfile}
        />
      )}
      {createRoomOpen && (
        <Dialog title="Create another room" onClose={() => setCreateRoomOpen(false)}>
          <form onSubmit={handleCreateRoom} className="grid gap-4 p-5">
            <p className="text-sm leading-6 text-zinc-500">Each room has a separate member list, budget, expenses, and payment history.</p>
            <label className="grid gap-1 text-xs font-semibold">Room name<input required maxLength={80} value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="e.g. Apartment 204" className="rounded-lg border border-zinc-200 px-3 py-2.5 text-sm font-normal" /></label>
            <label className="grid gap-1 text-xs font-semibold">Monthly budget (INR)<input required type="number" min="0" max="1000000000" value={budgetCap} onChange={(event) => setBudgetCap(event.target.value)} className="rounded-lg border border-zinc-200 px-3 py-2.5 text-sm font-normal" /></label>
            <button type="submit" disabled={formBusy} className="rounded-lg bg-zinc-900 py-3 text-sm font-semibold text-white disabled:opacity-50">{formBusy ? "Creating…" : "Create room"}</button>
          </form>
        </Dialog>
      )}
      {toast && <div role="status" className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-50 -translate-x-1/2 rounded-lg bg-zinc-900 px-4 py-3 text-sm text-white shadow-xl md:bottom-5">{toast}</div>}
    </div>
  );

  function canModifySettlement(settlement: Settlement) {
    return Boolean(authUser && settlement.createdByUid === authUser.uid);
  }
}

function CenteredMessage({ message, error = false }: { message: string; error?: boolean }) {
  return (
    <main className="loading-shell grid min-h-screen place-items-center bg-zinc-50 p-6">
      <div className={`max-w-lg rounded-xl border bg-white p-6 text-center text-sm leading-6 shadow-sm ${error ? "border-red-200 text-red-800" : "border-zinc-200 text-zinc-600"}`}>
        <div className="mb-3 text-lg font-bold text-zinc-900">RoomSplit</div>
        {message}
      </div>
    </main>
  );
}

function LoginScreen({
  configured,
  busy,
  error,
  onSignIn,
}: {
  configured: boolean;
  busy: boolean;
  error: string;
  onSignIn: () => void;
}) {
  const [provider, setProvider] = useState<"email" | "phone">("email");
  const [emailMode, setEmailMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const [notice, setNotice] = useState("");
  const recaptchaContainer = useRef<HTMLDivElement>(null);
  const recaptchaVerifier = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => () => recaptchaVerifier.current?.clear(), []);

  async function submitEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!firebaseAuth || !configured) return;
    setAuthBusy(true);
    setLocalError("");
    setNotice("");
    try {
      if (emailMode === "signUp") {
        await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      }
    } catch (authError) {
      setLocalError(authError instanceof Error ? authError.message : "Email sign-in failed.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function resetPassword() {
    if (!firebaseAuth || !email.trim()) {
      setLocalError("Enter your email address first.");
      return;
    }
    setAuthBusy(true);
    setLocalError("");
    setNotice("");
    try {
      await sendPasswordResetEmail(firebaseAuth, email.trim());
      setNotice("Password reset email sent.");
    } catch (authError) {
      setLocalError(authError instanceof Error ? authError.message : "Could not send a reset email.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function sendSmsCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!firebaseAuth || !configured || !recaptchaContainer.current) return;
    if (!/^\+[1-9]\d{7,14}$/.test(phone.trim())) {
      setLocalError("Enter a valid phone number in international format, such as +919876543210.");
      return;
    }
    setAuthBusy(true);
    setLocalError("");
    setNotice("");
    try {
      const verifier = recaptchaVerifier.current || new RecaptchaVerifier(
        firebaseAuth,
        recaptchaContainer.current,
        { size: "normal" },
      );
      recaptchaVerifier.current = verifier;
      const result = await signInWithPhoneNumber(firebaseAuth, phone.trim(), verifier);
      setConfirmation(result);
      setNotice("Verification code sent by SMS.");
    } catch (authError) {
      recaptchaVerifier.current?.clear();
      recaptchaVerifier.current = null;
      setLocalError(authError instanceof Error ? authError.message : "Could not send a verification code.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function verifySmsCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmation) return;
    setAuthBusy(true);
    setLocalError("");
    setNotice("");
    try {
      await confirmation.confirm(smsCode.trim());
    } catch (authError) {
      setLocalError(authError instanceof Error ? authError.message : "The verification code was not accepted.");
    } finally {
      setAuthBusy(false);
    }
  }

  const displayedError = localError || error;

  return (
    <main className="auth-shell grid place-items-center bg-zinc-50 px-5 py-8">
      <section className="auth-card w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="auth-brand-mark mx-auto grid h-14 w-14 place-items-center rounded-2xl"><Home size={24} /></div>
        <p className="mt-5 text-center text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">RoomSplit · shared living</p>
        <h1 className="mt-3 text-center text-2xl font-bold tracking-tight">Feel at home with your expenses.</h1>
        <p className="mt-2 text-center text-sm leading-6 text-zinc-500">Track monthly spending, keep every room organized, and settle up with clarity.</p>
        {displayedError && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{displayedError}</p>}
        {notice && <p role="status" className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
        <div className="mt-6 grid grid-cols-2 rounded-lg bg-zinc-100 p-1">
          <button type="button" onClick={() => {
            recaptchaVerifier.current?.clear();
            recaptchaVerifier.current = null;
            setProvider("email");
            setConfirmation(null);
            setLocalError("");
            setNotice("");
          }} className={`rounded-md py-2 text-sm font-semibold ${provider === "email" ? "bg-white shadow-sm" : "text-zinc-500"}`}>Email</button>
          <button type="button" onClick={() => {
            setProvider("phone");
            setLocalError("");
            setNotice("");
          }} className={`rounded-md py-2 text-sm font-semibold ${provider === "phone" ? "bg-white shadow-sm" : "text-zinc-500"}`}>Phone</button>
        </div>
        {provider === "email" ? (
          <form onSubmit={submitEmail} className="mt-4 grid gap-3">
            <label className="grid gap-1 text-xs font-semibold">Email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="rounded-lg border border-zinc-200 px-3 py-2.5 text-sm font-normal" /></label>
            <label className="grid gap-1 text-xs font-semibold">Password<input required minLength={6} type="password" autoComplete={emailMode === "signUp" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} className="rounded-lg border border-zinc-200 px-3 py-2.5 text-sm font-normal" /></label>
            <button type="submit" disabled={!configured || authBusy} className="rounded-lg bg-zinc-900 py-3 text-sm font-semibold text-white disabled:opacity-50">{authBusy ? "Please wait…" : emailMode === "signUp" ? "Create account with email" : "Sign in with email"}</button>
            <div className="flex items-center justify-between text-xs">
              <button type="button" onClick={() => { setEmailMode(emailMode === "signIn" ? "signUp" : "signIn"); setLocalError(""); }} className="font-semibold text-zinc-700">{emailMode === "signIn" ? "Create an account" : "Already have an account?"}</button>
              {emailMode === "signIn" && <button type="button" disabled={!configured || authBusy} onClick={() => void resetPassword()} className="text-zinc-500 disabled:opacity-50">Forgot password?</button>}
            </div>
          </form>
        ) : (
          <form onSubmit={confirmation ? verifySmsCode : sendSmsCode} className="mt-4 grid gap-3">
            {!confirmation ? (
              <>
                <label className="grid gap-1 text-xs font-semibold">Phone number<input required type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+919876543210" className="rounded-lg border border-zinc-200 px-3 py-2.5 text-sm font-normal" /></label>
                <div ref={recaptchaContainer} />
                <button type="submit" disabled={!configured || authBusy} className="rounded-lg bg-zinc-900 py-3 text-sm font-semibold text-white disabled:opacity-50">{authBusy ? "Sending code…" : "Send SMS code"}</button>
              </>
            ) : (
              <>
                <p className="text-sm text-zinc-600">Enter the verification code sent to {phone}.</p>
                <label className="grid gap-1 text-xs font-semibold">SMS verification code<input required inputMode="numeric" autoComplete="one-time-code" value={smsCode} onChange={(event) => setSmsCode(event.target.value)} className="rounded-lg border border-zinc-200 px-3 py-2.5 text-sm font-normal" /></label>
                <button type="submit" disabled={authBusy} className="rounded-lg bg-zinc-900 py-3 text-sm font-semibold text-white disabled:opacity-50">{authBusy ? "Verifying…" : "Verify phone number"}</button>
                <button type="button" onClick={() => { setConfirmation(null); setSmsCode(""); setNotice(""); }} className="text-xs font-semibold text-zinc-500">Use a different phone number</button>
              </>
            )}
          </form>
        )}
        <div className="my-5 flex items-center gap-3 text-xs text-zinc-400"><span className="h-px flex-1 bg-zinc-200" />or<span className="h-px flex-1 bg-zinc-200" /></div>
        <button type="button" disabled={busy || !configured} onClick={onSignIn} className="flex w-full items-center justify-center gap-3 rounded-lg border border-zinc-300 px-4 py-3 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50">
          <span className="font-bold text-blue-600">G</span>
          {!configured ? "Google sign-in needs Firebase setup" : busy ? "Connecting to Google…" : "Continue with Google"}
        </button>
        <p className="mt-5 text-center text-xs leading-5 text-zinc-400">Phone sign-in requires Phone Authentication and SMS region policy to be configured in Firebase. Room data is only visible to room members.</p>
      </section>
    </main>
  );
}

function RoomSetupScreen({
  authUser,
  profile,
  inviteToken,
  roomName,
  budgetCap,
  busy,
  error,
  onRoomNameChange,
  onBudgetChange,
  onCreate,
  onJoin,
  photoUrl,
  onOpenProfile,
  onSignOut,
}: {
  authUser: User;
  profile: UserProfile;
  inviteToken: string;
  roomName: string;
  budgetCap: string;
  busy: boolean;
  error: string;
  onRoomNameChange: (value: string) => void;
  onBudgetChange: (value: string) => void;
  onCreate: (event: React.FormEvent<HTMLFormElement>) => void;
  onJoin: () => void;
  photoUrl: string | null;
  onOpenProfile: () => void;
  onSignOut: () => void;
}) {
  return (
    <main className="setup-shell min-h-screen bg-zinc-50 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex items-center justify-between">
          <div><h1 className="text-xl font-bold">Welcome, {profile.name || authUser.displayName || "there"}</h1><p className="mt-1 text-sm text-zinc-500">{authUser.email}</p></div>
          <AccountMenu
            displayName={profile.name || authUser.displayName || "Profile"}
            email={authUser.email}
            photoUrl={photoUrl}
            onOpenProfile={onOpenProfile}
            onSignOut={onSignOut}
          />
        </header>
        {error && <p role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
        {inviteToken && (
          <section className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Room invitation</p>
            <h2 className="mt-1 text-lg font-bold">Join your roommate’s room</h2>
            <p className="mt-1 text-sm text-emerald-900/70">Joining adds your account as the second room member. Only two people can join a room.</p>
            <button type="button" disabled={busy} onClick={onJoin} className="mt-4 rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Joining…" : "Join room"}</button>
          </section>
        )}
        <section className="setup-card rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-bold">Create a room</h2>
          <p className="mt-1 text-sm text-zinc-500">Create a shared ledger, then invite one roommate using a private link.</p>
          <form onSubmit={onCreate} className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold sm:col-span-2">Room name<input required maxLength={80} value={roomName} onChange={(event) => onRoomNameChange(event.target.value)} placeholder="e.g. Apartment 204" className="rounded-lg border border-zinc-200 px-3 py-2.5 text-sm font-normal" /></label>
            <label className="grid gap-1 text-xs font-semibold">Monthly budget (INR)<input required type="number" min="0" max="1000000000" value={budgetCap} onChange={(event) => onBudgetChange(event.target.value)} className="rounded-lg border border-zinc-200 px-3 py-2.5 text-sm font-normal" /></label>
            <div className="flex items-end"><button type="submit" disabled={busy} className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Creating…" : "Create room"}</button></div>
          </form>
        </section>
      </div>
    </main>
  );
}

function ProfileModal({
  profile,
  authEmail,
  onClose,
  onSave,
}: {
  profile: UserProfile;
  authEmail: string;
  onClose: () => void;
  onSave: (profile: UserProfile) => void;
}) {
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email || authEmail);
  const [phone, setPhone] = useState(profile.phone);
  const [upiId, setUpiId] = useState(profile.upiId);
  return (
    <Dialog title="Your profile" onClose={onClose}>
      <form className="grid gap-4 p-5" onSubmit={(event) => {
        event.preventDefault();
        onSave({ ...profile, name: name.trim(), email: email.trim(), phone: phone.trim(), upiId: upiId.trim() });
      }}>
        <label className="grid gap-1 text-xs font-semibold">Name<input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-normal" /></label>
        <label className="grid gap-1 text-xs font-semibold">Email<input required maxLength={254} type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-normal" /><span className="font-normal text-zinc-400">Profile contact email; Google sign-in email is managed by Google.</span></label>
        <label className="grid gap-1 text-xs font-semibold">Phone number<input type="tel" maxLength={20} value={phone} onChange={(event) => setPhone(event.target.value)} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-normal" /></label>
        <label className="grid gap-1 text-xs font-semibold">UPI ID<input maxLength={100} value={upiId} onChange={(event) => setUpiId(event.target.value)} placeholder="name@bank" className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-normal" /></label>
        <button type="submit" className="rounded-lg bg-zinc-900 py-3 text-sm font-semibold text-white">Save profile</button>
      </form>
    </Dialog>
  );
}

function Kpi({ label, value, detail, accent }: { label: string; value: string; detail: string; accent?: boolean }) {
  return (
    <article className={`kpi-card ${accent ? "kpi-card-highlight" : ""} rounded-2xl border p-4`}>
      <p className={`text-xs ${accent ? "text-zinc-300" : "text-zinc-500"}`}>{label}</p>
      <p className="mt-2 text-lg font-bold sm:text-2xl">{value}</p>
      <p className={`mt-1 text-xs ${accent ? "text-zinc-300" : "text-zinc-400"}`}>{detail}</p>
    </article>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={title} className="dialog-panel max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h2 className="font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100"><X size={17} /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

function ExpenseModal({
  expense,
  state,
  month,
  authUid,
  busy,
  onClose,
  onSave,
}: {
  expense: Expense | null;
  state: RoomState;
  month: string;
  authUid: string;
  busy: boolean;
  onClose: () => void;
  onSave: (expense: Expense) => void;
}) {
  const [title, setTitle] = useState(expense?.title || "");
  const [amount, setAmount] = useState(expense?.amount?.toString() || "");
  const [date, setDate] = useState(expense?.date || (month === "all" ? getLocalDateString() : `${month}-01`));
  const [category, setCategory] = useState<ExpenseCategoryId>(expense?.category || "vegetables");
  const [split, setSplit] = useState<ExpenseSplit>(expense?.split || "50-50");
  const [note, setNote] = useState(expense?.note || "");

  return (
    <Dialog title={expense ? "Edit Expense" : "Add Expense"} onClose={onClose}>
      <form
        className="grid gap-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          const numericAmount = Number(amount);
          if (!title.trim() || !numericAmount || numericAmount <= 0) return;
          onSave({
            id: expense?.id || createId(),
            title: title.trim(),
            amount: numericAmount,
            date,
            category,
            paidBy: "you",
            paidByUid: authUid,
            split,
            note: note.trim(),
            createdBy: "you",
            createdByUid: expense?.createdByUid || authUid,
          });
        }}
      >
        <VoiceExpenseInput
          onRecognized={(draft) => {
            setTitle(draft.title);
            if (draft.amount) setAmount(draft.amount);
            if (draft.category) setCategory(draft.category);
          }}
        />
        <label className="grid gap-1 text-xs font-semibold">Title<input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-normal" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-xs font-semibold">Amount<input required min="0.01" max="1000000000" step="0.01" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-normal" /></label>
          <label className="grid gap-1 text-xs font-semibold">Date<input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-normal" /></label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-xs font-semibold">Category<select value={category} onChange={(event) => setCategory(event.target.value as ExpenseCategoryId)} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-normal">{CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <div className="grid content-center gap-1 text-xs font-semibold">Paid by<span className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-normal">{state.room.youName} (you)</span></div>
        </div>
        <label className="grid gap-1 text-xs font-semibold">Split<select value={split} onChange={(event) => setSplit(event.target.value as ExpenseSplit)} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-normal"><option value="50-50">50-50</option><option value="100-other">100% other person</option><option value="personal">Personal</option></select></label>
        <label className="grid gap-1 text-xs font-semibold">Note<textarea maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="resize-none rounded-lg border border-zinc-200 px-3 py-2 text-sm font-normal" /></label>
        <button type="submit" disabled={busy} className="rounded-lg bg-zinc-900 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : expense ? "Save changes" : "Add expense"}</button>
      </form>
    </Dialog>
  );
}

function SettingsModal({
  room,
  onClose,
  onSave,
}: {
  room: CloudRoom;
  onClose: () => void;
  onSave: (name: string, budgetCap: number) => void;
}) {
  const [name, setName] = useState(room.name);
  const [budgetCap, setBudgetCap] = useState(room.budgetCap.toString());
  return (
    <Dialog title="Room & Profiles" onClose={onClose}>
      <form className="grid gap-4 p-5" onSubmit={(event) => { event.preventDefault(); onSave(name.trim(), Number(budgetCap)); }}>
        <label className="grid gap-1 text-xs font-semibold">Room name<input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-normal" /></label>
        <label className="grid gap-1 text-xs font-semibold">Monthly budget<input required type="number" min="0" max="1000000000" value={budgetCap} onChange={(event) => setBudgetCap(event.target.value)} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-normal" /></label>
        <p className="text-xs text-zinc-500">Room code: {room.code}. Each roommate manages their own contact and UPI details from Profile.</p>
        <button type="submit" className="rounded-lg bg-zinc-900 py-3 text-sm font-semibold text-white">Save settings</button>
      </form>
    </Dialog>
  );
}

function SettlementModal({
  state,
  balances,
  onClose,
  onSave,
}: {
  state: RoomState;
  balances: ReturnType<typeof calculateBalances>;
  onClose: () => void;
  onSave: (settlement: Settlement) => void;
}) {
  const [amount, setAmount] = useState(balances.net < 0 ? Math.round(Math.abs(balances.net)).toString() : "");
  const [date, setDate] = useState(getLocalDateString());
  const [note, setNote] = useState("");

  const upi = buildUpiUri("you", Number(amount), state.room);

  return (
    <Dialog title="Record payment" onClose={onClose}>
      <form
        className="grid gap-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          const numericAmount = Number(amount);
          if (numericAmount <= 0) return;
          onSave({
            id: createId(),
            from: "you",
            amount: numericAmount,
            date,
            note: note.trim(),
            createdBy: "you",
          });
        }}
      >
        <p className="text-sm leading-6 text-zinc-500">Record a payment you made to your roommate. It will update the balance and appear in both roommates’ payment history.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid content-center gap-1 text-xs font-semibold">Paid by<span className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-normal">{state.room.youName} (you)</span></div>
          <label className="grid gap-1 text-xs font-semibold">Amount<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-normal" /></label>
        </div>
        <label className="grid gap-1 text-xs font-semibold">Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-normal" /></label>
        <label className="grid gap-1 text-xs font-semibold">Note<input value={note} onChange={(event) => setNote(event.target.value)} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-normal" /></label>
        {upi.uri && (
          <div className="grid place-items-center gap-2 rounded-lg bg-zinc-50 p-4">
            <QRCode value={upi.uri} size={124} />
            <p className="text-xs text-zinc-500">UPI: {upi.payeeUpi}</p>
            <a href={upi.uri} className="text-xs font-bold text-zinc-900 underline">Open UPI app</a>
          </div>
        )}
        <button type="submit" className="rounded-lg bg-zinc-900 py-3 text-sm font-semibold text-white">Record payment</button>
      </form>
    </Dialog>
  );
}

function PaymentActions({
  state,
  balances,
  onToast,
}: {
  state: RoomState;
  balances: ReturnType<typeof calculateBalances>;
  onToast: (message: string) => void;
}) {
  const amount = Math.round(Math.abs(balances.net));
  const from: RoomPerspective = balances.net >= 0 ? "friend" : "you";
  const upi = buildUpiUri(from, amount, state.room);
  const recipient = from === "friend" ? state.room.friendName : state.room.youName;
  const recipientPhone = from === "friend" ? state.room.friendPhone : state.room.youPhone;
  const message = `${recipient}, please settle ${formatINR(amount)} for ${state.room.name} via UPI.`;
  const whatsapp = buildWhatsAppUri(recipientPhone, message);

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(upi.uri);
      onToast("UPI link copied");
    } catch {
      onToast("Could not copy UPI link");
    }
  }

  return (
    <div className="mt-4 grid gap-3">
      <div className="grid place-items-center rounded-lg bg-zinc-50 p-4">
        {upi.uri && amount > 0 ? <QRCode value={upi.uri} size={140} /> : <p className="py-12 text-xs text-zinc-400">All settled up</p>}
      </div>
      {upi.uri && (
        <>
          <a href={upi.uri} className="rounded-lg border border-zinc-200 px-3 py-2 text-center text-xs font-semibold">Open UPI app</a>
          <button type="button" onClick={copyInvite} className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold">Copy UPI link</button>
          <a href={whatsapp} target="_blank" rel="noreferrer" className="rounded-lg bg-emerald-700 px-3 py-2 text-center text-xs font-semibold text-white">WhatsApp request</a>
        </>
      )}
    </div>
  );
}
