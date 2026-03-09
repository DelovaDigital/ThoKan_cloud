"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";

const items = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/files", label: "Files" },
  { href: "/mail", label: "Mail" },
  { href: "/admin", label: "Admin" },
  { href: "/settings", label: "Settings" },
];

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    router.push("/login");
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
