import { CATEGORIES, type ExpenseCategoryId } from "./types";

export type VoiceExpenseDraft = {
  title: string;
  amount: string;
  category: ExpenseCategoryId | null;
  note: string;
};

export function isVoiceExpenseDraft(value: unknown): value is VoiceExpenseDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Record<string, unknown>;

  return typeof draft.title === "string"
    && typeof draft.amount === "string"
    && CATEGORIES.some((category) => category.id === draft.category)
    && typeof draft.note === "string";
}

const categoryKeywords: Array<{ id: ExpenseCategoryId; pattern: RegExp }> = [
  { id: "rent", pattern: /\b(?:rent|lease)\b/i },
  { id: "electricity", pattern: /\b(?:electricity|electric|power bill)\b/i },
  { id: "water", pattern: /\bwater\b/i },
  { id: "vegetables", pattern: /\b(?:vegetables?|veggies|produce)\b/i },
  { id: "groceries", pattern: /\b(?:groceries|grocery|food|supermarket)\b/i },
  { id: "internet", pattern: /\b(?:wi-?fi|internet|broadband)\b/i },
  { id: "gas", pattern: /\b(?:gas|cylinder|lpg)\b/i },
];

export function parseVoiceExpense(transcript: string): VoiceExpenseDraft {
  const amountMatch = transcript.match(
    /(?:₹\s*|rs\.?\s*|inr\s*)?(\d[\d,]*(?:\.\d{1,2})?)(?:\s*(?:rupees?|rs\.?|inr))?/i,
  );
  const numericAmount = amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : 0;
  const amount = Number.isFinite(numericAmount) && numericAmount > 0
    ? String(numericAmount)
    : "";
  const spokenTitle = transcript
    .replace(amountMatch?.[0] || "", " ")
    .replace(/\b(?:i|we|paid|pay|spend|spent|rupees?|rs\.?|inr|for|on|expense|add|amount|the|a|an)\b/gi, " ")
    .replace(/[,.!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    title: spokenTitle || (amount ? "Expense" : transcript.trim()),
    amount,
    category: categoryKeywords.find(({ pattern }) => pattern.test(transcript))?.id || null,
    note: "",
  };
}
