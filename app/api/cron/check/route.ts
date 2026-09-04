import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runChannelMonitoring, YouTubeApiError } from "@/lib/channels";
import { checkAllPendingOrderStatuses, getSmmConfig } from "@/lib/smm";
import { getRemainingQuota, formatResetsIn } from "@/lib/quota";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 15-minute automation pass, triggered by a GitHub Actions workflow.
 * Secured by CRON_SECRET ("Authorization: Bearer <CRON_SECRET>").
 *
 * For every channel with SMM automation enabled and a views threshold set:
 *   1. Refresh fresh YouTube stats (views/likes) via runChannelMonitoring.
 *   2. Evaluate the like-ratio gate and auto-buy likes when below target
 *      (gated by the channel's views threshold).
 *
 * NOTE: This hits the YouTube API, so it consumes daily quota. Only SMM-enabled
 * channels with a threshold set are touched to limit quota burn.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await getSmmConfig().catch(() => null);
  if (!config?.enabled || !config.apiKey) {
    return NextResponse.json({ status: "skipped", reason: "SMM disabled or no API key" });
  }

  let channels;
  try {
    channels = await prisma.channel.findMany({
      select: { id: true, handle: true },
      orderBy: { addedAt: "asc" },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not load channels. Check the database connection." },
      { status: 500 }
    );
  }

  let quota;
  try {
    quota = await getRemainingQuota();
  } catch {
    quota = null;
  }

  if (channels.length === 0) {
    return NextResponse.json({ status: "ok", channelsProcessed: 0, ordersPlaced: 0 });
  }

  if (quota && quota.remaining <= 0) {
    return NextResponse.json({
      status: "partial",
      channelsProcessed: 0,
      ordersPlaced: 0,
      reason: `YouTube API quota exhausted, resets ${formatResetsIn(quota.resetsAt)}`,
    });
  }

  let ordersPlaced = 0;
  const results = [];
  let hadError = false;

  for (const channel of channels) {
    // Stop early if the daily API quota runs out mid-pass.
    if (quota && quota.remaining <= 0) {
      hadError = true;
      results.push({
        channelId: channel.id,
        handle: channel.handle,
        status: "skipped",
        reason: "quota exhausted",
      });
      continue;
    }
    try {
      const summary = await runChannelMonitoring(channel.id, { snapshot: true });
      ordersPlaced += summary.autoOrders;
      results.push({
        channelId: channel.id,
        handle: channel.handle,
        status: "ok",
        ...summary,
      });
      if (quota) quota = await getRemainingQuota();
    } catch (err) {
      hadError = true;
      const message =
        err instanceof YouTubeApiError || err instanceof Error
          ? err.message
          : "Unknown error during monitoring.";
      results.push({ channelId: channel.id, handle: channel.handle, status: "error", error: message });
    }
  }

  // Self-maintain pending order statuses so badges update without manual clicks.
  let statusesChecked = 0;
  let statusesUpdated = 0;
  try {
    const statusRes = await checkAllPendingOrderStatuses(config);
    statusesChecked = statusRes.checked;
    statusesUpdated = statusRes.updated;
  } catch (e) {
    console.error("pending status check failed:", e);
    hadError = true;
  }

  return NextResponse.json(
    {
      status: hadError ? "partial" : "ok",
      channelsProcessed: channels.length,
      ordersPlaced,
      statusesChecked,
      statusesUpdated,
      results,
    },
    { status: hadError ? 207 : 200 }
  );
}
