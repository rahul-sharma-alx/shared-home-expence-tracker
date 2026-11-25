import { CATEGORIES, type ExpenseCategoryId, type ExpenseSplit } from "../features/expenses/types";
import { formatINR } from "../features/expenses/calculations";

const splitLabels: Record<ExpenseSplit, string> = {
  "50-50": "50-50",
  "100-other": "100% other person",
  personal: "Personal",
};

export function VoiceExpensePreview({
  title,
  amount,
  date,
  category,
  payer,
  split,
  note,
  confirmLabel,
  confirmDisabled,
  isSaving,
  onEdit,
  onConfirm,
}: {
  title: string;
  amount: string;
  date: string;
  category: ExpenseCategoryId;
  payer: string;
  split: ExpenseSplit;
  note: string;
  confirmLabel: string;
  confirmDisabled: boolean;
  isSaving: boolean;
  onEdit: () => void;
  onConfirm: () => void;
}) {
  const numericAmount = Number(amount);
  const categoryName = CATEGORIES.find((item) => item.id === category)?.name || "Other";

  return (
    <section aria-label="Expense preview" className="grid gap-3 rounded-xl border border-teal-300/30 bg-teal-50/10 p-4">
      <div>
        <h3 className="text-sm font-bold text-zinc-100">Review voice expense</h3>
        <p className="mt-1 text-xs text-zinc-400">Check the details before adding it to this room.</p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
        <div className="col-span-2">
          <dt className="text-zinc-400">Title</dt>
          <dd className="mt-1 break-words font-semibold text-zinc-100">{title || "Not recognized"}</dd>
        </div>
        <div>
          <dt className="text-zinc-400">Amount</dt>
          <dd className="mt-1 font-semibold text-zinc-100">
            {Number.isFinite(numericAmount) && numericAmount > 0 ? formatINR(numericAmount) : "Enter an amount"}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-400">Category</dt>
          <dd className="mt-1 font-semibold text-zinc-100">{categoryName}</dd>
        </div>
        <div>
          <dt className="text-zinc-400">Date</dt>
          <dd className="mt-1 font-semibold text-zinc-100">{date}</dd>
        </div>
        <div>
          <dt className="text-zinc-400">Paid by</dt>
          <dd className="mt-1 font-semibold text-zinc-100">{payer}</dd>
        </div>
        <div>
          <dt className="text-zinc-400">Split</dt>
          <dd className="mt-1 font-semibold text-zinc-100">{splitLabels[split]}</dd>
        </div>
        {note && (
          <div className="col-span-2">
            <dt className="text-zinc-400">Note</dt>
            <dd className="mt-1 break-words font-semibold text-zinc-100">{note}</dd>
          </div>
        )}
      </dl>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onEdit}
          disabled={isSaving}
          className="rounded-lg border border-zinc-600 px-4 py-2.5 text-sm font-semibold text-zinc-200 disabled:opacity-50"
        >
          Edit details
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmDisabled}
          className="rounded-lg bg-teal-300 px-4 py-2.5 text-sm font-bold text-zinc-950 disabled:opacity-50"
        >
          {confirmLabel}
        </button>
      </div>
    </section>
  );
}
