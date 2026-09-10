'use client';

import { useEffect, useId, useRef, useState } from 'react';

export type RationaleChoice = { value: string; label: string; hint?: string };

export type RationaleSubmission = { rationale: string; choice: string };

export type RationaleDialogProps = {
  open: boolean;
  title: string;
  description: string;
  submitLabel: string;
  /** Offered when the action itself is a decision, e.g. the recommendation. */
  choices?: { legend: string; options: RationaleChoice[] };
  pending: boolean;
  /** A refusal from the server. The dialog stays open with the text intact. */
  error: string | null;
  onCancel: () => void;
  onSubmit: (submission: RationaleSubmission) => void;
};

/**
 * The one dialog every rationale-bearing action uses. It is a native modal
 * `<dialog>`, so the page behind it is inert and Escape closes it — no
 * `window.confirm`, and nothing to re-implement per action.
 */
export function RationaleDialog({
  open,
  title,
  description,
  submitLabel,
  choices,
  pending,
  error,
  onCancel,
  onSubmit,
}: RationaleDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const rationaleRef = useRef<HTMLTextAreaElement>(null);
  const defaultChoice = choices?.options[0]?.value ?? '';
  const [rationale, setRationale] = useState('');
  const [choice, setChoice] = useState(defaultChoice);
  const fieldId = useId();

  /**
   * Keyed on `open` alone: a re-render caused by a refusal must leave what the
   * operator typed alone, so only opening the dialog clears the fields.
   */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      // Remembered here rather than on close, when focus has already moved.
      openerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setRationale('');
      setChoice(defaultChoice);
      dialog.showModal();
      // React applies `autoFocus` at mount, so by the time the modal opens the
      // attribute is gone and the first radio would take focus instead.
      rationaleRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      openerRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submittable = rationale.trim().length > 0 && !pending;

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
      className="m-auto w-[28rem] rounded-lg border border-slate-200 p-0 text-sm shadow-xl backdrop:bg-slate-900/30"
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (submittable) onSubmit({ rationale: rationale.trim(), choice });
        }}
        className="space-y-3 p-4"
      >
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>

        {choices && (
          <fieldset className="space-y-1">
            <legend className="text-xs font-medium text-slate-600">{choices.legend}</legend>
            {choices.options.map((option) => (
              <label key={option.value} className="flex items-baseline gap-2 text-xs">
                <input
                  type="radio"
                  name={`${fieldId}-choice`}
                  value={option.value}
                  checked={choice === option.value}
                  onChange={() => setChoice(option.value)}
                  disabled={pending}
                />
                <span>
                  {option.label}
                  {option.hint && <span className="text-slate-500"> — {option.hint}</span>}
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">Rationale</span>
          <textarea
            ref={rationaleRef}
            rows={4}
            value={rationale}
            disabled={pending}
            onChange={(event) => setRationale(event.target.value)}
            placeholder="Record why this decision is being made."
            className="w-full rounded-md border border-slate-300 p-2 text-xs disabled:bg-slate-50"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-md px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!submittable}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {pending ? 'Submitting…' : submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
