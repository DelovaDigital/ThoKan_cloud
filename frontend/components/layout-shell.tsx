"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { LayoutGrid, Folder, Mail, Shield, Settings } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/files", label: "Files", icon: Folder },
  { href: "/mail", label: "Mail", icon: Mail },
  { href: "/admin", label: "Admin", icon: Shield },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isNative = Capacitor.isNativePlatform();

  function handleLogout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    router.push("/login");
  }

  if (isNative) {
    return (
      <div className="min-h-screen bg-bg pt-safe-top-offset pb-32">
        <main className="px-3 py-3">{children}</main>

        <nav className="bottom-safe-lift fixed inset-x-3 z-30 rounded-2xl border border-border/60 bg-card/95 backdrop-blur-md">
          <div className="grid grid-cols-5 px-1 py-3">
            {items.map((item) => {
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] transition ${
                    active ? "text-accent" : "opacity-70"
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
    <div className="min-h-screen">
      <div className="mx-auto grid max-w-7xl grid-cols-12 gap-4 p-4">
        <aside className="glass col-span-12 rounded-2xl p-4 lg:col-span-3">
          <div className="mb-4">
            <img src="/Logo_tekst_CV.png" alt="ThoKan Cloud" className="h-12 w-auto" />
          </div>
          <nav className="space-y-2">
            {items.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-xl px-3 py-2 transition ${
                    active ? "bg-accent/20 text-accent" : "hover:bg-card/70"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-4 space-y-2">
            <ThemeToggle />
            <button
              onClick={handleLogout}
              className="w-full rounded-xl border border-border px-3 py-2 text-left text-sm transition hover:bg-card/70"
            >
              Logout
            </button>
          </div>
        </aside>
        <main className="col-span-12 lg:col-span-9">{children}</main>
      </div>
    </div>
  );
}
