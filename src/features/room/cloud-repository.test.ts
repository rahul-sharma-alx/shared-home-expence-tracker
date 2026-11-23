import { describe, expect, it } from "vitest";
import {
  mapCloudExpense,
  mapCloudSettlement,
  toDemoState,
  type CloudRoom,
  type RoomMember,
} from "./cloud-repository";
import type { Expense } from "@/src/features/expenses/types";
import type { Settlement } from "@/src/features/settlements/types";

const room: CloudRoom = {
  id: "room-id",
  code: "ROOM01",
  name: "Apartment",
  budgetCap: 18000,
  ownerUid: "uid-owner",
  roommateUid: "uid-roommate",
  inviteToken: "secret-token",
};

const members: RoomMember[] = [
  { uid: "uid-owner", name: "Owner", phone: "111", upiId: "owner@upi", role: "owner" },
  { uid: "uid-roommate", name: "Roommate", phone: "222", upiId: "roommate@upi", role: "roommate" },
];

const expense: Expense = {
  id: "expense-id",
  title: "Groceries",
  amount: 500,
  date: "2026-11-01",
  category: "groceries",
  split: "50-50",
  paidBy: "friend",
  createdBy: "friend",
  paidByUid: "uid-roommate",
  createdByUid: "uid-roommate",
};

const settlement: Settlement = {
  id: "settlement-id",
  from: "friend",
  amount: 100,
  date: "2026-11-02",
  createdBy: "friend",
  createdByUid: "uid-roommate",
  fromUid: "uid-roommate",
};

describe("roommate perspective mapping", () => {
  it("maps shared records relative to the signed-in user", () => {
    const ownerView = toDemoState(room, members, [expense], [settlement], "uid-owner");
    const roommateView = toDemoState(room, members, [expense], [settlement], "uid-roommate");

    expect(ownerView.room.youName).toBe("Owner");
    expect(ownerView.expenses[0].createdBy).toBe("friend");
    expect(roommateView.room.youName).toBe("Roommate");
    expect(roommateView.expenses[0].createdBy).toBe("you");
    expect(roommateView.settlements[0].createdByUid).toBe("uid-roommate");
  });
});

describe("cloud record validation", () => {
  it("maps valid expense data and preserves roommate perspective", () => {
    const mapped = mapCloudExpense("expense-id", {
      title: "Groceries",
      amount: 500,
      date: "2026-11-01",
      category: "groceries",
      split: "50-50",
      note: "Weekly shop",
      paidByUid: "uid-roommate",
      createdByUid: "uid-roommate",
    }, "uid-owner");

    expect(mapped).toMatchObject({
      id: "expense-id",
      title: "Groceries",
      amount: 500,
      paidBy: "friend",
      createdBy: "friend",
    });
  });

  it("rejects malformed expenses and settlements", () => {
    expect(mapCloudExpense("bad-expense", {
      title: "",
      amount: -1,
      date: "2026-11-01",
      category: "groceries",
      split: "50-50",
      paidByUid: "uid-owner",
      createdByUid: "uid-owner",
    }, "uid-owner")).toBeNull();

    expect(mapCloudSettlement("bad-settlement", {
      amount: Number.NaN,
      date: "2026-11-02",
      fromUid: "uid-owner",
      createdByUid: "uid-owner",
    }, "uid-owner")).toBeNull();
  });
});
