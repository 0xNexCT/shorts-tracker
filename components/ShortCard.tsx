import { Short, ViewSnapshot } from "@/lib/types";
import { formatCount, formatDate, formatRelative } from "@/lib/format";
import { computeGrowth, formatDuration, GrowthResult } from "@/lib/growth";

function snapTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${d.toLocaleTimeString(
    "en-US",
    { hour: "2-digit", minute: "2-digit", second: "2-digit" }
  )}`;
}

/** Debug tooltip so mismatches are diagnosable from the UI, not just the DB. */
function badgeTitle(result: GrowthResult, snapshotCount: number): string {
  if (!result.latest) return "No snapshots captured yet — waiting for the first hourly capture.";
  const base = `snapshot history: ${snapshotCount} point(s), newest ${formatRelative(
    result.latest.capturedAt
  )}`;
  if (result.status === "collecting_data") {
    return `${base} — not enough history yet (need a snapshot at least 1h older than the newest).`;
  }
  const { compared, gapMs, delta } = result;
  return [
    base,
    `compared: ${compared!.viewCount.toLocaleString("en-US")} views @ ${snapTime(compared!.capturedAt)}`,
    `latest:   ${result.latest.viewCount.toLocaleString("en-US")} views @ ${snapTime(result.latest.capturedAt)}`,
    `gap: ${formatDuration(gapMs!)} · delta: ${delta! > 0 ? "+" : ""}${delta!.toLocaleString("en-US")}`,
  ].join("\n");
}

function GrowthBadge({ result, snapshotCount }: { result: GrowthResult; snapshotCount: number }) {
  const title = badgeTitle(result, snapshotCount);

  switch (result.status) {
    case "collecting_data":
      return (
        <span
          title={title}
          className="cursor-help rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-medium text-gray-400"
        >
          collecting data…
        </span>
      );
    case "growing":
      return (
        <span
          title={title}
          className="inline-flex cursor-help items-center gap-0.5 text-[11px] font-semibold text-emerald-400"
        >
          ▲ {formatCount(result.delta!)} <span className="font-normal text-emerald-600">/hr</span>
        </span>
      );
    case "stale":
      return (
        <span
          title={title}
          className="cursor-help rounded bg-red-950/60 px-1.5 py-0.5 text-[10px] font-semibold text-red-400"
        >
          no growth
        </span>
      );
  }
}

export default function ShortCard({ short }: { short: Short }) {
  const snaps: ViewSnapshot[] = short.viewSnapshots ?? [];
  const result = computeGrowth(snaps);

  const likeRatio =
    short.viewCount > 0
      ? `${((short.likeCount / short.viewCount) * 100).toFixed(2)}%`
      : "N/A";

  return (
    <a
      href={`https://youtube.com/shorts/${short.videoId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-700/60 bg-gray-800/60 transition hover:border-rose-500/60 hover:shadow-lg hover:shadow-rose-500/5"
    >
      <div className="relative aspect-video overflow-hidden bg-gray-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={short.thumbnailUrl}
          alt={short.title}
          loading="lazy"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
        <span
          className={`absolute left-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            short.bucket === "old" ? "bg-indigo-600/90 text-white" : "bg-emerald-600/90 text-white"
          }`}
        >
          {short.bucket === "old" ? "Old" : "Latest"}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <h4 className="line-clamp-2 text-sm font-medium leading-snug text-gray-100 group-hover:text-rose-300">
          {short.title}
        </h4>

        <div className="mt-auto grid grid-cols-3 gap-1.5 text-center">
          <div className="rounded-lg bg-gray-900/80 px-1 py-1.5">
            <div className="text-xs font-bold text-white">{formatCount(short.viewCount)}</div>
            <div className="text-[10px] text-gray-400">views</div>
          </div>
          <div className="rounded-lg bg-gray-900/80 px-1 py-1.5">
            <div className="text-xs font-bold text-white">{formatCount(short.likeCount)}</div>
            <div className="text-[10px] text-gray-400">
              likes · <span className="text-gray-500">{likeRatio}</span>
            </div>
          </div>
          <div className="rounded-lg bg-gray-900/80 px-1 py-1.5">
            <div className="text-xs font-bold text-white">{formatCount(short.commentCount)}</div>
            <div className="text-[10px] text-gray-400">comments</div>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-gray-500">
          <span title={formatDate(short.publishedAt)}>{formatRelative(short.publishedAt)}</span>
          <span className="flex items-center gap-2">
            <GrowthBadge result={result} snapshotCount={snaps.length} />
            <span>updated {formatRelative(short.lastUpdatedAt)}</span>
          </span>
        </div>
      </div>
    </a>
  );
}