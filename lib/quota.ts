import { prisma } from "./prisma";
import { YouTubeApiError } from "./youtube-error";

/**
 * YouTube Data API v3 unit costs per call type.
 * Source: https://developers.google.com/youtube/v3/getting-started#quota
 */
export const YOUTUBE_API_QUOTA = {
  /** Default daily quota in units. Bump this here if Google ever raises it. */
  dailyTotal: 10_000,
  /** search.list */
  searchList: 100,
  /** channels.list */
  channelsList: 1,
  /** playlistItems.list */
  playlistItemsList: 1,
  /** videos.list */
  videosList: 1,
} as const;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * Offset (in ms) of America/Los_Angeles vs UTC at a given instant,
 * accounting for DST (PDT = -7h, PST = -8h).
 */
function laOffsetMs(ts: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ts));

  const v: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== "literal") v[p.type] = parseInt(p.value, 10);
  }

  const asUtc = Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second);
  return asUtc - ts;
}

/**
 * The most recent midnight (00:00) in America/Los_Angeles, as a Date — this is
 * where the YouTube daily quota window starts.
 */
function currentQuotaDayStart(nowMs: number): Date {
  const [mo, da, ye] = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date(nowMs))
    .filter((p) => p.type !== "literal")
    .map((p) => parseInt(p.value, 10));

  // Noon UTC on that LA date is guaranteed to still be the same LA date.
  const noonUtc = Date.UTC(ye, mo - 1, da, 12);
  const offset = laOffsetMs(noonUtc);
  const midnight = Date.UTC(ye, mo - 1, da, 0, 0, 0) - offset;
  return new Date(midnight);
}

export function formatResetsIn(resetsAtIso: string): string {
  const diff = Math.max(0, new Date(resetsAtIso).getTime() - Date.now());
  const hours = Math.floor(diff / HOUR);
  const minutes = Math.floor((diff % HOUR) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * NOTE: this is a self-tracked estimate based on OUR OWN logged calls, not a
 * live value from Google. It will drift slightly from the number shown in the
 * Cloud Console if quota is changed manually or other apps share the same API
 * key. Used only to give users a friendly pre-emptive gate and display.
 */
export async function getRemainingQuota(): Promise<{
  used: number;
  remaining: number;
  total: number;
  resetsAt: string;
}> {
  const dayStart = currentQuotaDayStart(Date.now());

  const agg = await prisma.apiUsageLog.aggregate({
    where: { createdAt: { gte: dayStart } },
    _sum: { unitsCost: true },
  });

  const used = agg._sum.unitsCost ?? 0;
  const total = YOUTUBE_API_QUOTA.dailyTotal;
  const resetsAt = new Date(dayStart.getTime() + DAY).toISOString();

  return {
    used,
    remaining: Math.max(0, total - used),
    total,
    resetsAt,
  };
}

/**
 * Record one YouTube API call as a usage row. Best-effort: a DB failure here
 * must never break the actual YouTube call it is auditing.
 */
export async function logApiUsage(endpoint: string, unitsCost: number): Promise<void> {
  try {
    await prisma.apiUsageLog.create({ data: { endpoint, unitsCost } });
  } catch (err) {
    console.error("Failed to log API usage:", err);
  }
}

/**
 * Throw before making a call if it would exceed the remaining quota.
 */
export async function assertQuotaAvailable(cost: number): Promise<void> {
  const { remaining, resetsAt } = await getRemainingQuota();
  if (remaining < cost) {
    throw new YouTubeApiError(
      `Daily API quota exhausted, try again after ${formatResetsIn(resetsAt)}.`,
      429,
      "quotaExceeded"
    );
  }
}