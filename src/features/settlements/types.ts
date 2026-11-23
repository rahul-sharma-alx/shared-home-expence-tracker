import type { RoomPerspective } from "@/src/features/room/types";

export type Settlement = {
  id: string;
  from: RoomPerspective;
  amount: number;
  date: string;
  note?: string;
  createdBy: RoomPerspective;
  createdByUid?: string;
  fromUid?: string;
};
