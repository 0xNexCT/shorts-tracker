const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_BASE =
  process.env.YOUTUBE_API_BASE ?? "https://www.googleapis.com/youtube/v3";

export { YouTubeApiError } from "./youtube-error";
import { YouTubeApiError } from "./youtube-error";
import { YOUTUBE_API_QUOTA, assertQuotaAvailable, logApiUsage } from "./quota";

/**
 * Maps our API paths to the YouTube endpoint name + unit cost for quota logging.
 */
const ENDPOINT_USAGE: Record<string, { endpoint: string; units: number }> = {
  "/channels": { endpoint: "channels.list", units: YOUTUBE_API_QUOTA.channelsList },
  "/search": { endpoint: "search.list", units: YOUTUBE_API_QUOTA.searchList },
  "/playlistItems": { endpoint: "playlistItems.list", units: YOUTUBE_API_QUOTA.playlistItemsList },
  "/videos": { endpoint: "videos.list", units: YOUTUBE_API_QUOTA.videosList },
};

export interface ResolvedChannel {
  channelId: string;
  handle: string;
  uploadsPlaylistId: string;
  title: string;
}

function missingKey(): never {
  throw new YouTubeApiError(
    "YouTube API key is not configured. Set YOUTUBE_API_KEY in your environment.",
    500,
    "apiKeyNotConfigured"
  );
}

