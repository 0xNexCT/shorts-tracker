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
  /** Recent SMM order logs for this short, newest first. */
  smmOrders?: SmmOrderLog[];
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
  /** Auto-buy likes once a video reaches this many views. Null/0 = gate disabled. */
  autoLikeThreshold: number | null;
  shorts: Short[];
}

export type SmmOrderStatus = "PENDING" | "COMPLETED" | "FAILED" | "PARTIAL";

export interface SmmOrderLog {
  id: string;
  shortId: string;
  serviceId: number;
  panelOrderId: number | null;
  quantity: number;
  status: SmmOrderStatus;
  trigger: "ratio" | "threshold";
  startViews: number;
  startLikes: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SmmConfig {
  apiUrl: string;
  apiKey: string;
  enabled: boolean;
  likeServiceId: number;
  likeTargetRatio: number;
  likeQuantity: number;
  minOrderGapMinutes: number;
  /** Global views threshold applied to channels that don't have their own. */
  defaultThreshold: number | null;
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