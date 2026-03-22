"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { ChevronRight, Folder, LayoutGrid, LogOut, Mail, MessageSquare, MessageSquareText, Settings, Shield, Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { ensureSession, getApiBase } from "@/lib/api";

const items = [
  { href: "/dashboard", label: "Overzicht", icon: LayoutGrid },
  { href: "/files", label: "Bestanden", icon: Folder },
  { href: "/shopify", label: "Shopify", icon: MessageSquareText },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/mail", label: "E-mail", icon: Mail },
  { href: "/admin", label: "Admin", icon: Shield },
  { href: "/settings", label: "Instellingen", icon: Settings },
];

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isNative = Capacitor.isNativePlatform();
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUserName, setCurrentUserName] = useState("Workspace");
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const latestIncomingByUserRef = useRef<Record<string, string>>({});
  const currentUserIdRef = useRef("");
  const chatNotificationsInitializedRef = useRef(false);
  const activeItem = items.find((item) => pathname.startsWith(item.href)) ?? items[0];

  useEffect(() => {
    try {
      const savedMap = localStorage.getItem("chat_latest_incoming_by_user");
      if (savedMap) {
        latestIncomingByUserRef.current = JSON.parse(savedMap) as Record<string, string>;
      }
      const savedUnread = localStorage.getItem("chat_unread_count");
      if (savedUnread) {
        const value = Number(savedUnread);
        if (!Number.isNaN(value) && value > 0) {
          setChatUnreadCount(value);
        }
      }
    } catch {
      // Ignore storage errors.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      const authenticated = await ensureSession();
      if (cancelled) return;
      if (!authenticated) {
        window.location.replace("/login");
        return;
      }

      try {
        let token: string | null = null;
        try {
          token = localStorage.getItem("access_token");
        } catch {
          token = null;
        }

        if (token) {
          const response = await fetch(`${getApiBase()}/auth/me`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
            credentials: "include",
            cache: "no-store",
          });
          if (response.ok) {
            const me = (await response.json()) as { full_name?: string; id?: string };
            if (!cancelled) {
              setCurrentUserName(me.full_name || "Workspace");
              currentUserIdRef.current = me.id || currentUserIdRef.current;
            }
          }
        }
      } catch {
        // Ignore best-effort profile fetch errors.
      }

      setAuthChecked(true);
    }

    void checkAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authChecked || isNative) return;
    let cancelled = false;

    async function pollChatNotifications() {
      try {
        let token: string | null = null;
        try {
          token = localStorage.getItem("access_token");
        } catch {
          token = null;
        }
        if (!token) return;

        const headers = { Authorization: `Bearer ${token}` };

        if (!currentUserIdRef.current) {
          const meResponse = await fetch(`${getApiBase()}/auth/me`, {
            method: "GET",
            headers,
            credentials: "include",
            cache: "no-store",
          });
          if (!meResponse.ok) return;
          const me = (await meResponse.json()) as { id?: string };
          currentUserIdRef.current = me.id || "";
        }

        const usersResponse = await fetch(`${getApiBase()}/chat/users`, {
          method: "GET",
          headers,
          credentials: "include",
          cache: "no-store",
        });
        if (!usersResponse.ok) return;

        const users = (await usersResponse.json()) as Array<{ id: string; full_name: string }>;
        if (!Array.isArray(users) || users.length === 0) return;

        let unreadIncrement = 0;
        for (const user of users) {
          const conversationResponse = await fetch(`${getApiBase()}/chat/conversations/${user.id}`, {
            method: "GET",
            headers,
            credentials: "include",
            cache: "no-store",
          });
          if (!conversationResponse.ok) continue;
          const conversation = (await conversationResponse.json()) as {
            messages?: Array<{ id: string; sender_id: string; body: string }>;
          };

          const latestIncoming = (conversation.messages || []).slice().reverse().find((message) => message.sender_id !== currentUserIdRef.current);
          if (!latestIncoming) continue;

          const previous = latestIncomingByUserRef.current[user.id];
          if (!previous) {
            latestIncomingByUserRef.current[user.id] = latestIncoming.id;
            continue;
          }

          if (previous !== latestIncoming.id) {
            latestIncomingByUserRef.current[user.id] = latestIncoming.id;
            if (!pathname.startsWith("/chat")) {
              unreadIncrement += 1;
            }

            if (document.hidden && "Notification" in window && Notification.permission === "granted") {
              new Notification(`Nieuw chatbericht van ${user.full_name}`, { body: latestIncoming.body });
            }
          }
        }

        if (!cancelled && unreadIncrement > 0) {
          setChatUnreadCount((value) => {
            const next = value + unreadIncrement;
            try {
              localStorage.setItem("chat_unread_count", String(next));
            } catch {
              // Ignore storage errors.
            }
            return next;
          });
        }

        try {
          localStorage.setItem("chat_latest_incoming_by_user", JSON.stringify(latestIncomingByUserRef.current));
        } catch {
          // Ignore storage errors.
        }
      } catch {
        // Best-effort polling only.
      }
    }

    if (!chatNotificationsInitializedRef.current && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => undefined);
      chatNotificationsInitializedRef.current = true;
    }

    if (pathname.startsWith("/chat")) {
      setChatUnreadCount(0);
      try {
        localStorage.setItem("chat_unread_count", "0");
      } catch {
        // Ignore storage errors.
      }
    }

    void pollChatNotifications();
    const interval = setInterval(() => {
      void pollChatNotifications();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [authChecked, isNative, pathname]);

  function handleLogout() {
    try {
      localStorage.removeItem("access_token");
    } catch {
      // Ignore storage errors.
    }
    window.location.replace("/login");
  }

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="glass rounded-3xl px-6 py-5 text-center">
          <p className="text-sm opacity-60">Laden...</p>
        </div>
      </div>
    );
  }

    if (isNative) {
    return (
      <div className="min-h-screen bg-bg pt-safe-top-offset pb-36">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_35%),radial-gradient(circle_at_bottom,_rgba(14,165,233,0.08),_transparent_30%)]" />
        <main className="relative px-3 py-3">{children}</main>

        <nav className="bottom-safe-lift fixed inset-x-3 z-30 rounded-[1.75rem] border border-border/60 bg-card/90 p-3 shadow-glass backdrop-blur-md hide-scrollbar">
          <div className="flex flex-wrap justify-between gap-1">
            {items.map((item) => {
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2.5 text-[11px] flex-1 basis-1/6 transition ${
                    active ? "bg-accent/15 text-accent" : "opacity-70"
                  }`}
                >
                  <div className="relative">
                    <Icon className={`h-4 w-4 ${active ? "text-accent" : ""}`} />
                    {item.href === "/chat" && chatUnreadCount > 0 && (
                      <span className="absolute -right-2 -top-2 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                        {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                      </span>
                    )}
                  </div>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.14),_transparent_24%),radial-gradient(circle_at_18%_22%,_rgba(14,165,233,0.14),_transparent_18%),radial-gradient(circle_at_bottom_right,_rgba(249,115,22,0.1),_transparent_24%)]" />
      <div className="pointer-events-none fixed inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(148,163,184,0.35)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.35)_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="relative mx-auto grid max-w-7xl grid-cols-12 gap-4 p-4 lg:gap-5 lg:p-5">
        <aside className="glass col-span-12 rounded-[2rem] p-4 lg:sticky lg:top-4 lg:col-span-3 lg:p-5">
          <div className="flex h-full min-h-0 flex-col">
            <div className="rounded-[1.75rem] border border-border/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.52),rgba(255,255,255,0.22))] p-4 dark:bg-[linear-gradient(145deg,rgba(15,23,42,0.72),rgba(15,23,42,0.36))]">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent shadow-[inset_0_0_0_1px_rgba(59,130,246,0.14)]">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-45">ThoKan</p>
                  <h2 className="text-lg font-semibold">Control workspace</h2>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div className="rounded-2xl border border-border/70 bg-card/40 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] opacity-45">Actieve sectie</p>
                  <div className="mt-2 flex items-center justify-between">
                    <div>
                      <p className="text-base font-semibold">{activeItem.label}</p>
                      <p className="text-xs opacity-55">Actieve werkruimte</p>
                    </div>
                    <activeItem.icon className="h-5 w-5 text-accent" />
                  </div>
                </div>
                <div className="rounded-2xl border border-border/70 bg-card/35 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] opacity-45">Account context</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{currentUserName}</p>
                      <p className="text-xs opacity-55">{isNative ? "Mobiele sessie" : "Websessie"}</p>
                    </div>
                    <div className="rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent">
                      {chatUnreadCount > 0 ? `${chatUnreadCount} nieuw` : "Live"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <nav className="mt-4 space-y-2 overflow-y-visible pr-1 hide-scrollbar">
              {items.map((item) => {
                const active = pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center justify-between rounded-2xl px-3.5 py-3 transition ${
                      active ? "bg-accent/15 text-accent shadow-sm" : "hover:bg-card/70"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`relative flex h-10 w-10 items-center justify-center rounded-2xl ${active ? "bg-accent/15" : "bg-card/50"}`}>
                        <Icon className="h-4 w-4" />
                        {item.href === "/chat" && chatUnreadCount > 0 && (
                          <span className="absolute -right-1 -top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                            {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs opacity-50">Open {item.label.toLowerCase()}</p>
                      </div>
                    </div>
                    <ChevronRight className={`h-4 w-4 transition ${active ? "opacity-100" : "opacity-30"}`} />
                  </Link>
                );
              })}
            </nav>

            <div className="mt-4 rounded-[1.75rem] border border-border/70 bg-card/45 p-4">
              <p className="text-xs uppercase tracking-[0.2em] opacity-45">Werkruimte tools</p>
              <div className="mt-3 space-y-2">
                <ThemeToggle />
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center justify-between rounded-2xl border border-border px-3.5 py-3 text-left text-sm transition hover:bg-card/70"
                >
                  <span>Uitloggen</span>
                  <LogOut className="h-4 w-4 opacity-60" />
                </button>
              </div>
            </div>

            <div className="mt-4 hidden rounded-[1.75rem] border border-border/70 bg-card/35 p-4 lg:block">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Workflow focus</p>
              <p className="mt-2 text-sm opacity-70">
                Bestanden, commerce, chat en beheer zitten nu in dezelfde vaste shell zodat context, acties en status niet meer per pagina wisselen.
              </p>
            </div>
          </div>
        </aside>
        <main className="col-span-12 lg:col-span-9">
          <div className="mb-4 rounded-[1.75rem] border border-border/60 bg-card/35 px-4 py-4 shadow-glass backdrop-blur sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-45">Werkruimte</p>
                <h1 className="text-lg font-semibold">{activeItem.label}</h1>
                <p className="mt-1 text-sm opacity-60">Eenzelfde shell voor acties, meldingen en instellingen over alle modules heen.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-full bg-card/55 px-3 py-1 text-xs font-medium opacity-75">
                  {isNative ? "Native" : "Web"}
                </div>
                <div className="rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent">
                  {chatUnreadCount > 0 ? `${chatUnreadCount} ongelezen berichten` : "Actief"}
                </div>
              </div>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
