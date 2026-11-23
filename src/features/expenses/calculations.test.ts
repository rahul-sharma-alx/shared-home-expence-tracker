import { describe, expect, it } from "vitest";
import { calculateBalances, exportFilteredCsv, filterExpensesByMonth } from "./calculations";
import type { Expense } from "./types";
import type { Settlement } from "@/src/features/settlements/types";

const expenses: Expense[] = [
  { id: "1", title: "Rent", amount: 1000, date: "2026-11-01", category: "rent", paidBy: "you", split: "50-50", createdBy: "you" },
  { id: "2", title: "Other", amount: 600, date: "2026-11-02", category: "other", paidBy: "friend", split: "100-other", createdBy: "friend" },
  { id: "3", title: "Personal", amount: 200, date: "2026-10-01", category: "groceries", paidBy: "you", split: "personal", createdBy: "you" },
];

describe("expense calculations", () => {
  it("calculates 50-50 splits", () => {
    const result = calculateBalances([expenses[0]], []);
    expect(result.totalSpent).toBe(1000);
    expect(result.youShare).toBe(500);
    expect(result.friendShare).toBe(500);
    expect(result.net).toBe(500);
  });

  it("assigns 100-other to the person who did not pay", () => {
    const result = calculateBalances([expenses[1]], []);
    expect(result.youShare).toBe(600);
    expect(result.friendShare).toBe(0);
    expect(result.net).toBe(-600);
  });

  it("applies monthly settlements only in their period", () => {
    const settlements: Settlement[] = [
      { id: "s1", from: "friend", amount: 250, date: "2026-11-05", createdBy: "friend" },
    ];
    expect(calculateBalances(expenses, settlements, "2026-11").net).toBe(-350);
    expect(calculateBalances(expenses, settlements, "2026-10").net).toBe(0);
  });

  it("filters by month and exports only the supplied rows", () => {
    expect(filterExpensesByMonth(expenses, "2026-11")).toHaveLength(2);
    const csv = exportFilteredCsv([expenses[0]]);
    expect(csv).toContain('"Rent"');
    expect(csv).toContain('"1000"');
  });
});
