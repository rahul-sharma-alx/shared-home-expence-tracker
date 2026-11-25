import { describe, expect, it } from "vitest";
import { parseVoiceExpense } from "./voice-entry";

describe("parseVoiceExpense", () => {
  it("extracts a title, rupee amount, and matching category", () => {
    expect(parseVoiceExpense("I paid Rs 1,250 for groceries")).toEqual({
      title: "groceries",
      amount: "1250",
      category: "groceries",
      note: "",
    });
  });

  it("keeps the transcript title when no amount was recognized", () => {
    expect(parseVoiceExpense("Wi-Fi bill")).toEqual({
      title: "Wi-Fi bill",
      amount: "",
      category: "internet",
      note: "",
    });
  });

  it("uses a safe title when only an amount was recognized", () => {
    expect(parseVoiceExpense("500 rupees")).toEqual({
      title: "Expense",
      amount: "500",
      category: null,
      note: "",
    });
  });
});
