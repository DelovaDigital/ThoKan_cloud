"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { ChevronRight, Folder, LayoutGrid, LogOut, Mail, MessageSquareText, Settings, Shield, Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { ensureSession } from "@/lib/api";

const items = [
  { href: "/dashboard", label: "Overzicht", icon: LayoutGrid },
  { href: "/files", label: "Bestanden", icon: Folder },
  { href: "/shopify", label: "Shopify feed", icon: MessageSquareText },
  { href: "/mail", label: "E-mail", icon: Mail },
  { href: "/admin", label: "Admin", icon: Shield },
  { href: "/settings", label: "Instellingen", icon: Settings },
];

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isNative = Capacitor.isNativePlatform();
  const [authChecked, setAuthChecked] = useState(false);
  const activeItem = items.find((item) => pathname.startsWith(item.href)) ?? items[0];

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      const authenticated = await ensureSession();
      if (cancelled) return;
      if (!authenticated) {
        router.replace("/login");
        return;
      }
      setAuthChecked(true);
    }

    void checkAuth();

    return () => {
      cancelled = true;
    };
  }, [router]);

  function handleLogout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    router.replace("/login");
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
      <div className="min-h-screen bg-bg pt-safe-top-offset pb-32">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_35%),radial-gradient(circle_at_bottom,_rgba(14,165,233,0.08),_transparent_30%)]" />
        <main className="relative px-3 py-3">{children}</main>

        <nav className="bottom-safe-lift fixed inset-x-3 z-30 rounded-[1.75rem] border border-border/60 bg-card/90 p-2 shadow-glass backdrop-blur-md">
          <div className="grid grid-cols-6 gap-1">
            {items.map((item) => {
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2.5 text-[11px] transition ${
                    active ? "bg-accent/15 text-accent" : "opacity-70"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? "text-accent" : ""}`} />
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
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.14),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.1),_transparent_26%)]" />
      <div className="relative mx-auto grid max-w-7xl grid-cols-12 gap-4 p-4 lg:gap-5 lg:p-5">
        <aside className="glass col-span-12 rounded-[2rem] p-4 lg:sticky lg:top-4 lg:col-span-3 lg:h-[calc(100vh-2rem)] lg:overflow-hidden lg:p-5">
          <div className="flex h-full min-h-0 flex-col">
            <div className="rounded-[1.75rem] border border-border/70 bg-card/50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-45">ThoKan</p>
                  <h2 className="text-lg font-semibold">Cloud omgeving</h2>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-border/70 bg-card/40 p-3">
                <p className="text-xs uppercase tracking-[0.2em] opacity-45">Huidige sectie</p>
                <div className="mt-2 flex items-center justify-between">
                  <div>
                    <p className="text-base font-semibold">{activeItem.label}</p>
                    <p className="text-xs opacity-55">Actieve werkruimte</p>
                  </div>
                  <activeItem.icon className="h-5 w-5 text-accent" />
                </div>
              </div>
            </div>

            <nav className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
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
                      <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${active ? "bg-accent/15" : "bg-card/50"}`}>
                        <Icon className="h-4 w-4" />
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

            <div className="mt-auto hidden rounded-[1.75rem] border border-border/70 bg-card/35 p-4 text-sm opacity-65 lg:block">
              Snelle toegang tot bestanden, e-mail, admin en updates vanuit één consistente omgeving.
            </div>
          </div>
        </aside>
        <main className="col-span-12 lg:col-span-9">
          <div className="mb-4 rounded-[1.75rem] border border-border/60 bg-card/35 px-4 py-3 shadow-glass backdrop-blur sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-45">Werkruimte</p>
                <h1 className="text-lg font-semibold">{activeItem.label}</h1>
              </div>
              <div className="rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent">
                Actief
              </div>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
