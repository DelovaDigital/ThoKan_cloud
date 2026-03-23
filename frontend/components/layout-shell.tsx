"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { Folder, LayoutGrid, LogOut, Mail, MessageSquare, MessageSquareText, Settings, Shield } from "lucide-react";
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
  const [moduleQuery, setModuleQuery] = useState("");
  const latestIncomingByUserRef = useRef<Record<string, string>>({});
  const currentUserIdRef = useRef("");
  const chatNotificationsInitializedRef = useRef(false);
  const moduleSearchRef = useRef<HTMLInputElement | null>(null);
  const activeItem = items.find((item) => pathname.startsWith(item.href)) ?? items[0];
  const filteredItems = useMemo(() => {
    const q = moduleQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.label.toLowerCase().includes(q));
  }, [moduleQuery]);

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

  useEffect(() => {
    function handleQuickSearchShortcut(event: KeyboardEvent) {
      const isK = event.key.toLowerCase() === "k";
      if (!isK) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      moduleSearchRef.current?.focus();
      moduleSearchRef.current?.select();
    }

    window.addEventListener("keydown", handleQuickSearchShortcut);
    return () => window.removeEventListener("keydown", handleQuickSearchShortcut);
  }, []);

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
      <div className="flex min-h-screen items-center justify-center bg-bg px-4">
        <div className="section-block w-full max-w-sm text-center">
          <p className="text-sm opacity-60">Laden...</p>
        </div>
      </div>
    );
  }

  if (isNative) {
    return (
      <div className="min-h-screen bg-bg pb-28 pt-safe-top-offset">
        <main className="px-3 py-3">{children}</main>

        <nav className="bottom-safe-lift fixed inset-x-3 z-30 border border-border bg-card p-2.5 hide-scrollbar">
          <div className="flex flex-wrap justify-between gap-1">
            {items.map((item) => {
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-1 basis-1/6 flex-col items-center justify-center gap-1 px-2 py-2.5 text-[11px] transition ${
                    active ? "bg-accent/10 text-accent" : "opacity-70"
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
    <div className="page-shell">
      <div className="content-wrap py-4 sm:py-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="section-block lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] opacity-55">ThoKan</p>
                <h2 className="text-lg font-semibold">Werkruimte</h2>
              </div>
              <div className="text-right">
                <p className="text-xs opacity-55">Gebruiker</p>
                <p className="max-w-[140px] truncate text-sm font-medium">{currentUserName}</p>
              </div>
            </div>

            <nav className="mt-3 space-y-1.5">
              <div className="mb-2">
                <input
                  ref={moduleSearchRef}
                  value={moduleQuery}
                  onChange={(event) => setModuleQuery(event.target.value)}
                  placeholder="Zoek module (⌘K)"
                  className="w-full border border-border bg-transparent px-3 py-2 text-sm"
                />
              </div>
              {filteredItems.map((item) => {
                const active = pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 border px-3 py-2.5 text-sm transition ${
                      active ? "border-accent/40 bg-accent/10 text-accent" : "border-border hover:bg-card"
                    }`}
                  >
                    <div className="relative">
                      <Icon className="h-4 w-4" />
                      {item.href === "/chat" && chatUnreadCount > 0 && (
                        <span className="absolute -right-2 -top-2 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                          {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                        </span>
                      )}
                    </div>
                    <span className="font-medium">{item.label}</span>
                  </Link>
                );
              })}
              {filteredItems.length === 0 && (
                <p className="border border-dashed border-border px-3 py-2 text-xs opacity-60">Geen modules gevonden.</p>
              )}
            </nav>

            <div className="mt-4 space-y-2 border-t border-border pt-3">
              <ThemeToggle />
              <button
                onClick={handleLogout}
                className="flex w-full items-center justify-between border border-border px-3 py-2.5 text-left text-sm transition hover:bg-card"
              >
                <span>Uitloggen</span>
                <LogOut className="h-4 w-4 opacity-70" />
              </button>
            </div>

          </aside>
          <main className="min-w-0">
            <div className="section-block mb-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] opacity-55">Actieve sectie</p>
                  <h1 className="text-lg font-semibold sm:text-xl">{activeItem.label}</h1>
                </div>
                <div className="inline-flex items-center gap-2 text-xs sm:text-sm">
                  <span className="border border-border px-2 py-1">{isNative ? "Native" : "Web"}</span>
                  <span className="border border-border px-2 py-1">
                    {chatUnreadCount > 0 ? `${chatUnreadCount} ongelezen` : "Actief"}
                  </span>
                </div>
              </div>
            </div>
            <div className="min-w-0">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