async function fetchYouTube<T>(path: string, params: Record<string, string>): Promise<T> {
  if (!YOUTUBE_API_KEY) missingKey();

  const usage = ENDPOINT_USAGE[path];
  if (usage) {
    // Block pre-emptively if this call would exceed our remaining self-tracked quota.
    await assertQuotaAvailable(usage.units);
  }

  const url = new URL(`${YOUTUBE_API_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set("key", YOUTUBE_API_KEY as string);

  const res = await fetch(url.toString(), { cache: "no-store" });

  // The call hit Google (key was present) — record it for quota tracking,
  // regardless of the HTTP status.
  if (usage) {
    await logApiUsage(usage.endpoint, usage.units);
  }

  if (!res.ok) {
    let message = `YouTube API error (${res.status})`;
    let code: string | undefined;
    let reason: string | undefined;
    try {
      const body = await res.json();
      code = body?.error?.errors?.[0]?.reason;
      reason = body?.error?.message;
      if (reason) message = reason;
    } catch {
      // ignore JSON parse failure
    }

    if (res.status === 403 && code === "quotaExceeded") {
      throw new YouTubeApiError(
        "YouTube API quota exceeded. Try again later (the daily quota resets around midnight PT).",
        res.status,
        code,
        reason
      );
    }
    if (res.status === 404) {
      throw new YouTubeApiError("Channel not found on YouTube.", 404, code, reason);
    }
    throw new YouTubeApiError(message, res.status, code, reason);
  }

  return (await res.json()) as T;
}

interface ChannelsListResponse {
  items?: Array<{
    id: string;
    snippet?: { title?: string };
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  }>;
}

interface SearchListResponse {
  items?: Array<{ id?: { channelId?: string }; snippet?: { channelTitle?: string } }>;
}

/**
 * Resolve a YouTube handle (@username or bare username) to a channel ID.
 * Tries the channels.list forHandle endpoint, then falls back to search.list.
 */
export async function resolveChannel(input: string): Promise<ResolvedChannel> {
  const handle = input.trim().replace(/^@/, "");
  if (!handle) {
    throw new YouTubeApiError("Please provide a username or handle.", 400);
  }

  // 1. channels.list with forHandle (exact handle match)
  try {
    const channels = await fetchYouTube<ChannelsListResponse>("/channels", {
      part: "snippet,contentDetails",
      forHandle: `@${handle}`,
    });

    const channel = channels.items?.[0];
    const uploadsId = channel?.contentDetails?.relatedPlaylists?.uploads;
    if (channel && uploadsId) {
      return {
        channelId: channel.id,
        handle: `@${handle}`,
        uploadsPlaylistId: uploadsId,
        title: channel.snippet?.title ?? handle,
      };
    }
  } catch (err) {
    // For 403/other hard errors, propagate. For "no result" we fall through.
    if (err instanceof YouTubeApiError && err.status !== 404) throw err;
  }

  // 2. Fallback: search.list, pick the top channel match
  const search = await fetchYouTube<SearchListResponse>("/search", {
    part: "snippet",
    type: "channel",
    q: handle,
    maxResults: "5",
  });

  const match = search.items?.find((item) => {
    const title = item.snippet?.channelTitle?.toLowerCase() ?? "";
    const channelId = item.id?.channelId ?? "";
    return (
      title === handle.toLowerCase() ||
      title.includes(handle.toLowerCase()) ||
      channelId === handle
    );
  });

  const channelId = match?.id?.channelId;
  if (!channelId) {
    throw new YouTubeApiError(
      `Could not find a YouTube channel for "${input}". Check the handle and try again.`,
      404
    );
  }

  // Re-resolve via channels.list to get the uploads playlist id
  const channels = await fetchYouTube<ChannelsListResponse>("/channels", {
    part: "contentDetails,snippet",
    id: channelId,
  });
  const channel = channels.items?.[0];
  const uploadsId = channel?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsId) {
    throw new YouTubeApiError("Channel has no uploads playlist.", 404);
  }

  return {
    channelId,
    handle: `@${handle}`,
    uploadsPlaylistId: uploadsId,
    title: channel.snippet?.title ?? handle,
  };
}

interface PlaylistItemsListResponse {
  nextPageToken?: string;
  items?: Array<{
    contentDetails?: { videoId?: string };
    snippet?: { publishedAt?: string; title?: string; thumbnails?: Record<string, { url?: string }> };
  }>;
}

interface VideosListResponse {
  items?: Array<{
    id?: string;
    contentDetails?: { duration?: string };
    statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  }>;
}

/**
 * Parse an ISO 8601 duration (e.g. "PT1M30S", "PT45S") into seconds.
 */
export function parseIsoDuration(duration: string): number {
  const match = duration.match(/P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?/);
  if (!match) return 0;
  const [, days, hours, minutes, seconds] = match;
  return (
    (parseInt(days ?? "0", 10) * 86400) +
    (parseInt(hours ?? "0", 10) * 3600) +
    (parseInt(minutes ?? "0", 10) * 60) +
    Math.trunc(parseFloat(seconds ?? "0"))
  );
}

export const MAX_SHORT_SECONDS = 60;
export const MAX_DISCOVERY_ITEMS = 100; // upper bound for a single latest-bucket scan
const MAX_PLAYLIST_PAGES = 50; // safety cap (~2500 items)

interface UploadRef {
  videoId: string;
  publishedAt: string;
}

interface ScanOptions {
  /** Only collect items published strictly after this instant. The scan is
   *  newest-first, so it stops as soon as it reaches an older entry. Used by
   *  latest-bucket discovery (everything published after channels.added_at). */
  publishedAfter?: Date;
  /** Collect items whose published_at falls within [from, to] inclusive. The
   *  scan is newest-first, so entries newer than `to` are skipped and scanning
   *  stops as soon as an entry is older than `from`. Used to seed the old
   *  bucket from a historical date range. */
  publishedWithin?: { from: Date; to: Date };
  /** Maximum number of entries to collect before stopping. */
  maxItems: number;
}

/**
 * Scan an uploads playlist newest-first, collecting up to maxItems entries.
 * Used both for seeding the old bucket from a date range and for the hourly
 * latest-bucket discovery (everything published after the channel was added).
 * Callers pass exactly one of publishedAfter / publishedWithin.
 */
export async function scanUploadsNewestFirst(
  uploadsPlaylistId: string,
  opts: ScanOptions
): Promise<UploadRef[]> {
  const refs: UploadRef[] = [];
  const cutoffMs = opts.publishedAfter ? opts.publishedAfter.getTime() : null;
  const withinMin = opts.publishedWithin ? opts.publishedWithin.from.getTime() : null;
  const withinMax = opts.publishedWithin ? opts.publishedWithin.to.getTime() : null;
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PLAYLIST_PAGES; page++) {
    const params: Record<string, string> = {
      part: "snippet,contentDetails",
      maxResults: "50",
      playlistId: uploadsPlaylistId,
    };
    if (pageToken) params.pageToken = pageToken;

    const data = await fetchYouTube<PlaylistItemsListResponse>("/playlistItems", params);

    for (const item of data.items ?? []) {
      const videoId = item.contentDetails?.videoId;
      const publishedAt = item.snippet?.publishedAt;
      if (!videoId || !publishedAt) continue;

      const publishedMs = new Date(publishedAt).getTime();

      // Latest-bucket discovery: uploads playlists are newest-first, so the
      // first entry at or before the cutoff means everything after is older.
      if (cutoffMs !== null) {
        if (publishedMs <= cutoffMs) return refs;
        refs.push({ videoId, publishedAt });
        if (refs.length >= opts.maxItems) return refs;
        continue;
      }

      // Old-bucket seeding: skip entries newer than `to`, collect entries at or
      // above `from`, and stop as soon as an entry is older than `from`.
      if (withinMin !== null && withinMax !== null) {
        if (publishedMs < withinMin) return refs;
        if (publishedMs <= withinMax) {
          refs.push({ videoId, publishedAt });
          if (refs.length >= opts.maxItems) return refs;
        }
        continue;
      }

      refs.push({ videoId, publishedAt });
      if (refs.length >= opts.maxItems) return refs;
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return refs;
}

async function chunk<T>(arr: T[], size: number): Promise<T[][]> {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

interface RawVideo {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  durationSeconds: number;
}

/**
 * Fetch details for a batch of video IDs (max 50 per request).
 */
export async function fetchVideoDetails(videoIds: string[]): Promise<RawVideo[]> {
  const results: RawVideo[] = [];

  for (const batch of await chunk(videoIds, 50)) {
    const data = await fetchYouTube<VideosListResponse>("/videos", {
      part: "snippet,contentDetails,statistics",
      id: batch.join(","),
      maxResults: "50",
    });

    for (const item of data.items ?? []) {
      const thumb = (item as { snippet?: { thumbnails?: Record<string, { url?: string }> } }).snippet
        ?.thumbnails;
      results.push({
        videoId: item.id ?? "",
        title: (item as { snippet?: { title?: string } }).snippet?.title ?? "",
        thumbnailUrl:
          thumb?.medium?.url ?? thumb?.high?.url ?? thumb?.default?.url ?? `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
        publishedAt: (item as { snippet?: { publishedAt?: string } }).snippet?.publishedAt ?? "",
        viewCount: parseInt(item.statistics?.viewCount ?? "0", 10) || 0,
        likeCount: parseInt(item.statistics?.likeCount ?? "0", 10) || 0,
        commentCount: parseInt(item.statistics?.commentCount ?? "0", 10) || 0,
        durationSeconds: parseIsoDuration(item.contentDetails?.duration ?? "PT0S"),
      });
    }
  }

  return results;
}

/**
 * Re-fetch live stats for a specific set of short video IDs (for incremental refresh).
 */
export async function fetchShortsStats(videoIds: string[]): Promise<
  Array<{ videoId: string; viewCount: number; likeCount: number; commentCount: number }>
> {
  const details = await fetchVideoDetails(videoIds);
  return details.map((v) => ({
    videoId: v.videoId,
    viewCount: v.viewCount,
    likeCount: v.likeCount,
    commentCount: v.commentCount,
  }));
}