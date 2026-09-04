import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionUserId } from "@/lib/session";
import { getSmmConfig, queryPanelOrder } from "@/lib/smm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Manually verify the status of pending SMM orders for the current user's
 * channels against the panel, updating the stored logs in place.
 */
export async function POST(_req: NextRequest) {
  try {
    const userId = await getOrCreateSessionUserId();
    const config = await getSmmConfig();
    if (!config.enabled || !config.apiKey) {
      return NextResponse.json(
        { error: "SMM automation is disabled or has no API key configured." },
        { status: 400 }
      );
    }

    const pending = await prisma.smmOrderLog.findMany({
      where: {
        status: { in: ["PENDING", "PARTIAL"] },
        panelOrderId: { not: null },
        short: { channel: { userId } },
      },
      take: 100,
    });

    const updated: Array<{ id: string; status: string }> = [];
    for (const log of pending) {
      try {
        const status = await queryPanelOrder(
          config.apiUrl,
          config.apiKey,
          log.panelOrderId!
        );
        if (status !== "PENDING") {
          await prisma.smmOrderLog.update({
            where: { id: log.id },
            data: { status },
          });
          updated.push({ id: log.id, status });
        }
      } catch (e) {
        console.error(`check order ${log.id} failed:`, e);
        await prisma.smmOrderLog.update({
          where: { id: log.id },
          data: { status: "FAILED", note: "Status check failed against the panel." },
        });
        updated.push({ id: log.id, status: "FAILED" });
      }
    }

    return NextResponse.json({ status: "ok", checked: pending.length, updated });
  } catch (err) {
    console.error("POST /api/orders/check failed:", err);
    return NextResponse.json(
      { error: "Failed to check orders. Check the database connection." },
      { status: 500 }
    );
  }
}
