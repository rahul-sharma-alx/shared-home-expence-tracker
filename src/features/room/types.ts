import type { Expense } from "@/src/features/expenses/types";
import type { Settlement } from "@/src/features/settlements/types";

export type RoomPerspective = "you" | "friend";

export type RoomProfile = {
  code: string;
  name: string;
  budgetCap: number;
  youName: string;
  youPhone: string;
  youUpi: string;
  friendName: string;
  friendPhone: string;
  friendUpi: string;
};

export type RoomState = {
  room: RoomProfile;
  expenses: Expense[];
  settlements: Settlement[];
};
