import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createChannelWithMonitoring,
  parseHandles,
  parseOldRange,
  isInvalidRange,
  sanitizeChannel,
  YouTubeApiError,
} from "@/lib/channels";
import { getOrCreateSessionUserId } from "@/lib/session";
import { formatResetsIn, getRemainingQuota } from "@/lib/quota";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const userId = await getOrCreateSessionUserId();

    const channels = await prisma.channel.findMany({
      where: { userId },
      orderBy: { addedAt: "asc" },
      include: {
        shorts: {
          orderBy: { publishedAt: "desc" },
          include: {
            viewSnapshots: {
              // Enough history (~2 days of hourly captures) for the growth
              // badge to find the closest snapshot >= 1h older than the newest.
              take: 50,
              orderBy: { capturedAt: "desc" },
              select: { viewCount: true, capturedAt: true },
            },
          },
        },
      },
    });

    return NextResponse.json({ channels: channels.map(sanitizeChannel) });
  } catch (err) {
    console.error("GET /api/channels failed:", err);
    return NextResponse.json(
      { error: "Could not load channels. Check the database connection." },
      { status: 500 }
    );
  }
}

async function quotaWarning(): Promise<NextResponse | null> {
  const quota = await getRemainingQuota();
  if (quota.remaining <= 0) {
    return NextResponse.json(
      {
        error: `Daily API quota exhausted, try again after ${formatResetsIn(quota.resetsAt)}.`,
      },
      { status: 429 }
    );
  }
  return null;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body. Send { \"handles\": \"@user1, @user2\" }" },
      { status: 400 }
    );
  }

  const raw = (body as { handles?: unknown; handle?: unknown }) ?? {};
  const handles = parseHandles(raw.handles ?? raw.handle);
  if (handles.length === 0) {
    return NextResponse.json(
      { error: "Provide at least one YouTube username or handle, e.g. \"@mrbeast\"." },
      { status: 400 }
    );
  }

  const range = parseOldRange(body);
  if (isInvalidRange(range)) {
    return NextResponse.json(
      { error: "Old videos to must be on or after Old videos from." },
      { status: 400 }
    );
  }

  const userId = await getOrCreateSessionUserId();

  const blocked = await quotaWarning();
  if (blocked) return blocked;

  const results = [];
  let hadError = false;

  for (const handle of handles) {
    try {
      const summary = await createChannelWithMonitoring(userId, handle, range);
      results.push({
        handle: `@${handle}`,
        status: "ok",
        channel: sanitizeChannel(summary.channel),
        trackedCount: summary.trackedCount,
        oldSeeded: summary.oldSeeded,
      });
    } catch (err) {
      hadError = true;
      const message =
        err instanceof YouTubeApiError || err instanceof Error
          ? err.message
          : "Unknown error adding channel.";
      results.push({ handle: `@${handle}`, status: "error", error: message });
    }
  }

  return NextResponse.json(
    { results },
    { status: hadError ? 207 : 201 }
  );
}