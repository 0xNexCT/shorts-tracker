"use client";

import { useEffect, useState } from "react";
import { SmmConfig } from "@/lib/types";

interface Props {
  onClose: () => void;
  onSaved: (config: SmmConfig) => void;
}

export default function SettingsPanel({ onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState({
    apiUrl: "",
    apiKey: "",
    enabled: false,
    likeServiceId: 2952,
    likeTargetRatio: 1.2,
    likeQuantity: 12,
    minOrderGapMinutes: 60,
    defaultThreshold: "800",
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load settings.");
        setLocal({
          apiUrl: data.config.apiUrl,
          apiKey: data.config.apiKey || "",
          enabled: data.config.enabled,
          likeServiceId: data.config.likeServiceId,
          likeTargetRatio: data.config.likeTargetRatio,
          likeQuantity: data.config.likeQuantity,
          minOrderGapMinutes: data.config.minOrderGapMinutes,
          defaultThreshold:
            data.config.defaultThreshold == null ? "" : String(data.config.defaultThreshold),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load settings.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiUrl: local.apiUrl,
          // Only send the key when the user typed something new (not the masked placeholder).
          apiKey: local.apiKey && !/^[*]+$/.test(local.apiKey) ? local.apiKey : undefined,
          enabled: local.enabled,
          likeServiceId: Number(local.likeServiceId),
          likeTargetRatio: Number(local.likeTargetRatio),
          likeQuantity: Number(local.likeQuantity),
          minOrderGapMinutes: Number(local.minOrderGapMinutes),
          defaultThreshold:
            local.defaultThreshold.trim() === "" ? null : Number(local.defaultThreshold),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save settings.");
      setLocal((prev) => ({ ...prev, apiKey: data.config.apiKey || prev.apiKey }));
      onSaved(data.config);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  const mk = (k: keyof typeof local) => ({
    value: local[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setLocal((prev) => ({ ...prev, [k]: e.target.value })),
  });

  const inputCls =
    "w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-rose-500";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-16">
      <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">SMM Automation Settings</h2>
            <p className="mt-1 text-xs text-gray-500">
              Auto-buy YouTube likes for tracked Shorts once a video&apos;s like ratio drops below the
              target (gated by each channel&apos;s views threshold).
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-700 px-2.5 py-1 text-gray-400 transition hover:text-white"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-gray-500">Loading settings…</p>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-700 bg-gray-800/50 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-white">Enable automation</div>
                  <div className="text-xs text-gray-500">
                    Turn on auto-buying for channels with a views threshold set.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={local.enabled}
                  onChange={(e) => setLocal((prev) => ({ ...prev, enabled: e.target.checked }))}
                  className="h-5 w-5 accent-rose-500"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-gray-400">
                Panel API URL
                <input type="text" className={inputCls} {...mk("apiUrl")} />
              </label>

              <label className="flex flex-col gap-1 text-xs text-gray-400">
                Panel API key
                <input
                  type="password"
                  className={inputCls}
                  placeholder={local.apiKey ? local.apiKey : "Paste your SMM panel API key"}
                  value={/^[*]+$/.test(local.apiKey) ? "" : local.apiKey}
                  onChange={(e) =>
                    setLocal((prev) => ({ ...prev, apiKey: e.target.value }))
                  }
                />
                {/^[*]+$/.test(local.apiKey) && (
                  <span className="text-[11px] text-gray-500">
                    A key is already saved (shown masked). Leave blank to keep it.
                  </span>
                )}
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs text-gray-400">
                  Like service ID
                  <input type="number" className={inputCls} {...mk("likeServiceId")} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-gray-400">
                  Likes per order
                  <input type="number" className={inputCls} {...mk("likeQuantity")} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-gray-400">
                  Target like ratio (%)
                  <input type="number" step="0.1" className={inputCls} {...mk("likeTargetRatio")} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-gray-400">
                  Min gap between orders (min)
                  <input type="number" className={inputCls} {...mk("minOrderGapMinutes")} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-gray-400">
                  Default views threshold
                  <input
                    type="number"
                    min={0}
                    className={inputCls}
                    placeholder="800"
                    value={local.defaultThreshold}
                    onChange={(e) =>
                      setLocal((prev) => ({ ...prev, defaultThreshold: e.target.value }))
                    }
                  />
                </label>
              </div>
              <p className="text-[11px] text-gray-500">
                Auto-buying starts once a video&apos;s views reach the threshold. This default (800)
                applies to every channel; set a channel-specific threshold in its Edit panel to
                override it. Repeat orders run every cycle while the like ratio stays below the
                target — if an order fails (e.g. low balance or bad key), it&apos;s retried
                automatically on the next cycle after you add funds.
              </p>
            </div>

            {error && (
              <div className="mt-3 rounded-xl border border-red-800/60 bg-red-950/50 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-lg border border-gray-600 px-4 py-2 text-xs font-semibold text-gray-300 transition hover:border-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Settings"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
