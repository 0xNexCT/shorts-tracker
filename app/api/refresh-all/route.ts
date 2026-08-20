import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { refreshChannelMonitoring, YouTubeApiError } from "@/lib/channels";
import { getOrCreateSessionUserId } from "@/lib/session";
import { formatResetsIn, getRemainingQuota } from "@/lib/quota";

export const dynamic = "force-dynamic";

export async function POST() {
  const userId = await getOrCreateSessionUserId();

  const quota = await getRemainingQuota();
  if (quota.remaining <= 0) {
    return NextResponse.json(
      {
        error: `Daily API quota exhausted, try again after ${formatResetsIn(quota.resetsAt)}.`,
      },
      { status: 429 }
    );
  }

  let channels;
  try {
    channels = await prisma.channel.findMany({
      where: { userId },
      select: { id: true, handle: true },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not load channels. Check the database connection." },
      { status: 500 }
    );
  }

  const results = [];
  let hadError = false;

  for (const channel of channels) {
    try {
      const summary = await refreshChannelMonitoring(userId, channel.id);
      results.push({ channelId: channel.id, handle: channel.handle, status: "ok", ...summary });
    } catch (err) {
      hadError = true;
      const message =
        err instanceof YouTubeApiError || err instanceof Error
          ? err.message
          : "Unknown error refreshing channel.";
      results.push({ channelId: channel.id, handle: channel.handle, status: "error", error: message });
    }
  }

  return NextResponse.json(
    { results, allOk: !hadError },
    { status: hadError ? 207 : 200 }
  );
}