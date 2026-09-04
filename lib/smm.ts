import { prisma } from "./prisma";

export const DEFAULT_SMM_URL = "https://cheapestsmmpanels.com/api/v2";

export interface SmmConfigRow {
  id: string;
  apiUrl: string;
  apiKey: string;
  enabled: boolean;
  likeServiceId: number;
  likeTargetRatio: number;
  likeQuantity: number;
  minOrderGapMinutes: number;
  defaultThreshold: number | null;
  updatedAt: Date;
}

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 6) return "*".repeat(key.length);
  return `${key.slice(0, 3)}${"*".repeat(key.length - 6)}${key.slice(-3)}`;
}

/**
 * Get the global SMM config, creating the singleton row if it doesn't exist.
 */
export async function getSmmConfig(): Promise<SmmConfigRow> {
  const existing = await prisma.smmConfig.findUnique({ where: { id: "global" } });
  if (existing) return existing;
  return prisma.smmConfig.create({ data: { id: "global" } });
}

/**
 * Config shape safe to send to the browser: API key is always masked.
 */
export async function getPublicSmmConfig() {
  const c = await getSmmConfig();
  return {
    apiUrl: c.apiUrl,
    apiKey: maskKey(c.apiKey),
    enabled: c.enabled,
    likeServiceId: c.likeServiceId,
    likeTargetRatio: c.likeTargetRatio,
    likeQuantity: c.likeQuantity,
    minOrderGapMinutes: c.minOrderGapMinutes,
    defaultThreshold: c.defaultThreshold,
  };
}

export interface SmmOrderFailure extends Error {}

/**
 * POST an order to the SMM panel. Throws on non-2xx or a panel error.
 * Returns the panel's order id.
 */
export async function placePanelOrder(
  apiUrl: string,
  apiKey: string,
  serviceId: number,
  videoId: string,
  quantity: number
): Promise<number> {
  const body = new URLSearchParams({
    key: apiKey,
    action: "add",
    service: String(serviceId),
    link: `https://youtube.com/shorts/${videoId}`,
    quantity: String(quantity),
  });

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`SMM panel responded ${res.status}`);
  }
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`SMM panel returned non-JSON: ${text.slice(0, 200)}`);
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj?.order === "number") return obj.order;
  if (typeof obj?.order === "string") return Number.parseInt(obj.order, 10);
  if (typeof obj?.error === "string") throw new Error(`SMM panel error: ${obj.error}`);
  throw new Error(`Unexpected SMM panel response: ${text.slice(0, 200)}`);
}

export type PanelStatus = "PENDING" | "COMPLETED" | "PARTIAL" | "FAILED";

/**
 * Query an order's status from the panel. Returns the raw status string if
 * recognized, otherwise "PENDING".
 */
export async function queryPanelOrder(
  apiUrl: string,
  apiKey: string,
  orderId: number
): Promise<PanelStatus> {
  const body = new URLSearchParams({
    key: apiKey,
    action: "status",
    order: String(orderId),
  });
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`SMM panel responded ${res.status}`);
  }
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`SMM panel returned non-JSON: ${text.slice(0, 200)}`);
  }
  const obj = data as Record<string, unknown>;
  const raw = typeof obj?.status === "string" ? obj.status.toUpperCase() : "";
  switch (raw) {
    case "COMPLETED":
    case "COMPLETE":
      return "COMPLETED";
    case "PARTIAL":
      return "PARTIAL";
    case "CANCELED":
    case "CANCELLED":
    case "ERROR":
    case "FAILED":
      return "FAILED";
    default:
      return "PENDING";
  }
}

export interface PlaceLikeTarget {
  id: string;
  videoId: string;
  viewCount: number;
  likeCount: number;
}

export interface PlaceOrderOptions {
  short: PlaceLikeTarget;
  quantity: number;
  trigger: "ratio" | "threshold";
  config: SmmConfigRow;
}

/**
 * Place a like order for a short and record it. Returns the created order log.
 */
export async function placeLikeOrder(opts: PlaceOrderOptions): Promise<Awaited<ReturnType<typeof prisma.smmOrderLog.create>>> {
  const { short, quantity, trigger, config } = opts;

  const log = await prisma.smmOrderLog.create({
    data: {
      shortId: short.id,
      serviceId: config.likeServiceId,
      quantity,
      status: "PENDING",
      trigger,
      startViews: short.viewCount,
      startLikes: short.likeCount,
    },
  });

  try {
    const panelOrderId = await placePanelOrder(
      config.apiUrl,
      config.apiKey,
      config.likeServiceId,
      short.videoId,
      quantity
    );
    return prisma.smmOrderLog.update({
      where: { id: log.id },
      data: { panelOrderId, status: "PENDING" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown panel error";
    return prisma.smmOrderLog.update({
      where: { id: log.id },
      data: { status: "FAILED", note: message },
    });
  }
}
