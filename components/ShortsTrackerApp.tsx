"use client";

import { useCallback, useEffect, useState } from "react";
import { Channel, AddChannelResult, SortKey, Quota, SmmConfig } from "@/lib/types";
import AddChannelForm, { ChannelRangeInput } from "./AddChannelForm";
import ChannelCard, { ChannelRangeEdit } from "./ChannelCard";
import QuotaBadge from "./QuotaBadge";
import SettingsPanel from "./SettingsPanel";

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "published", label: "Newest first" },
  { value: "views", label: "Most views" },
  { value: "likes", label: "Most likes" },
  { value: "comments", label: "Most comments" },
];

export default function ShortsTrackerApp() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("published");
  const [quota, setQuota] = useState<Quota | null>(null);
  const [smmConfig, setSmmConfig] = useState<SmmConfig | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [checkingOrders, setCheckingOrders] = useState(false);

  const loadQuota = useCallback(async () => {
    try {
      const res = await fetch("/api/quota", { cache: "no-store" });
      if (res.ok) setQuota(await res.json());
    } catch {
      // Non-critical; badge just stays hidden/stale.
    }
  }, []);

  const loadChannels = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/channels", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load channels.");
      setChannels(data.channels);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load channels.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChannels();
    loadQuota();
  }, [loadChannels, loadQuota]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setSmmConfig(data.config);
        }
      } catch {
        // Non-critical; the settings button stays available regardless.
      }
    })();
  }, []);

  async function checkPendingOrders() {
    setCheckingOrders(true);
    setError(null);
    try {
      const res = await fetch("/api/orders/check", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to check orders.");
      } else {
        await loadChannels();
      }
    } catch {
      setError("Failed to check orders.");
    } finally {
      setCheckingOrders(false);
    }
  }

  async function handleAdd(input: string, range: ChannelRangeInput): Promise<AddChannelResult[]> {
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handles: input, oldFromDate: range.oldFromDate || null, oldToDate: range.oldToDate || null }),
      });
      const data = await res.json();
      if (data.results) {
        const okCount = data.results.filter((r: AddChannelResult) => r.status === "ok").length;
        if (okCount > 0) await loadChannels();
        await loadQuota();
        return data.results;
      }
      await loadQuota();
      throw new Error(data.error ?? "Failed to add channels.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to add channels.";
      setError(message);
      return [{ handle: input, status: "error", error: message }];
    }
  }

  async function refreshChannel(id: string) {
    setRefreshing(id);
    try {
      const res = await fetch(`/api/channels/${id}/refresh`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to refresh channel.");
        await loadQuota();
      } else {
        await loadChannels();
        await loadQuota();
      }
    } catch {
      setError("Failed to refresh channel.");
    } finally {
      setRefreshing(null);
    }
  }

  async function refreshAll() {
    setRefreshingAll(true);
    setError(null);
    try {
      const res = await fetch("/api/refresh-all", { method: "POST" });
      const data = await res.json();
      if (!res.ok && !data.results) {
        setError(data.error ?? "Failed to refresh channels.");
      } else {
        await loadChannels();
      }
      await loadQuota();
    } catch {
      setError("Failed to refresh channels.");
    } finally {
      setRefreshingAll(false);
    }
  }

  const totalShorts = channels.reduce((sum, c) => sum + c.shorts.length, 0);

  async function saveChannel(id: string, range: ChannelRangeEdit) {
    setSaving(id);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldFromDate: range.oldFromDate || null,
          oldToDate: range.oldToDate || null,
          autoLikeThreshold: range.autoLikeThreshold,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update channel.");
        await loadQuota();
      } else {
        await loadChannels();
      }
    } catch {
      setError("Failed to update channel.");
    } finally {
      setSaving(null);
    }
  }

  async function removeChannel(id: string) {
    const channel = channels.find((c) => c.id === id);
    if (!channel) return;
    if (!window.confirm(`Remove ${channel.handle} and all its tracked shorts?`)) return;

    setRemoving(id);
    try {
      const res = await fetch(`/api/channels/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to remove channel.");
      } else {
        setError(null);
        setChannels((prev) => prev.filter((c) => c.id !== id));
      }
    } catch {
      setError("Failed to remove channel.");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 bg-gray-900/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              <span className="bg-gradient-to-r from-rose-500 to-orange-400 bg-clip-text text-transparent">
                Shorts
              </span>{" "}
              Tracker
            </h1>
            <p className="text-sm text-gray-500">
              {loading
                ? "Loading channels…"
                : `${channels.length} channel${channels.length === 1 ? "" : "s"} · ${totalShorts} shorts`}
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <QuotaBadge quota={quota} />
            <label className="text-xs text-gray-500">
              Sort by
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="ml-2 rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-white outline-none focus:border-rose-500"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={refreshAll}
              disabled={refreshingAll || channels.length === 0 || (quota?.remaining ?? 1) <= 0}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-xs font-semibold text-gray-200 ring-1 ring-gray-700 transition hover:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refreshingAll ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-500 border-t-rose-400" />
                  Refreshing all…
                </>
              ) : (
                "Refresh All"
              )}
            </button>
            <button
              onClick={checkPendingOrders}
              disabled={checkingOrders || !smmConfig?.enabled}
              title={
                smmConfig?.enabled
                  ? "Re-check pending SMM order statuses against the panel"
                  : "Enable SMM automation in Settings first"
              }
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-xs font-semibold text-gray-200 ring-1 ring-gray-700 transition hover:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {checkingOrders ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-500 border-t-sky-400" />
                  Checking…
                </>
              ) : (
                "Check Orders"
              )}
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600/90 px-4 py-2 text-xs font-semibold text-white ring-1 ring-rose-500/40 transition hover:bg-rose-500"
            >
              Settings
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6">
        <AddChannelForm onAdd={handleAdd} disabled={(quota?.remaining ?? 1) <= 0} />

        {quota && quota.remaining <= 0 && (
          <div className="rounded-xl border border-amber-800/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
            Daily API quota exhausted, try again after the reset. Adding and refreshing are paused
            until then.
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-800/60 bg-red-950/50 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-20 text-gray-500">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-gray-700 border-t-rose-500" />
            <p className="text-sm">Loading your channels…</p>
          </div>
        ) : channels.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-700 bg-gray-900/40 py-20 text-center">
            <p className="text-xl font-semibold text-gray-400">No channels yet</p>
            <p className="mt-2 text-sm text-gray-500">
              Add a YouTube username above, e.g. <span className="text-gray-300">@mrbeast</span> — its Shorts
              will appear here.
            </p>
          </div>
        ) : (
          channels.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              sortBy={sortBy}
              refreshing={refreshing === channel.id}
              removing={removing === channel.id}
              saving={saving === channel.id}
              quotaExhausted={(quota?.remaining ?? 1) <= 0}
              onRefresh={refreshChannel}
              onRemove={removeChannel}
              onSave={saveChannel}
            />
          ))
        )}
      </main>

      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          onSaved={(cfg) => setSmmConfig(cfg)}
        />
      )}

      <footer className="border-t border-gray-800 py-6 text-center text-xs text-gray-600">
        Powered by the YouTube Data API v3 · data refreshes on demand
      </footer>
    </div>
  );
}