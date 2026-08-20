import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runChannelMonitoring, YouTubeApiError } from "@/lib/channels";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Hourly monitoring pass, triggered by a Vercel cron (see vercel.json).
 * Secured by CRON_SECRET: Vercel sends "Authorization: Bearer <CRON_SECRET>"
 * automatically when the env var is configured on the project.
 *
 * For every channel it: discovers new uploads into the rolling latest bucket,
 * enforces both bucket caps, refreshes stats, and records one view_snapshots
 * row per monitored short so the dashboard can show hourly view growth.
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
    return NextResponse.json({ status: "ok", channelsProcessed: 0, results: [] });
  }

  const results = [];
  let hadError = false;

  for (const channel of channels) {
    try {
      const summary = await runChannelMonitoring(channel.id, { snapshot: true });
      results.push({
        channelId: channel.id,
        handle: channel.handle,
        status: "ok",
        ...summary,
      });
    } catch (err) {
      hadError = true;
      const message =
        err instanceof YouTubeApiError || err instanceof Error
          ? err.message
          : "Unknown error during monitoring.";
      results.push({ channelId: channel.id, handle: channel.handle, status: "error", error: message });
    }
  }

  return NextResponse.json(
    { status: hadError ? "partial" : "ok", channelsProcessed: channels.length, results },
    { status: hadError ? 207 : 200 }
  );
}