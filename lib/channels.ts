import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";
import {
  resolveChannel,
  fetchVideoDetails,
  scanUploadsNewestFirst,
  fetchShortsStats,
  MAX_SHORT_SECONDS,
  MAX_DISCOVERY_ITEMS,
  YouTubeApiError,
} from "./youtube";
import { evaluateChannelAutomation } from "./automation";

const MAX_HANDLES_PER_REQUEST = 20;
// Upper bound (~50 playlist pages) for a single historical-range scan. Guards
// against unbounded pagination while still covering very large ranges.
const MAX_RANGE_ITEMS = 2_500;
const DAY_MS = 86_400_000;

export interface OldRange {
  oldFromDate: Date | null;
  oldToDate: Date | null;
}

export interface ChannelMonitoringResult {
  discovered: number;
  statsUpdated: number;
  snapshotted: number;
}

type Bucket = "old" | "latest";

/**
 * Split a comma-separated input (and/or repeated fields) into unique handles.
 */
export function parseHandles(raw: unknown): string[] {
  const values = Array.isArray(raw) ? raw : [raw];
  const handles = values
    .flatMap((v) => String(v ?? "").split(","))
    .map((h) => h.trim().replace(/^@/, ""))
    .filter(Boolean);

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const h of handles) {
    const key = h.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(h);
    }
  }
  return unique.slice(0, MAX_HANDLES_PER_REQUEST);
}

function parseDateValue(value: unknown): Date | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** Collapse a date to the start of its UTC day (the DATE-column granularity). */
function dayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** The first instant AFTER the last day of `d` (exclusive upper boundary). */
function dayEndExclusive(d: Date): Date {
  return new Date(dayStart(d).getTime() + DAY_MS);
}

/**
 * Parse oldFromDate/oldToDate from a request body. Both dates are required to
 * enable the historical "old" range — if either is missing/invalid, no old
 * videos are pulled in at all (previously old_count = 0).
 */
export function parseOldRange(raw: unknown): OldRange {
  const body = (raw ?? {}) as Record<string, unknown>;
  const from = parseDateValue(body.oldFromDate);
  const to = parseDateValue(body.oldToDate);
  if (!from || !to) return { oldFromDate: null, oldToDate: null };
  return { oldFromDate: dayStart(from), oldToDate: dayStart(to) };
}

/**
 * Apply a PATCH body to a channel's current range. Fields the client omitted
 * keep their current value; clearing either end disables the range entirely.
 */
export function patchOldRange(raw: unknown, current: OldRange): OldRange {
  const body = (raw ?? {}) as Record<string, unknown>;
  let from = current.oldFromDate;
  let to = current.oldToDate;

  if (body.oldFromDate !== undefined) {
    from =
      body.oldFromDate === null || String(body.oldFromDate).trim() === ""
        ? null
        : dayStart(parseDateValue(body.oldFromDate)!);
  }
  if (body.oldToDate !== undefined) {
    to =
      body.oldToDate === null || String(body.oldToDate).trim() === ""
        ? null
        : dayStart(parseDateValue(body.oldToDate)!);
  }

  if (!from || !to) return { oldFromDate: null, oldToDate: null };
  return { oldFromDate: from, oldToDate: to };
}

export function isInvalidRange(range: OldRange): boolean {
  if (!range.oldFromDate || !range.oldToDate) return false;
  return range.oldToDate.getTime() < range.oldFromDate.getTime();
}

/**
 * Resolve a handle and persist the channel row for a specific user, including
 * its historical date range. The compose key (user_id, youtube_channel_id) is
 * unique, so re-adding the same channel under one user simply updates it.
 */
export async function createChannel(userId: string, handleInput: string, range: OldRange) {
  const resolved = await resolveChannel(handleInput);

  const channel = await prisma.channel.upsert({
    where: {
      userId_youtubeChannelId: { userId, youtubeChannelId: resolved.channelId },
    },
    update: {
      handle: resolved.handle,
      uploadsPlaylistId: resolved.uploadsPlaylistId,
      oldFromDate: range.oldFromDate,
      oldToDate: range.oldToDate,
    },
    create: {
      userId,
      youtubeChannelId: resolved.channelId,
      handle: resolved.handle,
      uploadsPlaylistId: resolved.uploadsPlaylistId,
      addedAt: new Date(),
      oldFromDate: range.oldFromDate,
      oldToDate: range.oldToDate,
    },
  });

  return channel;
}

/**
 * Add a single channel (resolve + seed the old video range), without touching
 * the latest bucket — future uploads are discovered by the hourly check.
 */
