"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Boxes,
  HardDrive,
  Mail,
  PackageCheck,
  RefreshCw,
  Server,
  Sparkles,
  Workflow,
} from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { PageTransition } from "@/components/page-transition";
import { api } from "@/lib/api";

type DashboardData = {
  used_bytes: number;
  files_count: number;
  system_info: {
    hostname: string;
    storage_total_gb: number;
    storage_used_gb: number;
    storage_free_gb: number;
  };
  recent_files: Array<{ id: string; name: string; size_bytes: number; created_at: string }>;
  recent_activity: Array<{ event_type: string; created_at: string }>;
};

type MailInboxResponse = {
  messages: Array<{ id: string; from: string; subject: string; date: string }>;
  total: number;
};

type ShopifyOrdersResponse = {
  orders: Array<{
    id: string;
    name: string;
    customer_name: string;
    financial_status: string;
    fulfillment_status: string;
    total_price: string;
    currency: string;
    created_at: string;
  }>;
  count: number;
};

const REFRESH_MS = 20_000;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value?: string): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ElementType;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="section-block"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">{label}</p>
        <Icon className="h-4 w-4 text-accent" />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </motion.div>
  );
}

export default function WorkspacePage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [mailTotal, setMailTotal] = useState(0);
  const [mailMessages, setMailMessages] = useState<MailInboxResponse["messages"]>([]);
  const [orders, setOrders] = useState<ShopifyOrdersResponse["orders"]>([]);
  const [errorText, setErrorText] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void loadWorkspace(true);

    const interval = window.setInterval(() => {
      void loadWorkspace(false);
    }, REFRESH_MS);

    const onForeground = () => {
      void loadWorkspace(false);
    };

    window.addEventListener("app-active", onForeground as EventListener);
    window.addEventListener("network-online", onForeground as EventListener);
    document.addEventListener("visibilitychange", onForeground);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("app-active", onForeground as EventListener);
      window.removeEventListener("network-online", onForeground as EventListener);
      document.removeEventListener("visibilitychange", onForeground);
    };
  }, []);

  async function loadWorkspace(showLoader: boolean) {
    if (showLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    const nextErrors: string[] = [];

    await Promise.all([
      api<DashboardData>("/dashboard")
        .then((result) => {
          setDashboard(result);
        })
        .catch((err) => {
          nextErrors.push(err instanceof Error ? err.message : "Dashboard laden mislukt");
        }),
      api<MailInboxResponse>("/mail/inbox?limit=6&skip=0")
        .then((result) => {
          setMailTotal(result.total || 0);
          setMailMessages(result.messages || []);
        })
        .catch(() => {
          // Mailconfig is optional; keep workspace operational if unavailable.
          setMailTotal(0);
          setMailMessages([]);
        }),
      api<ShopifyOrdersResponse>("/shopify/orders?limit=6")
        .then((result) => {
          setOrders(result.orders || []);
        })
        .catch(() => {
          // Shopify is optional; keep workspace operational if unavailable.
          setOrders([]);
        }),
    ]);

    setErrorText(nextErrors[0] || "");
    setLoading(false);
    setRefreshing(false);
  }

  const usedStorage = dashboard?.used_bytes ?? 0;
  const freeStorage = useMemo(() => {
    if (!dashboard) return 0;
    return Math.max(0, dashboard.system_info.storage_free_gb);
  }, [dashboard]);

  return (
    <LayoutShell>
      <PageTransition>
        <div className="space-y-4 sm:space-y-5">
          <section className="hero-gradient section-block overflow-hidden">
            <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full bg-white/70 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.2em] text-accent">
                  <Workflow className="h-3.5 w-3.5" />
                  Command Center
                </p>
                <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
                  Moderne cloudwerkruimte voor files, mail en orders.
                </h1>
                <p className="mt-2 max-w-3xl text-sm text-muted sm:text-base">
                  Alle operationele signalen zitten in een centrale cockpit met realtime refresh voor desktop en iOS.
                </p>
              </div>

              <button
                onClick={() => void loadWorkspace(false)}
                className="btn-secondary self-start md:self-auto"
                disabled={refreshing}
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? "Synchroniseren" : "Nu verversen"}
              </button>
            </div>
          </section>

          {errorText && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {errorText}
            </div>
          )}

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Bestanden"
              value={loading ? "..." : `${dashboard?.files_count ?? 0}`}
              hint="Totaal aantal bestanden"
              icon={Boxes}
            />
            <StatCard
              label="Opslag gebruikt"
              value={loading ? "..." : formatBytes(usedStorage)}
              hint={`Vrij: ${freeStorage.toFixed(2)} GB`}
              icon={HardDrive}
            />
            <StatCard
              label="Inbox"
              value={loading ? "..." : `${mailTotal}`}
              hint="Beschikbare mails"
              icon={Mail}
            />
            <StatCard
              label="Orders"
              value={loading ? "..." : `${orders.length}`}
              hint="Laatste Shopify bestellingen"
              icon={PackageCheck}
            />
          </section>

          <section className="grid gap-3 lg:grid-cols-3">
            <article className="section-block lg:col-span-1">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="section-heading">Recente bestanden</h2>
                <Link href="/files" className="btn-ghost">
                  Open
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="space-y-2">
                {(dashboard?.recent_files || []).slice(0, 5).map((file) => (
                  <div key={file.id} className="rounded-lg border border-border bg-card-hover px-3 py-2">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted">
                      {formatBytes(file.size_bytes)} · {formatDate(file.created_at)}
                    </p>
                  </div>
                ))}
                {!loading && (dashboard?.recent_files || []).length === 0 && (
                  <p className="text-sm text-muted">Nog geen bestanden gevonden.</p>
                )}
              </div>
            </article>

            <article className="section-block lg:col-span-1">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="section-heading">Inbox highlights</h2>
                <Link href="/mail" className="btn-ghost">
                  Open
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="space-y-2">
                {mailMessages.slice(0, 5).map((message) => (
                  <div key={message.id} className="rounded-lg border border-border bg-card-hover px-3 py-2">
                    <p className="truncate text-sm font-medium">{message.subject || "(Geen onderwerp)"}</p>
                    <p className="truncate text-xs text-muted">{message.from || "Onbekende afzender"}</p>
                  </div>
                ))}
                {!loading && mailMessages.length === 0 && (
                  <p className="text-sm text-muted">Geen inboxdata of mailconfig ontbreekt.</p>
                )}
              </div>
            </article>

            <article className="section-block lg:col-span-1">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="section-heading">Order tracking</h2>
                <Link href="/shopify" className="btn-ghost">
                  Open
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="space-y-2">
                {orders.slice(0, 5).map((order) => (
                  <div key={order.id} className="rounded-lg border border-border bg-card-hover px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{order.name}</p>
                      <span className="badge badge-accent">{order.fulfillment_status || "open"}</span>
                    </div>
                    <p className="text-xs text-muted">
                      {order.total_price} {order.currency} · {formatDate(order.created_at)}
                    </p>
                  </div>
                ))}
                {!loading && orders.length === 0 && (
                  <p className="text-sm text-muted">Geen orderdata of Shopifyconfig ontbreekt.</p>
                )}
              </div>
            </article>
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            <Link href="/files" className="section-block-hover">
              <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted">
                <Boxes className="h-4 w-4 text-accent" />
                Files
              </p>
              <h3 className="mt-2 text-lg font-semibold">Bestandsomgeving</h3>
              <p className="mt-1 text-sm text-muted">Upload, versies en mappen in een gestroomlijnde workflow.</p>
            </Link>
            <Link href="/mail" className="section-block-hover">
              <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted">
                <Mail className="h-4 w-4 text-accent" />
                Mail
              </p>
              <h3 className="mt-2 text-lg font-semibold">Communicatiehub</h3>
              <p className="mt-1 text-sm text-muted">Inbox, antwoorden en opvolging op één plek.</p>
            </Link>
            <Link href="/shopify" className="section-block-hover">
              <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted">
                <Server className="h-4 w-4 text-accent" />
                Orders
              </p>
              <h3 className="mt-2 text-lg font-semibold">Order cockpit</h3>
              <p className="mt-1 text-sm text-muted">Volg fulfilment en betalingen in realtime.</p>
            </Link>
          </section>

          <div className="flex items-center justify-end gap-2 text-xs text-muted">
            <Sparkles className="h-4 w-4 text-accent" />
            Workspace synchroniseert elke {Math.round(REFRESH_MS / 1000)} seconden.
          </div>
        </div>
      </PageTransition>
    </LayoutShell>
  );
}