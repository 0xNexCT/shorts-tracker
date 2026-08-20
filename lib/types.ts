export type Bucket = "old" | "latest";

export interface ViewSnapshot {
  id: string;
  shortId: string;
  viewCount: number;
  capturedAt: string;
}

export interface Short {
  id: string;
  channelId: string;
  videoId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  lastUpdatedAt: string;
  bucket: Bucket;
  addedToMonitoringAt: string;
  /** The 2 latest hourly view captures, newest first. */
  viewSnapshots?: ViewSnapshot[];
}

export interface Channel {
  id: string;
  youtubeChannelId: string;
  handle: string;
  uploadsPlaylistId: string;
  addedAt: string;
  /** Historical range to track as "old" videos (inclusive days), or null. */
  oldFromDate: string | null;
  oldToDate: string | null;
  shorts: Short[];
}

export interface AddChannelResult {
  handle: string;
  status: "ok" | "error";
  trackedCount?: number;
  oldSeeded?: number;
  error?: string;
}

export type SortKey = "views" | "likes" | "comments" | "published";

export interface Quota {
  used: number;
  remaining: number;
  total: number;
  resetsAt: string;
}