export async function createChannelWithMonitoring(userId: string, handle: string, range: OldRange) {
  const channel = await createChannel(userId, handle, range);
  const oldSeeded = await seedOldRange(channel);

  const trackedCount = await prisma.short.count({
    where: { channelId: channel.id },
  });

  return { channel, oldSeeded, trackedCount };
}

interface TrackableChannel {
  id: string;
  uploadsPlaylistId: string;
  addedAt: Date;
  oldFromDate: Date | null;
  oldToDate: Date | null;
}

function isShort(v: { durationSeconds: number }): boolean {
  return v.durationSeconds > 0 && v.durationSeconds <= MAX_SHORT_SECONDS;
}

async function storeShort(
  channelId: string,
  v: { videoId: string; title: string; thumbnailUrl: string; publishedAt: string; viewCount: number; likeCount: number; commentCount: number },
  bucket: Bucket,
  now: Date
): Promise<void> {
  await prisma.short.upsert({
    where: { channelId_videoId: { channelId, videoId: v.videoId } },
    update: {
      title: v.title,
      thumbnailUrl: v.thumbnailUrl,
      publishedAt: new Date(v.publishedAt),
      viewCount: v.viewCount,
      likeCount: v.likeCount,
      commentCount: v.commentCount,
      lastUpdatedAt: now,
      bucket,
    },
    create: {
      channelId,
      videoId: v.videoId,
      title: v.title,
      thumbnailUrl: v.thumbnailUrl,
      publishedAt: new Date(v.publishedAt),
      viewCount: v.viewCount,
      likeCount: v.likeCount,
      commentCount: v.commentCount,
      lastUpdatedAt: now,
      bucket,
      addedToMonitoringAt: now,
    },
  });
}

/**
 * Seed the "old" bucket from the channel's historical date range
 * [old_from_date, old_to_date] inclusive. Walks the uploads playlist
 * newest-first, skipping entries newer than the range and stopping as soon as
 * an entry is older than old_from_date. Every video already stored for this
 * channel is skipped (dedupe by video_id — never inserted twice into any
 * bucket). Narrowing the range later never deletes or untracks videos.
 */
export async function seedOldRange(channel: Pick<TrackableChannel, "id" | "uploadsPlaylistId" | "oldFromDate" | "oldToDate">): Promise<number> {
  if (!channel.oldFromDate || !channel.oldToDate) return 0;

  const refs = await scanUploadsNewestFirst(channel.uploadsPlaylistId, {
    publishedWithin: { from: dayStart(channel.oldFromDate), to: dayEndExclusive(channel.oldToDate) },
    maxItems: MAX_RANGE_ITEMS,
  });
  if (refs.length === 0) return 0;

  const details = await fetchVideoDetails(refs.map((r) => r.videoId));
  const shorts = details.filter(isShort);

  const existing = await prisma.short.findMany({
    where: { channelId: channel.id },
    select: { videoId: true },
  });
  const have = new Set(existing.map((e) => e.videoId));

  const now = new Date();
  let added = 0;
  for (const s of shorts) {
    if (have.has(s.videoId)) continue;
    have.add(s.videoId); // avoid in-loop duplicates within this batch
    await storeShort(channel.id, s, "old", now);
    added++;
  }

  return added;
}

/**
 * Discover shorts published after the channel was added (the latest window)
 * and add them to the latest bucket. Skips anything already stored — the
 * (channel_id, video_id) unique constraint enforces this at the DB level.
 */
export async function discoverLatestShorts(channel: Pick<TrackableChannel, "id" | "uploadsPlaylistId" | "addedAt">): Promise<number> {
  const refs = await scanUploadsNewestFirst(channel.uploadsPlaylistId, {
    publishedAfter: channel.addedAt,
    maxItems: MAX_DISCOVERY_ITEMS,
  });
  if (refs.length === 0) return 0;

  const details = await fetchVideoDetails(refs.map((r) => r.videoId));
  const shorts = details.filter(isShort);

  const existing = await prisma.short.findMany({
    where: { channelId: channel.id },
    select: { videoId: true },
  });
  const have = new Set(existing.map((e) => e.videoId));

  const now = new Date();
  let added = 0;
  for (const s of shorts) {
    if (have.has(s.videoId)) continue;
    have.add(s.videoId);
    await storeShort(channel.id, s, "latest", now);
    added++;
  }

  return added;
}

/**
 * Re-fetch live stats for every tracked short on a channel and optionally
 * record a view_snapshots row per short (the hourly history capture).
 */
