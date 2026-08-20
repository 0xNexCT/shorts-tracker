import { NextResponse } from "next/server";
import { getRemainingQuota } from "@/lib/quota";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const quota = await getRemainingQuota();
    return NextResponse.json(quota);
  } catch (err) {
    console.error("GET /api/quota failed:", err);
    return NextResponse.json(
      { error: "Could not load quota info. Check the database connection." },
      { status: 500 }
    );
  }
}