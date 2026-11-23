import type { DemoUser } from "@/src/features/room/types";

export type Settlement = {
  id: string;
  from: DemoUser;
  amount: number;
  date: string;
  note?: string;
  createdBy: DemoUser;
  createdByUid?: string;
  fromUid?: string;
};
