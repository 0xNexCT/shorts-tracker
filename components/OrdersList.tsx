"use client";

import { useEffect, useState } from "react";
import { formatDate, formatRelative } from "@/lib/format";

interface Order {
  id: string;
  serviceId: number;
  panelOrderId: number | null;
  quantity: number;
  status: string;
  trigger: "ratio" | "threshold";
  startViews: number;
  startLikes: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  short: {
    videoId: string;
    title: string;
    thumbnailUrl: string;
    viewCount: number;
    likeCount: number;
    channel: { handle: string };
  };
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-950/60 text-amber-400",
  PARTIAL: "bg-orange-950/60 text-orange-400",
  COMPLETED: "bg-emerald-950/60 text-emerald-400",
  FAILED: "bg-red-950/60 text-red-400",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  PARTIAL: "In progress",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

export default function OrdersList() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/orders", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load orders.");
      setOrders(data.orders);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const pendingCount = orders?.filter((o) => o.status === "PENDING" || o.status === "PARTIAL").length ?? 0;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 bg-gray-900/70 px-4 py-5">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <a href="/" className="text-sm font-semibold text-gray-500 transition hover:text-rose-400">
              ← Back to tracker
            </a>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
              <span className="bg-gradient-to-r from-rose-500 to-orange-400 bg-clip-text text-transparent">
                SMM
              </span>{" "}
              Orders
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {orders
                ? `${orders.length} order${orders.length === 1 ? "" : "s"} · ${pendingCount} pending`
                : "Loading orders…"}
            </p>
          </div>
          <button
            onClick={load}
            className="rounded-lg bg-gray-800 px-4 py-2 text-xs font-semibold text-gray-200 ring-1 ring-gray-700 transition hover:ring-sky-500"
          >
            Reload
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {error && (
          <div className="mb-4 rounded-xl border border-red-800/60 bg-red-950/50 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {!orders && !error && (
          <div className="flex items-center justify-center py-20 text-gray-500">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-gray-700 border-t-rose-500" />
          </div>
        )}

        {orders && orders.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-700 bg-gray-900/40 py-20 text-center">
            <p className="text-xl font-semibold text-gray-400">No orders yet</p>
            <p className="mt-2 text-sm text-gray-500">
              Auto-like orders will appear here once a video crosses the views threshold with a low
              like ratio.
            </p>
          </div>
        )}

        {orders && orders.length > 0 && (
          <div className="flex flex-col gap-2">
            {orders.map((o) => {
              const styles = STATUS_STYLE[o.status] ?? "bg-gray-800 text-gray-400";
              const label = STATUS_LABEL[o.status] ?? o.status;
              return (
                <div
                  key={o.id}
                  className="flex flex-col gap-3 rounded-xl border border-gray-700/60 bg-gray-900/60 p-4 sm:flex-row sm:items-center"
                >
                  {o.short.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={o.short.thumbnailUrl}
                      alt=""
                      className="hidden h-16 w-28 shrink-0 rounded-lg object-cover sm:block"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <a
                      href={`https://youtube.com/shorts/${o.short.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm font-semibold text-white transition hover:text-rose-300"
                      title={o.short.title}
                    >
                      {o.short.title}
                    </a>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {o.short.channel.handle} · {formatDate(o.createdAt)} ({formatRelative(o.createdAt)})
                    </p>
                    <p className="mt-0.5 text-xs text-gray-600">
                      +{o.quantity} likes · ratio trigger ({o.trigger}) · panel id{" "}
                      {o.panelOrderId ?? "n/a"}
                      {o.note ? ` · ${o.note}` : ""}
                    </p>
                  </div>
                  <span
                    className={`self-start rounded px-2 py-0.5 text-[11px] font-semibold ${styles} sm:self-center`}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}