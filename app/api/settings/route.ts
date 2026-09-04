import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSmmConfig, getPublicSmmConfig } from "@/lib/smm";

export const dynamic = "force-dynamic";

/**
 * Global SMM panel automation settings. The API key is always masked in
 * responses so it never reaches the browser.
 */
export async function GET() {
  try {
    return NextResponse.json({ config: await getPublicSmmConfig() });
  } catch (err) {
    console.error("GET /api/settings failed:", err);
    return NextResponse.json(
      { error: "Failed to load settings. Check the database connection." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    await getSmmConfig(); // ensure singleton row exists

    const data: Record<string, unknown> = {};
    if (typeof body.enabled === "boolean") data.enabled = body.enabled;
    if (typeof body.apiUrl === "string" && body.apiUrl.trim()) {
      data.apiUrl = body.apiUrl.trim();
    }
    if (typeof body.apiKey === "string" && body.apiKey.trim()) {
      // A masked key (contains only "*") means "unchanged" — keep the current value.
      if (!/^[*]+$/.test(body.apiKey)) data.apiKey = body.apiKey.trim();
    }
    if (Number.isInteger(body.likeServiceId)) data.likeServiceId = body.likeServiceId;
    if (typeof body.likeTargetRatio === "number") data.likeTargetRatio = body.likeTargetRatio;
    if (Number.isInteger(body.likeQuantity)) data.likeQuantity = body.likeQuantity;
    if (Number.isInteger(body.minOrderGapMinutes)) data.minOrderGapMinutes = body.minOrderGapMinutes;
    if (body.defaultThreshold !== undefined) {
      if (body.defaultThreshold === null) data.defaultThreshold = null;
      else if (Number.isInteger(body.defaultThreshold) && Number(body.defaultThreshold) >= 0) {
        data.defaultThreshold = Number(body.defaultThreshold);
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "Nothing to update. Provide at least one setting." },
        { status: 400 }
      );
    }

    await prisma.smmConfig.update({ where: { id: "global" }, data });
    return NextResponse.json({ status: "ok", config: await getPublicSmmConfig() });
  } catch (err) {
    console.error("POST /api/settings failed:", err);
    return NextResponse.json(
      { error: "Failed to save settings. Check the database connection." },
      { status: 500 }
    );
  }
}
