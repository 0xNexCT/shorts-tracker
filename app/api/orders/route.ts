import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * List all SMM like-orders for the current user's channels, newest first.
 */
export async function GET() {
  try {
    const userId = await getOrCreateSessionUserId();

    const orders = await prisma.smmOrderLog.findMany({
      where: { short: { channel: { userId } } },
      orderBy: { createdAt: "desc" },
      include: {
        short: {
          select: {
            videoId: true,
            title: true,
            thumbnailUrl: true,
            viewCount: true,
            likeCount: true,
            channel: { select: { handle: true } },
          },
        },
      },
    });

    return NextResponse.json({ orders });
  } catch (err) {
    console.error("GET /api/orders failed:", err);
    return NextResponse.json(
      { error: "Could not load orders. Check the database connection." },
      { status: 500 }
    );
  }
}