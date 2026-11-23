import type { RoomPerspective } from "@/src/features/room/types";

export type ExpenseCategoryId =
  | "rent"
  | "electricity"
  | "water"
  | "vegetables"
  | "groceries"
  | "internet"
  | "gas"
  | "other";

export type ExpenseSplit = "50-50" | "100-other" | "personal";

export type Expense = {
  id: string;
  title: string;
  amount: number;
  date: string;
  category: ExpenseCategoryId;
  paidBy: RoomPerspective;
  split: ExpenseSplit;
  note?: string;
  createdBy: RoomPerspective;
  createdByUid?: string;
  paidByUid?: string;
  updatedAt?: string;
};

export const CATEGORIES: Array<{
  id: ExpenseCategoryId;
  name: string;
  color: string;
}> = [
  { id: "rent", name: "Room Rent", color: "#18181B" },
  { id: "electricity", name: "Electricity Bill", color: "#D97706" },
  { id: "water", name: "Water Bill", color: "#0284C7" },
  { id: "vegetables", name: "Vegetables", color: "#0F766E" },
  { id: "groceries", name: "Groceries", color: "#4F46E5" },
  { id: "internet", name: "Wi-Fi / Internet", color: "#9333EA" },
  { id: "gas", name: "Gas / Cylinder", color: "#C2410C" },
  { id: "other", name: "Other", color: "#71717A" },
];
