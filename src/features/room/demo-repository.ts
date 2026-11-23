import type { Expense } from "@/src/features/expenses/types";
import type { Settlement } from "@/src/features/settlements/types";
import type { DemoUser, RoomProfile } from "./types";

export type DemoState = {
  room: RoomProfile;
  activeDemoUser: DemoUser;
  expenses: Expense[];
  settlements: Settlement[];
};

export const SAMPLE_STATE: DemoState = {
  room: {
    code: "RM204A",
    name: "Room 204",
    budgetCap: 18000,
    youName: "Rahul",
    youPhone: "9876543210",
    youUpi: "rahul@okaxis",
    friendName: "Aman",
    friendPhone: "9811223344",
    friendUpi: "aman@ybl",
  },
  activeDemoUser: "you",
  expenses: [
    { id: "e1", title: "Monthly Room Rent (Nov)", amount: 9000, category: "rent", paidBy: "you", createdBy: "you", split: "50-50", date: "2026-11-01", note: "Transferred to landlord" },
    { id: "e2", title: "Electricity Bill (BSES)", amount: 1480, category: "electricity", paidBy: "friend", createdBy: "friend", split: "50-50", date: "2026-11-04", note: "Meter reading 4120" },
    { id: "e3", title: "Water Can & Supply Bill", amount: 360, category: "water", paidBy: "you", createdBy: "you", split: "50-50", date: "2026-11-06", note: "6 RO jars + monthly water" },
    { id: "e4", title: "Sabzi Mandi Vegetables", amount: 420, category: "vegetables", paidBy: "friend", createdBy: "friend", split: "50-50", date: "2026-11-09", note: "Potatoes, onions, tomatoes, palak" },
    { id: "e5", title: "Atta, Dal, Rice & Cooking Oil", amount: 1640, category: "groceries", paidBy: "you", createdBy: "you", split: "50-50", date: "2026-11-12", note: "DMart monthly ration" },
    { id: "e6", title: "Airtel Xstream Fiber Wi-Fi", amount: 799, category: "internet", paidBy: "friend", createdBy: "friend", split: "50-50", date: "2026-11-15", note: "Monthly plan" },
    { id: "e7", title: "Milk, Bread, Eggs & Curd", amount: 310, category: "groceries", paidBy: "friend", createdBy: "friend", split: "50-50", date: "2026-11-18", note: "Morning dairy run" },
    { id: "e8", title: "Fresh Vegetables & Coriander", amount: 250, category: "vegetables", paidBy: "you", createdBy: "you", split: "50-50", date: "2026-11-20", note: "Evening market" },
  ],
  settlements: [
    { id: "s1", from: "friend", amount: 2500, date: "2026-11-05", note: "GPay partial rent share", createdBy: "friend" },
  ],
};

export const STORAGE_KEY = "roomsplit_state_v2";

export function loadDemoState(): DemoState {
  if (typeof window === "undefined") return structuredClone(SAMPLE_STATE);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DemoState>;
      if (parsed.room && parsed.expenses && parsed.settlements) {
        return parsed as DemoState;
      }
    }
  } catch {
    // Fall back to the complete demo state when storage is malformed.
  }
  return structuredClone(SAMPLE_STATE);
}

export function saveDemoState(state: DemoState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
