// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceExpensePreview } from "./VoiceExpensePreview";

afterEach(cleanup);

describe("VoiceExpensePreview", () => {
  it("shows parsed expense details and waits for an explicit confirmation", () => {
    const onConfirm = vi.fn();
    const onEdit = vi.fn();
    render(
      <VoiceExpensePreview
        title="Doodh / Milk"
        amount="50"
        date="2026-11-25"
        category="groceries"
        payer="Rahul (you)"
        split="50-50"
        note=""
        confirmLabel="Confirm & add expense"
        confirmDisabled={false}
        isSaving={false}
        onEdit={onEdit}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole("region", { name: "Expense preview" })).toHaveTextContent("Doodh / Milk");
    expect(screen.getByRole("region", { name: "Expense preview" })).toHaveTextContent("Rahul (you)");
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    expect(onEdit).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Confirm & add expense" }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("keeps confirmation disabled when the amount still needs attention", () => {
    render(
      <VoiceExpensePreview
        title="Doodh / Milk"
        amount=""
        date="2026-11-25"
        category="groceries"
        payer="Rahul (you)"
        split="50-50"
        note=""
        confirmLabel="Confirm & add expense"
        confirmDisabled
        isSaving={false}
        onEdit={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("Enter an amount")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm & add expense" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit details" })).toBeEnabled();
  });
});
