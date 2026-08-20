import { ViewSnapshot } from "./types";

export const HOUR_MS = 3_600_000;

export type GrowthStatus = "collecting_data" | "growing" | "stale";

export interface GrowthResult {
  status: GrowthStatus;
  /** The newest snapshot (basis of the comparison). */
  latest?: ViewSnapshot;
  /** The closest snapshot that is at least 1 hour older than `latest`. */
  compared?: ViewSnapshot;
  /** Actual elapsed time between `compared` and `latest`. */
  gapMs?: number;
  /** latest.view_count - compared.view_count (over `gapMs`). */
  delta?: number;
}

/**
 * Hourly view-growth state for ONE tracked video.
 *
 * Rule (applies to every bucket — old and latest — identically):
 *  1. `latest`  = the most recent snapshot.
 *  2. `compared` = the closest snapshot whose captured_at is >= 1 hour older
 *     than `latest` (snapshots are newest-first, so it is the first entry at or
 *     before the 1-hour-ago mark, not "any snapshot roughly an hour old").
 *  3. If no such snapshot exists (the video's history is under 1 hour), the
 *     status is always `collecting_data` — never stale/growing.
 *  4. Otherwise the raw view delta over the actual gap is used: positive ->
 *     `growing`, zero/negative -> `stale`. The gap is exposed for debugging
 *     (the "per hour" label is approximate when the gap isn't exactly 1h).
 */
export function computeGrowth(snapshots: ViewSnapshot[] = []): GrowthResult {
  if (snapshots.length === 0) return { status: "collecting_data" };

  const latest = snapshots[0];
  const cutoffMs = new Date(latest.capturedAt).getTime() - HOUR_MS;
  const compared = snapshots.find(
    (s) => new Date(s.capturedAt).getTime() <= cutoffMs
  );

  if (!compared) return { status: "collecting_data", latest };

  const gapMs = new Date(latest.capturedAt).getTime() - new Date(compared.capturedAt).getTime();
  const delta = latest.viewCount - compared.viewCount;

  if (delta > 0) return { status: "growing", latest, compared, gapMs, delta };
  return { status: "stale", latest, compared, gapMs, delta };
}

/** e.g. 5400000 -> "1h 30m", 120000 -> "2m", 45000 -> "45s". */
export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return `${Math.max(1, Math.round(ms / 1000))}s`;
}