import { NextResponse } from "next/server";
import { getPanelBalance, getSmmConfig } from "@/lib/smm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await getSmmConfig();
    if (!config.enabled || !config.apiKey) {
      return NextResponse.json({ balance: null, currency: "", enabled: false });
    }
    const b = await getPanelBalance(config);
    return NextResponse.json({ balance: b.balance, currency: b.currency, enabled: true });
  } catch (err) {
    console.error("GET /api/smm/balance failed:", err);
    return NextResponse.json({ balance: null, currency: "", error: "Could not fetch balance." });
  }
}