export async function refreshChannelStats(
  channelId: string,
  captureSnapshots: boolean
): Promise<{ updated: number; snapshotted: number }> {
  const tracked = await prisma.short.findMany({
    where: { channelId },
    select: { id: true, videoId: true },
  });
  if (tracked.length === 0) return { updated: 0, snapshotted: 0 };

  const stats = await fetchShortsStats(tracked.map((s) => s.videoId));
  if (stats.length === 0) return { updated: 0, snapshotted: 0 };

  const byId = new Map(stats.map((s) => [s.videoId, s]));
  const now = new Date();

  let updated = 0;
  const snapshots: { shortId: string; viewCount: number; capturedAt: Date }[] = [];

  for (const row of tracked) {
    const stat = byId.get(row.videoId);
    if (!stat) continue; // video deleted or made private — keep stale stats

    updated++;
    await prisma.short.update({
      where: { channelId_videoId: { channelId, videoId: row.videoId } },
      data: {
        viewCount: stat.viewCount,
        likeCount: stat.likeCount,
        commentCount: stat.commentCount,
        lastUpdatedAt: now,
      },
    });

    if (captureSnapshots) {
      snapshots.push({ shortId: row.id, viewCount: stat.viewCount, capturedAt: now });
    }
  }

  if (snapshots.length > 0) {
    // Dedupe guard: skip any short that already has a snapshot captured in the
    // last 5 minutes, so a cron that fires more than once in the same window
    // (retries, overlapping runs) never floods the history with copies.
    const fiveMinAgo = new Date(now.getTime() - 5 * 60_000);
    const recent = await prisma.viewSnapshot.findMany({
      where: {
        shortId: { in: snapshots.map((s) => s.shortId) },
        capturedAt: { gte: fiveMinAgo },
      },
      select: { shortId: true },
    });
    const recentSet = new Set(recent.map((r) => r.shortId));
    const fresh = snapshots.filter((s) => !recentSet.has(s.shortId));

    if (fresh.length > 0) {
      await prisma.viewSnapshot.createMany({ data: fresh });
    }
    return { updated, snapshotted: fresh.length };
  }

  return { updated, snapshotted: 0 };
}

/**
 * One full monitoring pass for a channel: discover new uploads for the latest
 * bucket, then refresh stats for every tracked short (and snapshot if asked).
 * No caps, no eviction — every video is tracked permanently. Called by the
 * hourly cron (snapshot=true) and the manual refresh endpoints (snapshot=false).
 */
export async function runChannelMonitoring(
  channelId: string,
  opts: { snapshot: boolean }
): Promise<ChannelMonitoringResult> {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new YouTubeApiError("Channel not found.", 404);

  const discovered = await discoverLatestShorts(channel);
  const { updated, snapshotted } = await refreshChannelStats(channel.id, opts.snapshot);

  // SMM automation: auto-buy likes gated by the channel's views threshold.
  await evaluateChannelAutomation(channel.id);

  return { discovered, statsUpdated: updated, snapshotted };
}

/**
 * User-scoped refresh used by the manual "Refresh" endpoints. The channel is
 * located via (id, userId) so a user can never touch another user's channel —
 * even if they guess the id.
 */
export async function refreshChannelMonitoring(
  userId: string,
  channelId: string
): Promise<ChannelMonitoringResult> {
  const channel = await prisma.channel.findUnique({ where: { id: channelId, userId } });
  if (!channel) throw new YouTubeApiError("Channel not found for this user.", 404);
  return runChannelMonitoring(channel.id, { snapshot: false });
}

/**
 * Update a channel's historical date range (used by PATCH). If the range
 * changed, newly-in-range videos are pulled in; nothing is ever deleted or
 * untracked when the range is narrowed.
 */
export async function updateChannelMonitoring(
  userId: string,
  channelId: string,
  next: OldRange,
  autoLikeThreshold?: number | null
) {
  const existing = await prisma.channel.findUnique({ where: { id: channelId, userId } });
  if (!existing) throw new YouTubeApiError("Channel not found for this user.", 404);

  const patch: Prisma.ChannelUpdateInput = {
    oldFromDate: next.oldFromDate,
    oldToDate: next.oldToDate,
  };
  if (autoLikeThreshold !== undefined) {
    patch.autoLikeThreshold = autoLikeThreshold === null ? null : autoLikeThreshold;
  }

  await prisma.channel.update({ where: { id: channelId }, data: patch });

  const oldBackfilled = await seedOldRange({
    id: channelId,
    uploadsPlaylistId: existing.uploadsPlaylistId,
    oldFromDate: next.oldFromDate,
    oldToDate: next.oldToDate,
  });

  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  return { channel: channel!, oldBackfilled };
}

/**
 * Strip the internal userId (== session id) from a channel before sending the
 * API response to the client, so session/user data is never exposed.
 */
export function sanitizeChannel<T extends { userId: string }>(channel: T): Omit<T, "userId"> {
  const rest = { ...channel } as Omit<T, "userId">;
  delete (rest as Record<string, unknown>).userId;
  return rest;
}

export { YouTubeApiError };