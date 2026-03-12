"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, BellRing, MessageSquareText, RefreshCw, ShoppingBag, UserRound } from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { api } from "@/lib/api";
import {
  browserNotificationsSupported,
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  sendBrowserNotification,
} from "@/lib/browser-notifications";

type ShopifyChatEvent = {
  id: string;
  created_at: string;
  author: string;
  type: string;
  message: string;
  order_id: string;
  order_name: string;
  customer_name: string;
  email: string;
  financial_status: string;
  fulfillment_status: string;
  total_price: string;
  currency: string;
};

type ShopifyChatFeedResponse = {
  events: ShopifyChatEvent[];
  count: number;
  orders_checked: number;
};

const POLL_INTERVAL_MS = 60_000;
const LAST_EVENT_STORAGE_KEY = "shopify-chat-last-event-id";

export default function ShopifyPage() {
  const [events, setEvents] = useState<ShopifyChatEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [ordersChecked, setOrdersChecked] = useState(0);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    setNotificationPermission(getBrowserNotificationPermission());
    void loadFeed(false);

    const interval = window.setInterval(() => {
      void loadFeed(true);
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, []);

  async function loadFeed(shouldNotify: boolean) {
    if (shouldNotify) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await api<ShopifyChatFeedResponse>("/shopify/chat/feed?limit_orders=12&limit_events=80");
      setEvents(response.events || []);
      setOrdersChecked(response.orders_checked || 0);
      setError("");

      if (shouldNotify) {
        notifyAboutNewEvents(response.events || []);
      } else if (response.events?.[0]?.id) {
        localStorage.setItem(LAST_EVENT_STORAGE_KEY, response.events[0].id);
      }
    } catch (err) {
      setEvents([]);
      setOrdersChecked(0);
      setError(err instanceof Error ? err.message : "Shopify chat laden mislukt");
    }

    setLoading(false);
    setRefreshing(false);
  }

  function notifyAboutNewEvents(nextEvents: ShopifyChatEvent[]) {
    const latestEventId = nextEvents[0]?.id;
    if (!latestEventId) return;

    const previousEventId = localStorage.getItem(LAST_EVENT_STORAGE_KEY);
    if (!previousEventId) {
      localStorage.setItem(LAST_EVENT_STORAGE_KEY, latestEventId);
      return;
    }

    if (previousEventId === latestEventId) {
      return;
    }

    const unseenEvents = nextEvents.filter((event) => event.id !== previousEventId);
    const notifications = unseenEvents.slice(0, 3).reverse();
    for (const event of notifications) {
      sendBrowserNotification(`Nieuwe Shopify chat: ${event.order_name}`, {
        body: `${event.author}: ${event.message}`,
        tag: `shopify-chat-${event.id}`,
      });
    }

    localStorage.setItem(LAST_EVENT_STORAGE_KEY, latestEventId);
  }

  async function enableNotifications() {
    const permission = await requestBrowserNotificationPermission();
    setNotificationPermission(permission);
  }

  const eventTypes = useMemo(() => {
    return Array.from(new Set(events.map((event) => event.type).filter(Boolean))).sort((left, right) => left.localeCompare(right));
  }, [events]);

  const visibleEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return events.filter((event) => {
      if (typeFilter !== "all" && event.type !== typeFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [event.order_name, event.customer_name, event.email, event.author, event.message]
        .some((value) => (value || "").toLowerCase().includes(query));
    });
  }, [events, search, typeFilter]);

  return (
    <LayoutShell>
      <div className="space-y-5">
        <section className="glass overflow-hidden rounded-[2rem] p-5 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/40 px-3 py-1 text-xs font-medium opacity-80">
                <MessageSquareText className="h-3.5 w-3.5 text-accent" />
                Shopify chat feed
              </div>
              <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">Shopify gesprekken en events</h1>
              <p className="mt-3 max-w-3xl text-sm opacity-70 sm:text-base">
                Deze feed bundelt recente Shopify-ordergebeurtenissen tot één chatachtige stroom. Nieuwe events kunnen ook als browsermelding binnenkomen.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={() => void loadFeed(true)}
                  disabled={refreshing}
                  className="inline-flex items-center gap-2 rounded-2xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                  {refreshing ? "Verversen..." : "Feed verversen"}
                </button>
                {browserNotificationsSupported() && notificationPermission !== "granted" && (
                  <button
                    onClick={() => void enableNotifications()}
                    className="inline-flex items-center gap-2 rounded-2xl border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-card/70"
                  >
                    <Bell className="h-4 w-4" />
                    Browsermeldingen inschakelen
                  </button>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.5rem] border border-border/70 bg-card/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Events</p>
                <p className="mt-2 text-2xl font-semibold">{events.length}</p>
                <p className="mt-1 text-sm opacity-60">In de huidige feed</p>
              </div>
              <div className="rounded-[1.5rem] border border-border/70 bg-card/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Orders</p>
                <p className="mt-2 text-2xl font-semibold">{ordersChecked}</p>
                <p className="mt-1 text-sm opacity-60">Bestellingen gecontroleerd</p>
              </div>
              <div className="rounded-[1.5rem] border border-border/70 bg-card/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Meldingen</p>
                <p className="mt-2 text-2xl font-semibold">{notificationPermission === "granted" ? "Aan" : "Uit"}</p>
                <p className="mt-1 text-sm opacity-60">Browserstatus voor Shopify chat</p>
              </div>
              <div className="rounded-[1.5rem] border border-border/70 bg-card/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Polling</p>
                <p className="mt-2 text-2xl font-semibold">60s</p>
                <p className="mt-1 text-sm opacity-60">Automatische controle op nieuwe events</p>
              </div>
            </div>
          </div>
        </section>

        <section className="glass rounded-[2rem] p-5 sm:p-6">
          <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Zoek op bestelling, klant, auteur of bericht"
              className="rounded-xl border border-border bg-transparent px-3 py-2 text-sm"
            />
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="rounded-xl border border-border bg-transparent px-3 py-2 text-sm"
            >
              <option value="all">Alle types</option>
              {eventTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <div className="inline-flex items-center justify-center rounded-xl border border-border px-3 py-2 text-sm opacity-70">
              {visibleEvents.length} zichtbaar
            </div>
          </div>

          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm opacity-60">
                Shopify chat laden...
              </div>
            ) : visibleEvents.length > 0 ? (
              visibleEvents.map((event) => (
                <article key={event.id} className="rounded-[1.5rem] border border-border bg-card/25 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
                          {event.type}
                        </span>
                        <span className="text-xs opacity-55">{event.created_at ? new Date(event.created_at).toLocaleString() : "-"}</span>
                      </div>
                      <h2 className="mt-3 text-lg font-semibold">{event.order_name || "Onbekende bestelling"}</h2>
                      <p className="mt-1 text-sm opacity-80">{event.message}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs opacity-65">
                        <span className="inline-flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />{event.customer_name || event.email || "Geen klantgegevens"}</span>
                        <span className="inline-flex items-center gap-1.5"><ShoppingBag className="h-3.5 w-3.5" />{event.total_price} {event.currency}</span>
                        <span>Betaling: {event.financial_status || "-"}</span>
                        <span>Afhandeling: {event.fulfillment_status || "-"}</span>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-card/40 px-3 py-2 text-xs">
                      <p className="font-medium">{event.author || "Shopify"}</p>
                      <p className="mt-1 opacity-60">Order ID: {event.order_id}</p>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm opacity-60">
                Geen Shopify-chatitems gevonden. Controleer Shopify-configuratie of probeer later opnieuw.
              </div>
            )}
          </div>

          {browserNotificationsSupported() && notificationPermission === "granted" && (
            <div className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-border bg-card/30 px-4 py-2 text-sm opacity-75">
              <BellRing className="h-4 w-4 text-accent" />
              Browsermeldingen zijn actief voor nieuwe Shopify chat-events.
            </div>
          )}
        </section>
      </div>
    </LayoutShell>
  );
}