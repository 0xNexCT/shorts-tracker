import { useState, FormEvent } from "react";
import { AddChannelResult } from "@/lib/types";

export interface ChannelRangeInput {
  oldFromDate: string;
  oldToDate: string;
}

interface Props {
  onAdd: (input: string, range: ChannelRangeInput) => Promise<AddChannelResult[]>;
  disabled?: boolean;
}

export default function AddChannelForm({ onAdd, disabled = false }: Props) {
  const [input, setInput] = useState("");
  const [oldFromDate, setOldFromDate] = useState("");
  const [oldToDate, setOldToDate] = useState("");
  const [adding, setAdding] = useState(false);
  const [results, setResults] = useState<AddChannelResult[] | null>(null);

  const hasRange = Boolean(oldFromDate) && Boolean(oldToDate);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || adding) return;

    setAdding(true);
    setResults(null);
    try {
      const res = await onAdd(input, { oldFromDate, oldToDate });
      setResults(res);
      const allOk = res.every((r) => r.status === "ok");
      if (allOk) {
        setInput("");
        setOldFromDate("");
        setOldToDate("");
      }
    } finally {
      setAdding(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add channels… e.g. @mrbeast, @veritasium"
          disabled={adding || disabled}
          className="w-full flex-1 rounded-lg border border-gray-700 bg-gray-800/70 px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none transition focus:border-rose-500"
        />
        <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-1.5">
          <label className="flex flex-col gap-0.5 text-xs text-gray-500">
            Old videos from
            <input
              type="date"
              value={oldFromDate}
              onChange={(e) => setOldFromDate(e.target.value)}
              disabled={adding || disabled}
              className="rounded-md border border-gray-700 bg-gray-900 px-1.5 py-1 text-xs text-white outline-none focus:border-rose-500"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-xs text-gray-500">
            to
            <input
              type="date"
              value={oldToDate}
              onChange={(e) => setOldToDate(e.target.value)}
              disabled={adding || disabled}
              className="rounded-md border border-gray-700 bg-gray-900 px-1.5 py-1 text-xs text-white outline-none focus:border-rose-500"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={adding || disabled || !input.trim()}
          title={
            hasRange && oldToDate < oldFromDate
              ? "Old videos to must be on or after Old videos from"
              : undefined
          }
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {adding && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          )}
          {adding ? "Adding…" : "+ Add"}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-gray-500">
        Leave the date range empty to skip historical videos — only new uploads will be tracked. To
        backfill a window of older videos, pick both dates (inclusive).
      </p>

      {results && results.length > 0 && (
        <div className="mt-2 space-y-1">
          {results.map((r) => (
            <div
              key={r.handle}
              className={`rounded-lg px-3 py-1.5 text-xs ${
                r.status === "ok"
                  ? "bg-emerald-900/40 text-emerald-300"
                  : "bg-red-900/40 text-red-300"
              }`}
            >
              {r.status === "ok"
                ? `${r.handle} added — ${r.trackedCount ?? 0} shorts tracked${
                    r.oldSeeded ? ` (${r.oldSeeded} historical)` : ""
                  }`
                : `${r.handle}: ${r.error}`}
            </div>
          ))}
        </div>
      )}
    </form>
  );
}