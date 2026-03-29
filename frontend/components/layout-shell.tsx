"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { motion, AnimatePresence } from "framer-motion";
import {
  Folder,
  House,
  LogOut,
  Mail,
  MessageSquare,
  MessageSquareText,
  Settings,
  Shield,
  ChevronLeft,
  ChevronRight,
  Monitor,
  Smartphone,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { ensureSession, getApiBase } from "@/lib/api";
import { cn } from "@/lib/utils";

const items = [
  { href: "/workspace", label: "Workspace",    icon: House },
  { href: "/dashboard", label: "Analyse",      icon: Smartphone },
  { href: "/files",     label: "Bestanden",    icon: Folder },
  { href: "/shopify",   label: "Orders",       icon: MessageSquareText },
  { href: "/chat",      label: "Chat",         icon: MessageSquare },
  { href: "/mail",      label: "E-mail",       icon: Mail },
  { href: "/admin",     label: "Admin",        icon: Shield },
  { href: "/settings",  label: "Instellingen", icon: Settings },
];

const mobileItems = [
  { href: "/workspace", label: "Home", icon: House },
  { href: "/files", label: "Files", icon: Folder },
  { href: "/mail", label: "Mail", icon: Mail },
  { href: "/shopify", label: "Orders", icon: MessageSquareText },
  { href: "/settings", label: "Instel", icon: Settings },
];

/* ─── Sidebar width constants ──────────────────────────────── */
const SIDEBAR_EXPANDED = 256;
const SIDEBAR_COLLAPSED = 68;

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname  = usePathname();
  const isNative  = Capacitor.isNativePlatform();
  const [authChecked,       setAuthChecked]       = useState(false);
  const [currentUserName,   setCurrentUserName]   = useState("Workspace");
  const [currentUserEmail,  setCurrentUserEmail]  = useState("");
  const [chatUnreadCount,   setChatUnreadCount]   = useState(0);
  const [sidebarCollapsed,  setSidebarCollapsed]  = useState(false);

  const latestIncomingByUserRef          = useRef<Record<string, string>>({});
  const currentUserIdRef                 = useRef("");
  const chatNotificationsInitializedRef  = useRef(false);
  const activeItem = items.find((item) => pathname.startsWith(item.href)) ?? items[0];

  /* ── Restore persisted state ─────────────────────────────── */
  useEffect(() => {
    try {
      const savedMap = localStorage.getItem("chat_latest_incoming_by_user");
      if (savedMap) latestIncomingByUserRef.current = JSON.parse(savedMap) as Record<string, string>;
      const savedUnread = localStorage.getItem("chat_unread_count");
      if (savedUnread) {
        const value = Number(savedUnread);
        if (!Number.isNaN(value) && value > 0) setChatUnreadCount(value);
      }
      const savedCollapsed = localStorage.getItem("sidebar_collapsed");
      if (savedCollapsed === "true") setSidebarCollapsed(true);
    } catch { /* ignore */ }
  }, []);

  /* ── Auth check ──────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    async function checkAuth() {
      const authenticated = await ensureSession();
      if (cancelled) return;
      if (!authenticated) { window.location.replace("/login"); return; }
      try {
        const token = localStorage.getItem("access_token");
        if (token) {
          const response = await fetch(`${getApiBase()}/auth/me`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
            credentials: "include",
            cache: "no-store",
          });
          if (response.ok) {
            const me = (await response.json()) as { full_name?: string; email?: string; id?: string };
            if (!cancelled) {
              setCurrentUserName(me.full_name || "Workspace");
              setCurrentUserEmail(me.email || "");
              currentUserIdRef.current = me.id || currentUserIdRef.current;
            }
          }
        }
      } catch { /* ignore */ }
      setAuthChecked(true);
    }
    void checkAuth();
    return () => { cancelled = true; };
  }, []);

  /* ── Chat notification polling ───────────────────────────── */
  useEffect(() => {
    if (!authChecked) return;
    let cancelled = false;

    async function pollChatNotifications() {
      try {
        const token = localStorage.getItem("access_token");
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };
        if (!currentUserIdRef.current) {
          const meResponse = await fetch(`${getApiBase()}/auth/me`, { method: "GET", headers, credentials: "include", cache: "no-store" });
          if (!meResponse.ok) return;
          const me = (await meResponse.json()) as { id?: string };
          currentUserIdRef.current = me.id || "";
        }
        const usersResponse = await fetch(`${getApiBase()}/chat/users`, { method: "GET", headers, credentials: "include", cache: "no-store" });
        if (!usersResponse.ok) return;
        const users = (await usersResponse.json()) as Array<{ id: string; full_name: string }>;
        if (!Array.isArray(users) || users.length === 0) return;
        let unreadIncrement = 0;
        for (const user of users) {
          const conversationResponse = await fetch(`${getApiBase()}/chat/conversations/${user.id}`, { method: "GET", headers, credentials: "include", cache: "no-store" });
          if (!conversationResponse.ok) continue;
          const conversation = (await conversationResponse.json()) as { messages?: Array<{ id: string; sender_id: string; body: string }> };
          const latestIncoming = (conversation.messages || []).slice().reverse().find((m) => m.sender_id !== currentUserIdRef.current);
          if (!latestIncoming) continue;
          const previous = latestIncomingByUserRef.current[user.id];
          if (!previous) { latestIncomingByUserRef.current[user.id] = latestIncoming.id; continue; }
          if (previous !== latestIncoming.id) {
            latestIncomingByUserRef.current[user.id] = latestIncoming.id;
            if (!pathname.startsWith("/chat")) unreadIncrement += 1;
            if (document.hidden && "Notification" in window && Notification.permission === "granted") {
              new Notification(`Nieuw chatbericht van ${user.full_name}`, { body: latestIncoming.body });
            }
          }
        }
        if (!cancelled && unreadIncrement > 0) {
          setChatUnreadCount((v) => {
            const next = v + unreadIncrement;
            try { localStorage.setItem("chat_unread_count", String(next)); } catch { /* ignore */ }
            return next;
          });
        }
        try { localStorage.setItem("chat_latest_incoming_by_user", JSON.stringify(latestIncomingByUserRef.current)); } catch { /* ignore */ }
      } catch { /* best-effort */ }
    }

    if (!chatNotificationsInitializedRef.current && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => undefined);
      chatNotificationsInitializedRef.current = true;
    }
    if (pathname.startsWith("/chat")) {
      setChatUnreadCount(0);
      try { localStorage.setItem("chat_unread_count", "0"); } catch { /* ignore */ }
    }

    const handleRefresh = () => {
      void pollChatNotifications();
    };

    void pollChatNotifications();
    const interval = setInterval(() => { void pollChatNotifications(); }, 3000);
    window.addEventListener("app-active", handleRefresh as EventListener);
    window.addEventListener("network-online", handleRefresh as EventListener);
    window.addEventListener("visibilitychange", handleRefresh);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("app-active", handleRefresh as EventListener);
      window.removeEventListener("network-online", handleRefresh as EventListener);
      window.removeEventListener("visibilitychange", handleRefresh);
    };
  }, [authChecked, pathname]);

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("sidebar_collapsed", String(next)); } catch { /* ignore */ }
      return next;
    });
  }

  function handleLogout() {
    try { localStorage.removeItem("access_token"); } catch { /* ignore */ }
    window.location.replace("/login");
  }

  /* ── Loading state ──────────────────────────────────────── */
  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="relative h-10 w-10">
            <div className="absolute inset-0 rounded-full border-2 border-border" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-accent" />
          </div>
          <p className="text-sm text-muted">Laden…</p>
        </motion.div>
      </div>
    );
  }

  /* ── Native (Capacitor) bottom-tab layout ───────────────── */
  if (isNative) {
    return (
      <div className="min-h-screen bg-bg pb-24 pt-safe-top-offset">
        <main className="px-3 py-3">{children}</main>
        <nav className="bottom-safe-lift fixed inset-x-0 z-30 border-t border-border bg-card/95 backdrop-blur-md">
          <div className="flex items-center justify-around px-1 py-1">
            {mobileItems.map((item) => {
              const active = pathname.startsWith(item.href);
              const Icon   = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-[10px] font-medium transition-all duration-150",
                    active ? "text-accent" : "text-muted active:scale-95",
                  )}
                >
                  <div className="relative">
                    {active && (
                      <motion.div
                        layoutId="native-tab-bg"
                        className="absolute inset-0 -m-1.5 rounded-xl bg-accent/10"
                        transition={{ type: "spring", bounce: 0.25, duration: 0.4 }}
                      />
                    )}
                    <Icon className="relative h-5 w-5" />
                    {item.href === "/chat" && chatUnreadCount > 0 && (
                      <span className="absolute -right-2 -top-1.5 inline-flex min-h-[16px] min-w-[16px] items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold text-white">
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

  /* ── Web layout ─────────────────────────────────────────── */
  const sidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

  return (
    <div className="flex min-h-screen bg-bg">
      {/* ─── Sidebar ─────────────────────────────────────────── */}
      <motion.aside
        animate={{ width: sidebarWidth }}
        transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
        className="fixed inset-y-0 left-0 z-20 flex flex-col overflow-hidden border-r border-border bg-card"
        style={{ width: sidebarWidth }}
      >
        {/* Logo / Brand */}
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          <AnimatePresence mode="wait">
            {!sidebarCollapsed ? (
              <motion.div
                key="expanded"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2.5 overflow-hidden"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent">
                  <img src="/Logo.png" alt="ThoKan" className="h-6 w-6 object-contain" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold leading-tight">ThoKan</p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="collapsed"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent"
              >
                <img src="/Logo.png" alt="ThoKan" className="h-5 w-5 object-contain" />
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={toggleSidebar}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-card-hover hover:text-fg"
            aria-label={sidebarCollapsed ? "Sidebar uitklappen" : "Sidebar inklappen"}
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 thin-scrollbar">
          <div className={cn("space-y-0.5", sidebarCollapsed ? "px-2" : "px-2")}>
            {items.map((item) => {
              const active = pathname.startsWith(item.href);
              const Icon   = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                    active
                      ? "bg-accent/10 text-accent"
                      : "text-muted hover:bg-card-hover hover:text-fg",
                    sidebarCollapsed && "justify-center px-0",
                  )}
                >
                  {active && (
                    <motion.div
                      layoutId="sidebar-active-bg"
                      className="absolute inset-0 rounded-lg bg-accent/10"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.35 }}
                    />
                  )}
                  <div className="relative z-10 shrink-0">
                    <Icon className="h-4 w-4" />
                    {item.href === "/chat" && chatUnreadCount > 0 && (
                      <span className="absolute -right-2 -top-2 inline-flex min-h-[14px] min-w-[14px] items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold text-white">
                        {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                      </span>
                    )}
                  </div>
                  <AnimatePresence>
                    {!sidebarCollapsed && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.15 }}
                        className="relative z-10 overflow-hidden whitespace-nowrap"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User + actions */}
        <div className="border-t border-border p-2">
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
                className="mb-2 overflow-hidden rounded-lg bg-card-hover px-3 py-2.5"
              >
                <p className="truncate text-sm font-medium leading-tight">{currentUserName}</p>
                {currentUserEmail && (
                  <p className="truncate text-[11px] text-muted">{currentUserEmail}</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className={cn("flex gap-1", sidebarCollapsed ? "flex-col items-center" : "items-center")}>
            <ThemeToggle />
            <button
              onClick={handleLogout}
              title="Uitloggen"
              className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-muted transition-all duration-150 hover:bg-card-hover hover:text-destructive active:scale-95"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <AnimatePresence>
                {!sidebarCollapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden whitespace-nowrap"
                  >
                    Uitloggen
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>
        </div>
      </motion.aside>

      {/* ─── Main content area ──────────────────────────────────── */}
      <motion.div
        animate={{ marginLeft: sidebarWidth }}
        transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
        className="flex min-h-screen flex-1 flex-col"
      >
        {/* Top bar */}
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-card/95 px-6 backdrop-blur-md">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-widest text-muted">
              {activeItem.label}
            </p>
          </div>
          <div className="flex items-center gap-2 text-muted">
            <span
              title={isNative ? "Native App" : "Web"}
              className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium"
            >
              {isNative ? <Smartphone className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
              {isNative ? "Native" : "Web"}
            </span>
            {chatUnreadCount > 0 && (
              <span className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-destructive">
                <MessageSquare className="h-3 w-3" />
                {chatUnreadCount} ongelezen
              </span>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6">
          {children}
        </main>
      </motion.div>
    </div>
  );
}
