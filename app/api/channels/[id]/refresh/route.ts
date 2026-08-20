import { NextRequest, NextResponse } from "next/server";
import { refreshChannelMonitoring, YouTubeApiError } from "@/lib/channels";
import { getOrCreateSessionUserId } from "@/lib/session";
import { formatResetsIn, getRemainingQuota } from "@/lib/quota";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
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

    const summary = await refreshChannelMonitoring(userId, id);
    return NextResponse.json({ status: "ok", channelId: id, ...summary });
  } catch (err) {
    console.error(`POST /api/channels/${id}/refresh failed:`, err);
    if (err instanceof YouTubeApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "Failed to refresh channel. Check the database connection." },
      { status: 500 }
    );
  }
}