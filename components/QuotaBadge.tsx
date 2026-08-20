import { useEffect, useState } from "react";
import { Quota } from "@/lib/types";
import { formatCount } from "@/lib/format";

function formatResetsIn(resetsAt: string): string {
  const diff = Math.max(0, new Date(resetsAt).getTime() - Date.now());
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return "<1m";
}

export default function QuotaBadge({ quota }: { quota: Quota | null }) {
  const [, setTick] = useState(0);

  // Keep the "resets in Xh Ym" countdown fresh.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!quota) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800/70 px-3 py-1.5 text-right">
        <div className="h-3 w-40 animate-pulse rounded bg-gray-700/70" />
      </div>
    );
  }

  const percent = Math.min(100, Math.round((quota.used / quota.total) * 100));
  const exhausted = quota.remaining <= 0;

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/70 px-3 py-1.5">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium text-gray-400">API Credits</span>
        <span className={exhausted ? "font-semibold text-red-400" : "font-semibold text-white"}>
          {formatCount(quota.remaining)}{" "}
          <span className="font-normal text-gray-500">
            / {formatCount(quota.total)} remaining
          </span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-900">
        <div
          className={`h-full rounded-full transition-all ${
            exhausted ? "bg-red-600" : percent > 80 ? "bg-amber-500" : "bg-emerald-500"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1 text-right text-[11px] text-gray-500">
        {exhausted ? (
          <span className="text-red-400">Exhausted</span>
        ) : (
          <>resets in {formatResetsIn(quota.resetsAt)}</>
        )}
      </p>
    </div>
  );
}