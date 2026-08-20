import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  patchOldRange,
  isInvalidRange,
  sanitizeChannel,
  updateChannelMonitoring,
  YouTubeApiError,
} from "@/lib/channels";
import { getOrCreateSessionUserId } from "@/lib/session";
import { formatResetsIn, getRemainingQuota } from "@/lib/quota";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body. Send { \"oldFromDate\": \"2026-07-01\", \"oldToDate\": \"2026-07-07\" }." },
      { status: 400 }
    );
  }

  try {
    const userId = await getOrCreateSessionUserId();

    const current = await prisma.channel.findUnique({
      where: { id, userId },
      select: { oldFromDate: true, oldToDate: true },
    });
    if (!current) {
      return NextResponse.json({ error: "Channel not found." }, { status: 404 });
    }

    const hasFrom = (body as Record<string, unknown>).oldFromDate !== undefined;
    const hasTo = (body as Record<string, unknown>).oldToDate !== undefined;
    if (!hasFrom && !hasTo) {
      return NextResponse.json(
        { error: "Nothing to change. Send oldFromDate and/or oldToDate." },
        { status: 400 }
      );
    }

    const next = patchOldRange(body, {
      oldFromDate: current.oldFromDate,
      oldToDate: current.oldToDate,
    });
    if (isInvalidRange(next)) {
      return NextResponse.json(
        { error: "Old videos to must be on or after Old videos from." },
        { status: 400 }
      );
    }

    // Seeding a widened range hits YouTube, so respect quota like POST does.
    const rangeChanged =
      current.oldFromDate?.getTime() !== next.oldFromDate?.getTime() ||
      current.oldToDate?.getTime() !== next.oldToDate?.getTime();
    if (rangeChanged) {
      const quota = await getRemainingQuota();
      if (quota.remaining <= 0) {
        return NextResponse.json(
          {
            error: `Daily API quota exhausted, try again after ${formatResetsIn(quota.resetsAt)}.`,
          },
          { status: 429 }
        );
      }
    }

    const result = await updateChannelMonitoring(userId, id, next);
    return NextResponse.json({ status: "ok", ...result, channel: sanitizeChannel(result.channel) });
  } catch (err) {
    console.error(`PATCH /api/channels/${id} failed:`, err);
    if (err instanceof YouTubeApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "Failed to update channel. Check the database connection." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const userId = await getOrCreateSessionUserId();

    // Only delete a channel that belongs to the current user.
    const existing = await prisma.channel.findUnique({
      where: { id, userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Channel not found." }, { status: 404 });
    }

    // Shorts are removed via the onDelete: Cascade relation.
    await prisma.channel.delete({ where: { id } });

    return NextResponse.json({ status: "ok", deletedHandle: existing.handle });
  } catch (err) {
    console.error(`DELETE /api/channels/${id} failed:`, err);
    return NextResponse.json(
      { error: "Failed to remove channel. Check the database connection." },
      { status: 500 }
    );
  }
}