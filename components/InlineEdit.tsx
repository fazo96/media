"use client";

import { useState } from "react";

/**
 * A title edited where it shows: Enter or leaving the field saves it, Escape
 * cancels. Nothing changed (or nothing left) is a cancel. `onSave` throws to
 * keep the field open (its caller says why).
 */
export function Rename({ initial, label, onSave, onDone }: { initial: string; label: string; onSave: (title: string) => Promise<void>; onDone: () => void }) {
  const [title, setTitle] = useState(initial);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t || t === initial) return onDone();
    try {
      await onSave(t);
      onDone();
    } catch {}
  };
  return (
    <form onSubmit={submit} className="rename">
      <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus aria-label={label} onKeyDown={(e) => e.key === "Escape" && onDone()} onBlur={submit} />
    </form>
  );
}

/** "Delete it?", with the button that does it and one that doesn't (`cancel`). */
export function Confirm({
  question,
  action = "Delete",
  cancel = "Keep",
  onConfirm,
  onCancel,
}: { question: string; action?: string; cancel?: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <span className="confirm">
      <span>{question}</span>
      <button type="button" className="btn btn-danger btn-small" onClick={onConfirm}>
        {action}
      </button>
      <button type="button" className="btn btn-quiet btn-small" onClick={onCancel}>
        {cancel}
      </button>
    </span>
  );
}
