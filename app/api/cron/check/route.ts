import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluateChannelAutomation } from "@/lib/automation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 15-minute automation pass, triggered by a Vercel cron (see vercel.json).
 * Secured by CRON_SECRET (Vercel sends "Authorization: Bearer <CRON_SECRET>").
 *
 * Unlike the hourly monitoring cron, this is a DB-only check: it evaluates the
 * like-ratio gate from the most recently stored stats and auto-buys likes when
 * the ratio is below target. It makes NO YouTube API calls, so it's cheap and
 * safe to run every 15 minutes without burning the daily quota.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  if (channels.length === 0) {
    return NextResponse.json({ status: "ok", channelsProcessed: 0, ordersPlaced: 0 });
  }

  let ordersPlaced = 0;
  const results = [];
  let hadError = false;

  for (const channel of channels) {
    try {
      const placed = await evaluateChannelAutomation(channel.id);
      ordersPlaced += placed;
      results.push({ channelId: channel.id, handle: channel.handle, status: "ok", ordersPlaced: placed });
    } catch (err) {
      hadError = true;
      const message = err instanceof Error ? err.message : "Unknown error during automation.";
      results.push({ channelId: channel.id, handle: channel.handle, status: "error", error: message });
    }
  }

  return NextResponse.json(
    { status: hadError ? "partial" : "ok", channelsProcessed: channels.length, ordersPlaced, results },
    { status: hadError ? 207 : 200 }
  );
}
