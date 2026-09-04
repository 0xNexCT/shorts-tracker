"use client";

import { useEffect, useState } from "react";

interface BalanceState {
  balance: string | null;
  currency: string;
  enabled: boolean;
}

export default function SmmBalanceBadge({ enabledExternal }: { enabledExternal?: boolean }) {
  const [state, setState] = useState<BalanceState>({
    balance: null,
    currency: "",
    enabled: false,
  });
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/smm/balance", { cache: "no-store" });
        if (!res.ok) {
          setUnavailable(true);
          return;
        }
        const data = await res.json();
        setState(data);
        setUnavailable(false);
      } catch {
        setUnavailable(true);
      }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const ready = state.enabled && state.balance != null && !unavailable;
  const numeric = ready ? Number.parseFloat(state.balance as string) : null;
  const low = numeric != null && numeric < 10;

  return (
    <div
      className="rounded-lg border border-gray-700 bg-gray-800/70 px-3 py-1.5"
      title="SMM panel wallet balance — auto-like orders are paid from this"
    >
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium text-gray-400">SMM Balance</span>
        <span className={low ? "font-semibold text-red-400" : "font-semibold text-white"}>
          {ready ? (
            <>
              {numeric!.toLocaleString("en-US", { maximumFractionDigits: 2 })}{" "}
              <span className="font-normal text-gray-500">{state.currency}</span>
            </>
          ) : (
            <span className="text-gray-500">
              {unavailable || !enabledExternal ? "—" : "loading…"}
            </span>
          )}
        </span>
      </div>
      {low && ready && (
        <p className="mt-0.5 text-right text-[11px] text-red-400">
          low balance — add funds soon
        </p>
      )}
    </div>
  );
}