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

type ShopifyEvent = {
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

type ShopifyEventFeedResponse = {
  events: ShopifyEvent[];
  count: number;
  orders_checked: number;
};

type WebsiteChatMessage = {
  id: string;
  direction: "inbound" | "outbound";
  message: string;
  sent_at: string;
  author_name: string;
  author_email: string;
  page_url: string;
  metadata: Record<string, unknown>;
};

type WebsiteChatConversation = {
  conversation_id: string;
  source: string;
  status: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  page_url: string;
  shop_domain: string;
  last_message_at: string;
  last_message_preview: string;
  last_message_id: string;
  unread_count: number;
  message_count: number;
  messages?: WebsiteChatMessage[];
};

type WebsiteChatInboxResponse = {
  conversations: WebsiteChatConversation[];
  count: number;
  unread_conversations: number;
  unread_messages: number;
};

type WebsiteChatReadResponse = {
  message: string;
};

const POLL_INTERVAL_MS = 60_000;
const LAST_EVENT_STORAGE_KEY = "shopify-chat-last-event-id";
const LAST_WEBSITE_CHAT_STORAGE_KEY = "shopify-website-chat-last-message-id";

function formatWebsiteChatNotificationTitle(conversation: WebsiteChatConversation) {
  if (conversation.customer_name) {
    return `Nieuwe websitechat: ${conversation.customer_name}`;
  }
  return "Nieuwe websitechat";
}

export default function ShopifyPage() {
  const [events, setEvents] = useState<ShopifyEvent[]>([]);
  const [chatConversations, setChatConversations] = useState<WebsiteChatConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [selectedConversation, setSelectedConversation] = useState<WebsiteChatConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [eventError, setEventError] = useState("");
  const [chatError, setChatError] = useState("");
  const [eventSearch, setEventSearch] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [ordersChecked, setOrdersChecked] = useState(0);
  const [unreadConversations, setUnreadConversations] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    setNotificationPermission(getBrowserNotificationPermission());
    void refreshWorkspace(false);

    const interval = window.setInterval(() => {
      void refreshWorkspace(true);
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedConversationId) {
      setSelectedConversation(null);
      return;
    }

    void loadConversation(selectedConversationId);
  }, [selectedConversationId]);

  async function refreshWorkspace(shouldNotify: boolean) {
    if (shouldNotify) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    await Promise.all([loadEventFeed(shouldNotify), loadWebsiteChats(shouldNotify)]);

    setLoading(false);
    setRefreshing(false);
  }

  async function loadEventFeed(shouldNotify: boolean) {
    try {
      const response = await api<ShopifyEventFeedResponse>("/shopify/chat/feed?limit_orders=12&limit_events=80");
      const nextEvents = response.events || [];
      setEvents(nextEvents);
      setOrdersChecked(response.orders_checked || 0);
      setEventError("");

      if (shouldNotify) {
        notifyAboutNewEvents(nextEvents);
      } else if (nextEvents[0]?.id) {
        localStorage.setItem(LAST_EVENT_STORAGE_KEY, nextEvents[0].id);
      }
    } catch (err) {
      setEvents([]);
      setOrdersChecked(0);
      setEventError(err instanceof Error ? err.message : "Shopify feed laden mislukt");
    }
  }

  async function loadWebsiteChats(shouldNotify: boolean) {
    try {
      const response = await api<WebsiteChatInboxResponse>("/shopify/website-chat/inbox");
      const nextConversations = response.conversations || [];
      setChatConversations(nextConversations);
      setUnreadConversations(response.unread_conversations || 0);
      setUnreadMessages(response.unread_messages || 0);
      setChatError("");

      setSelectedConversationId((current) => {
        if (current && nextConversations.some((conversation) => conversation.conversation_id === current)) {
          return current;
        }
        return nextConversations[0]?.conversation_id || "";
      });

      if (shouldNotify) {
        notifyAboutNewWebsiteChats(nextConversations);
      } else if (nextConversations[0]?.last_message_id) {
        localStorage.setItem(LAST_WEBSITE_CHAT_STORAGE_KEY, nextConversations[0].last_message_id);
      }
    } catch (err) {
      setChatConversations([]);
      setUnreadConversations(0);
      setUnreadMessages(0);
      setSelectedConversationId("");
      setSelectedConversation(null);
      setChatError(err instanceof Error ? err.message : "Websitechats laden mislukt");
    }
  }

  async function loadConversation(conversationId: string) {
    setConversationLoading(true);
    try {
      const conversation = await api<WebsiteChatConversation>(`/shopify/website-chat/conversations/${encodeURIComponent(conversationId)}`);
      setSelectedConversation(conversation);

      const summary = chatConversations.find((item) => item.conversation_id === conversationId);
      const unreadCount = summary?.unread_count || 0;
      if (unreadCount > 0) {
        await api<WebsiteChatReadResponse>(`/shopify/website-chat/conversations/${encodeURIComponent(conversationId)}/read`, {
          method: "POST",
          body: JSON.stringify({}),
        });

        setChatConversations((current) =>
          current.map((item) =>
            item.conversation_id === conversationId ? { ...item, unread_count: 0 } : item,
          ),
        );
        setUnreadConversations((current) => Math.max(0, current - 1));
        setUnreadMessages((current) => Math.max(0, current - unreadCount));
      }
    } catch (err) {
      setSelectedConversation(null);
      setChatError(err instanceof Error ? err.message : "Conversatie laden mislukt");
    }
    setConversationLoading(false);
  }

  function notifyAboutNewEvents(nextEvents: ShopifyEvent[]) {
    const latestEventId = nextEvents[0]?.id;
    if (!latestEventId) {
      return;
    }

    const previousEventId = localStorage.getItem(LAST_EVENT_STORAGE_KEY);
    if (!previousEventId) {
      localStorage.setItem(LAST_EVENT_STORAGE_KEY, latestEventId);
      return;
    }

    if (previousEventId === latestEventId) {
      return;
    }

    const unseenEvents = nextEvents.filter((event) => event.id !== previousEventId).slice(0, 3).reverse();
    for (const event of unseenEvents) {
      sendBrowserNotification(`Nieuw Shopify event: ${event.order_name}`, {
        body: `${event.author}: ${event.message}`,
        tag: `shopify-event-${event.id}`,
      });
    }

    localStorage.setItem(LAST_EVENT_STORAGE_KEY, latestEventId);
  }

  function notifyAboutNewWebsiteChats(nextConversations: WebsiteChatConversation[]) {
    const latestMessageId = nextConversations[0]?.last_message_id;
    if (!latestMessageId) {
      return;
    }

    const previousMessageId = localStorage.getItem(LAST_WEBSITE_CHAT_STORAGE_KEY);
    if (!previousMessageId) {
      localStorage.setItem(LAST_WEBSITE_CHAT_STORAGE_KEY, latestMessageId);
      return;
    }

    if (previousMessageId === latestMessageId) {
      return;
    }

    const unseenConversations = nextConversations.filter((conversation) => conversation.last_message_id !== previousMessageId).slice(0, 3).reverse();
    for (const conversation of unseenConversations) {
      sendBrowserNotification(formatWebsiteChatNotificationTitle(conversation), {
        body: conversation.last_message_preview || conversation.customer_email || "Nieuw chatbericht ontvangen",
        tag: `shopify-website-chat-${conversation.last_message_id}`,
      });
    }

    localStorage.setItem(LAST_WEBSITE_CHAT_STORAGE_KEY, latestMessageId);
  }

  async function enableNotifications() {
    const permission = await requestBrowserNotificationPermission();
    setNotificationPermission(permission);
  }

  const eventTypes = useMemo(() => {
    return Array.from(new Set(events.map((event) => event.type).filter(Boolean))).sort((left, right) => left.localeCompare(right));
  }, [events]);

  const visibleEvents = useMemo(() => {
    const query = eventSearch.trim().toLowerCase();
    return events.filter((event) => {
      if (typeFilter !== "all" && event.type !== typeFilter) {
        return false;
      }
      if (!query) {
        return true;
      }

      return [event.order_name, event.customer_name, event.email, event.author, event.message].some((value) =>
        (value || "").toLowerCase().includes(query),
      );
    });
  }, [events, eventSearch, typeFilter]);

  const visibleConversations = useMemo(() => {
    const query = chatSearch.trim().toLowerCase();
    if (!query) {
      return chatConversations;
    }

    return chatConversations.filter((conversation) => {
      return [
        conversation.customer_name,
        conversation.customer_email,
        conversation.customer_phone,
        conversation.last_message_preview,
        conversation.page_url,
      ].some((value) => (value || "").toLowerCase().includes(query));
    });
  }, [chatConversations, chatSearch]);

  return (
    <LayoutShell>
      <div className="space-y-5">
        <section className="glass overflow-hidden rounded-[2rem] p-5 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/40 px-3 py-1 text-xs font-medium opacity-80">
                <MessageSquareText className="h-3.5 w-3.5 text-accent" />
                Shopify werkruimte
              </div>
              <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">Websitechats en Shopify activiteit</h1>
              <p className="mt-3 max-w-3xl text-sm opacity-70 sm:text-base">
                Deze pagina combineert websitechats die via de ThoKan bridge binnenkomen met de bestaande Shopify order-eventfeed. Shopify Inbox-conversaties zijn niet rechtstreeks beschikbaar via de huidige Admin API-route, dus websitechat loopt hier via de bridge en orderactiviteit via de eventfeed.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={() => void refreshWorkspace(true)}
                  disabled={refreshing}
                  className="inline-flex items-center gap-2 rounded-2xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                  {refreshing ? "Verversen..." : "Werkruimte verversen"}
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
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Chats</p>
                <p className="mt-2 text-2xl font-semibold">{chatConversations.length}</p>
                <p className="mt-1 text-sm opacity-60">Bekende websiteconversaties</p>
              </div>
              <div className="rounded-[1.5rem] border border-border/70 bg-card/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Ongelezen</p>
                <p className="mt-2 text-2xl font-semibold">{unreadMessages}</p>
                <p className="mt-1 text-sm opacity-60">Nieuwe chatberichten</p>
              </div>
              <div className="rounded-[1.5rem] border border-border/70 bg-card/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Orderevents</p>
                <p className="mt-2 text-2xl font-semibold">{events.length}</p>
                <p className="mt-1 text-sm opacity-60">In de huidige eventfeed</p>
              </div>
              <div className="rounded-[1.5rem] border border-border/70 bg-card/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Orders</p>
                <p className="mt-2 text-2xl font-semibold">{ordersChecked}</p>
                <p className="mt-1 text-sm opacity-60">Bestellingen gecontroleerd</p>
              </div>
            </div>
          </div>
        </section>

        <section className="glass rounded-[2rem] p-5 sm:p-6">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Websitechats</h2>
              <p className="mt-1 text-sm opacity-65">
                Deze inbox toont berichten die je website of middleware naar de Shopify website-chat bridge in Cloud doorstuurt.
              </p>
            </div>
            <div className="rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent">
              {unreadConversations} gesprekken met nieuwe berichten
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <input
              value={chatSearch}
              onChange={(event) => setChatSearch(event.target.value)}
              placeholder="Zoek op naam, e-mail, telefoon of laatste bericht"
              className="rounded-xl border border-border bg-transparent px-3 py-2 text-sm"
            />
            <div className="inline-flex items-center justify-center rounded-xl border border-border px-3 py-2 text-sm opacity-70">
              {visibleConversations.length} zichtbaar
            </div>
          </div>

          {chatError && <p className="mt-4 text-sm text-red-400">{chatError}</p>}

          <div className="mt-5 grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
            <aside className="space-y-2 rounded-[1.5rem] border border-border bg-card/20 p-3">
              {loading ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm opacity-60">
                  Websitechats laden...
                </div>
              ) : visibleConversations.length > 0 ? (
                visibleConversations.map((conversation) => {
                  const isActive = conversation.conversation_id === selectedConversationId;
                  return (
                    <button
                      key={conversation.conversation_id}
                      onClick={() => setSelectedConversationId(conversation.conversation_id)}
                      className={`w-full rounded-[1.25rem] border p-3 text-left transition ${
                        isActive ? "border-accent bg-accent/10" : "border-border bg-card/20 hover:bg-card/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {conversation.customer_name || conversation.customer_email || "Onbekende bezoeker"}
                          </p>
                          <p className="mt-1 truncate text-xs opacity-60">
                            {conversation.customer_email || conversation.customer_phone || "Geen contactgegevens"}
                          </p>
                        </div>
                        {conversation.unread_count > 0 && (
                          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">
                            {conversation.unread_count}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm opacity-80">{conversation.last_message_preview || "Geen berichtpreview"}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] opacity-55">
                        <span>{conversation.last_message_at ? new Date(conversation.last_message_at).toLocaleString() : "-"}</span>
                        <span>{conversation.message_count} berichten</span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm opacity-60">
                  Geen websitechats gevonden. Schakel eerst de bridge in via Instellingen en laat je website of middleware berichten doorsturen.
                </div>
              )}
            </aside>

            <div className="rounded-[1.5rem] border border-border bg-card/20 p-4">
              {conversationLoading ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm opacity-60">
                  Conversatie laden...
                </div>
              ) : selectedConversation ? (
                <div>
                  <div className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">
                        {selectedConversation.customer_name || selectedConversation.customer_email || "Websitechat"}
                      </h3>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs opacity-65">
                        {selectedConversation.customer_email && <span>{selectedConversation.customer_email}</span>}
                        {selectedConversation.customer_phone && <span>{selectedConversation.customer_phone}</span>}
                        {selectedConversation.shop_domain && <span>{selectedConversation.shop_domain}</span>}
                        <span>Status: {selectedConversation.status || "open"}</span>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-card/40 px-3 py-2 text-xs opacity-70">
                      <p className="font-medium">{selectedConversation.messages?.length || 0} berichten</p>
                      <p className="mt-1">Gesprek: {selectedConversation.conversation_id}</p>
                    </div>
                  </div>

                  {selectedConversation.page_url && (
                    <div className="mt-4 rounded-2xl border border-border/70 bg-card/30 px-4 py-3 text-sm">
                      <p className="text-xs uppercase tracking-[0.18em] opacity-45">Pagina</p>
                      <a href={selectedConversation.page_url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-accent hover:underline">
                        {selectedConversation.page_url}
                      </a>
                    </div>
                  )}

                  <div className="mt-4 space-y-3">
                    {(selectedConversation.messages || []).length > 0 ? (
                      selectedConversation.messages?.map((message) => {
                        const inbound = message.direction !== "outbound";
                        return (
                          <div key={message.id} className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
                            <div className={`max-w-[85%] rounded-[1.25rem] border px-4 py-3 ${
                              inbound ? "border-border bg-card/45" : "border-accent/30 bg-accent/10"
                            }`}>
                              <div className="flex flex-wrap items-center gap-2 text-[11px] opacity-55">
                                <span>{message.author_name || message.author_email || (inbound ? "Bezoeker" : "Team")}</span>
                                <span>{message.sent_at ? new Date(message.sent_at).toLocaleString() : "-"}</span>
                              </div>
                              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.message}</p>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm opacity-60">
                        Deze conversatie bevat nog geen berichten.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm opacity-60">
                  Selecteer links een websitechat om de berichten te bekijken.
                </div>
              )}
            </div>
          </div>

          {browserNotificationsSupported() && notificationPermission === "granted" && (
            <div className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-border bg-card/30 px-4 py-2 text-sm opacity-75">
              <BellRing className="h-4 w-4 text-accent" />
              Browsermeldingen zijn actief voor websitechats en Shopify events.
            </div>
          )}
        </section>

        <section className="glass rounded-[2rem] p-5 sm:p-6">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Shopify orderevents</h2>
              <p className="mt-1 text-sm opacity-65">
                Deze feed bundelt recente Shopify-ordergebeurtenissen tot één stroom op basis van de bestaande Admin API-integratie.
              </p>
            </div>
            <div className="rounded-full bg-card/40 px-3 py-1 text-xs font-medium opacity-75">
              Polling elke 60 seconden
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
            <input
              value={eventSearch}
              onChange={(event) => setEventSearch(event.target.value)}
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

          {eventError && <p className="mt-4 text-sm text-red-400">{eventError}</p>}

          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm opacity-60">
                Shopify events laden...
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
                      <h3 className="mt-3 text-lg font-semibold">{event.order_name || "Onbekende bestelling"}</h3>
                      <p className="mt-1 text-sm opacity-80">{event.message}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs opacity-65">
                        <span className="inline-flex items-center gap-1.5">
                          <UserRound className="h-3.5 w-3.5" />
                          {event.customer_name || event.email || "Geen klantgegevens"}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <ShoppingBag className="h-3.5 w-3.5" />
                          {event.total_price} {event.currency}
                        </span>
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
                Geen Shopify-events gevonden. Controleer Shopify-configuratie of probeer later opnieuw.
              </div>
            )}
          </div>
        </section>
      </div>
    </LayoutShell>
  );
}