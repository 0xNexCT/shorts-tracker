import { useState } from "react";
import { Channel, SortKey, Short } from "@/lib/types";
import ShortCard from "./ShortCard";
import { formatRelative } from "@/lib/format";

export interface ChannelRangeEdit {
  oldFromDate: string;
  oldToDate: string;
  autoLikeThreshold: number | null;
}

interface Props {
  channel: Channel;
  sortBy: SortKey;
  refreshing: boolean;
  removing: boolean;
  saving: boolean;
  quotaExhausted: boolean;
  onRefresh: (id: string) => void;
  onRemove: (id: string) => void;
  onSave: (id: string, range: ChannelRangeEdit) => Promise<void>;
}

function sortShorts(shorts: Short[], key: SortKey): Short[] {
  const copy = [...shorts];
  switch (key) {
    case "views":
      return copy.sort((a, b) => b.viewCount - a.viewCount);
    case "likes":
      return copy.sort((a, b) => b.likeCount - a.likeCount);
    case "comments":
      return copy.sort((a, b) => b.commentCount - a.commentCount);
    case "published":
    default:
      return copy.sort(
        (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );
  }
}

function channelUrl(channel: Channel): string {
  const name = channel.handle.replace(/^@/, "");
  if (name.startsWith("UC") && name.length === 24) {
    return `https://youtube.com/channel/${channel.youtubeChannelId}`;
  }
  return `https://youtube.com/@${name}`;
}

function rangeLabel(withSession: Channel): string {
  if (!withSession.oldFromDate || !withSession.oldToDate) return "no historical range";
  return `historical ${withSession.oldFromDate.slice(0, 10)} → ${withSession.oldToDate.slice(0, 10)}`;
}

function BucketSection({
  label,
  badge,
  shorts,
  totalViews,
}: {
  label: string;
  badge: string;
  shorts: Short[];
  totalViews: number;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${badge}`}>{label}</span>
          {shorts.length} short{shorts.length === 1 ? "" : "s"}
        </h3>
        <span className="text-[11px] text-gray-600">{totalViews.toLocaleString("en-US")} views</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shorts.map((s) => (
          <ShortCard key={s.videoId} short={s} />
        ))}
      </div>
    </div>
  );
}

export default function ChannelCard({
  channel,
  sortBy,
  refreshing,
  removing,
  saving,
  quotaExhausted,
  onRefresh,
  onRemove,
  onSave,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [fromDraft, setFromDraft] = useState(channel.oldFromDate?.slice(0, 10) ?? "");
  const [toDraft, setToDraft] = useState(channel.oldToDate?.slice(0, 10) ?? "");
  const [thresholdDraft, setThresholdDraft] = useState(
    channel.autoLikeThreshold != null ? String(channel.autoLikeThreshold) : ""
  );

  const latest = channel.shorts.filter((s) => s.bucket === "latest");
  const old = channel.shorts.filter((s) => s.bucket === "old");
  const sortedLatest = sortShorts(latest, sortBy);
  const sortedOld = sortShorts(old, sortBy);
  const totalViews = (arr: Short[]) => arr.reduce((sum, s) => sum + s.viewCount, 0);

  const rangeConflict = Boolean(fromDraft) && Boolean(toDraft) && toDraft < fromDraft;

  async function handleSave() {
    if (rangeConflict) return;
    const trimmed = thresholdDraft.trim();
    const threshold = trimmed === "" ? null : Number(trimmed);
    if (threshold !== null && (!Number.isFinite(threshold) || threshold < 0)) return;
    await onSave(channel.id, { oldFromDate: fromDraft, oldToDate: toDraft, autoLikeThreshold: threshold });
    setEditing(false);
  }

  return (
    <section className="rounded-2xl border border-gray-700/60 bg-gray-900/60 p-5 shadow-xl">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <a
            href={channelUrl(channel)}
            target="_blank"
            rel="noopener noreferrer"
            title="Open channel on YouTube"
            className="inline-block text-xl font-bold text-white transition hover:text-rose-400 hover:underline"
          >
            {channel.handle}
          </a>
          <p className="mt-0.5 text-xs text-gray-500">
            {channel.shorts.length} shorts · {rangeLabel(channel)} · added{" "}
            {formatRelative(channel.addedAt)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onRefresh(channel.id)}
            disabled={refreshing || removing || quotaExhausted}
            title={quotaExhausted ? "Daily API quota exhausted" : undefined}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800/80 px-3.5 py-2 text-xs font-semibold text-gray-200 transition hover:border-rose-500 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refreshing ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-500 border-t-rose-400" />
                Refreshing…
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </>
            )}
          </button>
          <button
            onClick={() => {
              setFromDraft(channel.oldFromDate?.slice(0, 10) ?? "");
              setToDraft(channel.oldToDate?.slice(0, 10) ?? "");
              setThresholdDraft(
                channel.autoLikeThreshold != null ? String(channel.autoLikeThreshold) : ""
              );
              setEditing((v) => !v);
            }}
            disabled={removing || refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-600 bg-gray-800/80 px-3 py-2 text-xs font-semibold text-gray-200 transition hover:border-sky-500 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-500 border-t-sky-400" />
                Saving…
              </>
            ) : (
              <>Edit</>
            )}
          </button>
          <button
            onClick={() => onRemove(channel.id)}
            disabled={removing || refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-900/70 bg-red-950/40 px-3 py-2 text-xs font-semibold text-red-300 transition hover:border-red-600 hover:bg-red-900/40 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {removing ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-900 border-t-red-400" />
                Removing…
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Remove
              </>
            )}
          </button>
        </div>
      </header>

      {editing && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-sky-900/60 bg-sky-950/30 px-4 py-3">
          <label className="flex flex-col gap-1 text-xs text-gray-400">
            Old videos from
            <input
              type="date"
              value={fromDraft}
              onChange={(e) => setFromDraft(e.target.value)}
              className="rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-sm text-white outline-none focus:border-sky-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-400">
            Old videos to
            <input
              type="date"
              value={toDraft}
              onChange={(e) => setToDraft(e.target.value)}
              className="rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-sm text-white outline-none focus:border-sky-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-400">
            Auto-like views threshold
            <input
              type="number"
              min={0}
              value={thresholdDraft}
              onChange={(e) => setThresholdDraft(e.target.value)}
              placeholder="800"
              className="w-28 rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-sm text-white outline-none focus:border-sky-500"
            />
          </label>
          <button
            onClick={handleSave}
            disabled={rangeConflict || saving}
            className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            disabled={saving}
            className="rounded-lg border border-gray-600 px-4 py-2 text-xs font-semibold text-gray-300 transition hover:border-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <p className="text-[11px] text-gray-500">
            {rangeConflict
              ? "Old videos to must be on or after Old videos from."
              : "Videos published within the range are pulled in as \"Old\". Clearing the range keeps existing videos but stops old backfills; narrowing never untracks anything. Leave the auto-like threshold blank to disable auto-buying for this channel."}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-5">
        <BucketSection
          label="Latest"
          badge="bg-emerald-600/90 text-white"
          shorts={sortedLatest}
          totalViews={totalViews(latest)}
        />
        <BucketSection
          label="Old"
          badge="bg-indigo-600/90 text-white"
          shorts={sortedOld}
          totalViews={totalViews(old)}
        />
      </div>
    </section>
  );
}