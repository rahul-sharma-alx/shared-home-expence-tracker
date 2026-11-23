import type { Expense, ExpenseCategoryId } from "./types";
import type { Settlement } from "@/src/features/settlements/types";

export type BalanceSummary = {
  totalSpent: number;
  youPaid: number;
  friendPaid: number;
  youShare: number;
  friendShare: number;
  net: number;
};

export function filterExpensesByMonth(
  expenses: Expense[],
  month: "all" | string,
) {
  return expenses
    .filter((expense) => month === "all" || expense.date.startsWith(month))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function calculateBalances(
  expenses: Expense[],
  settlements: Settlement[],
  month: "all" | string = "all",
): BalanceSummary {
  let totalSpent = 0;
  let youPaid = 0;
  let friendPaid = 0;
  let youShare = 0;
  let friendShare = 0;
  let net = 0;

  expenses
    .filter((expense) => month === "all" || expense.date.startsWith(month))
    .forEach((expense) => {
    const amount = Number(expense.amount) || 0;
    totalSpent += amount;
    if (expense.paidBy === "you") youPaid += amount;
    else friendPaid += amount;

    if (expense.split === "50-50") {
      youShare += amount / 2;
      friendShare += amount / 2;
      net += expense.paidBy === "you" ? amount / 2 : -amount / 2;
    } else if (expense.split === "100-other") {
      if (expense.paidBy === "you") {
        friendShare += amount;
        net += amount;
      } else {
        youShare += amount;
        net -= amount;
      }
    } else if (expense.paidBy === "you") {
      youShare += amount;
    } else {
      friendShare += amount;
    }
  });

  settlements.forEach((settlement) => {
    if (month !== "all" && !settlement.date.startsWith(month)) return;
    const amount = Number(settlement.amount) || 0;
    net += settlement.from === "friend" ? -amount : amount;
  });

  return { totalSpent, youPaid, friendPaid, youShare, friendShare, net };
}

export function categoryTotals(expenses: Expense[]) {
  const totals = new Map<ExpenseCategoryId, number>();
  expenses.forEach((expense) => {
    totals.set(expense.category, (totals.get(expense.category) || 0) + expense.amount);
  });
  return totals;
}

export function formatINR(value: number) {
  return `₹${(Number(value) || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

export function buildUpiUri(
  from: "you" | "friend",
  amount: number,
  room: { youName: string; youUpi: string; friendName: string; friendUpi: string },
) {
  const payeeName = from === "friend" ? room.youName : room.friendName;
  const payeeUpi = from === "friend" ? room.youUpi : room.friendUpi;
  if (!payeeUpi) return { uri: "", payeeName, payeeUpi: "Not configured" };
  const uri = `upi://pay?pa=${encodeURIComponent(payeeUpi)}&pn=${encodeURIComponent(payeeName)}&am=${(Number(amount) || 0).toFixed(2)}&cu=INR&tn=${encodeURIComponent("RoomSplit Settlement")}`;
  return { uri, payeeName, payeeUpi };
}

export function buildWhatsAppUri(
  phone: string,
  message: string,
) {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits ? `91${digits.replace(/^91/, "")}` : ""}?text=${encodeURIComponent(message)}`;
}

export function exportFilteredCsv(expenses: Expense[]) {
  const escape = (value: unknown) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = [
    ["Title", "Amount", "Date", "Category", "Paid By", "Split", "Note"],
    ...expenses.map((expense) => [
      expense.title,
      expense.amount,
      expense.date,
      expense.category,
      expense.paidBy,
      expense.split,
      expense.note || "",
    ]),
  ];
  return rows.map((row) => row.map(escape).join(",")).join("\n");
}
