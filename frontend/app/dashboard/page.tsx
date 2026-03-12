"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Boxes, HardDrive, RefreshCw, Server, ShoppingCart, Sparkles } from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { api } from "@/lib/api";

type DashboardData = {
  used_bytes: number;
  files_count: number;
  system_info: {
    hostname: string;
    platform: string;
    cpu_cores: number;
    storage_path: string;
    storage_total_gb: number;
    storage_used_gb: number;
    storage_free_gb: number;
  };
  recent_files: Array<{ id: string; name: string; size_bytes: number; created_at: string }>;
  recent_activity: Array<{ event_type: string; created_at: string }>;
};

type ShopifyOrder = {
  id: string;
  name: string;
  email: string;
  customer_name: string;
  financial_status: string;
  fulfillment_status: string;
  currency: string;
  total_price: string;
  created_at: string;
  tags?: string;
  cancelled_at?: string;
};

type ShopifyOrderDetail = ShopifyOrder & {
  subtotal_price: string;
  total_tax: string;
  total_discounts: string;
  note: string;
  processed_at?: string;
  order_status_url?: string;
  source_name?: string;
  cancel_reason?: string;
  discount_codes?: string[];
  payment_gateway_names?: string[];
  shipping_lines?: Array<{ title: string; code: string; price: string }>;
  note_attributes?: Array<{ name: string; value: string }>;
  shipping_address: string[];
  billing_address: string[];
  line_items: Array<{
    id: string;
    title: string;
    sku: string;
    quantity: number;
    price: string;
    currency: string;
  }>;
};

type GelatoOrderStatus = {
  found: boolean;
  shopify_order_id: string;
  gelato_order_id?: string;
  external_id?: string;
  status?: string;
  production_status?: string;
  shipping_status?: string;
  delivery_status?: string;
  stage?: string;
  stage_message?: string;
  eta?: string;
  created_at?: string;
  updated_at?: string;
  recipient_name?: string;
  recipient_country?: string;
  tracking_numbers?: string[];
  tracking_urls?: string[];
  carriers?: string[];
  shipment_statuses?: string[];
};

type ShopifyOrderEvent = {
  id: string;
  created_at: string;
  author: string;
  type: string;
  message: string;
};

function ProgressBar({ current, total, color = "bg-accent" }: { current: number; total: number; color?: string }) {
  const percent = total > 0 ? Math.min((current / total) * 100, 100) : 0;
  return (
    <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-card/50">
      <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${percent}%` }} />
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [orders, setOrders] = useState<ShopifyOrder[]>([]);
  const [ordersSearch, setOrdersSearch] = useState("");
  const [ordersSort, setOrdersSort] = useState<"newest" | "oldest" | "amount">("newest");
  const [ordersStatusFilter, setOrdersStatusFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState("all");
  const [ordersError, setOrdersError] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<ShopifyOrderDetail | null>(null);
  const [orderEvents, setOrderEvents] = useState<ShopifyOrderEvent[]>([]);
  const [orderEventsLoading, setOrderEventsLoading] = useState(false);
  const [orderEventsError, setOrderEventsError] = useState("");
  const [orderDetailLoading, setOrderDetailLoading] = useState(false);
  const [orderDetailError, setOrderDetailError] = useState("");
  const [sendGelatoBusy, setSendGelatoBusy] = useState(false);
  const [sendGelatoStatus, setSendGelatoStatus] = useState("");
  const [gelatoStatus, setGelatoStatus] = useState<GelatoOrderStatus | null>(null);
  const [gelatoStatusLoading, setGelatoStatusLoading] = useState(false);
  const [gelatoStatusError, setGelatoStatusError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const result = await api<DashboardData>("/dashboard");
      setData(result);

      try {
        const shopifyOrders = await api<{ orders: ShopifyOrder[] }>("/shopify/orders?limit=10");
        setOrders(shopifyOrders.orders || []);
        setOrdersError("");
      } catch (err) {
        setOrders([]);
        setOrdersError(err instanceof Error ? err.message : "Shopify bestellingen laden mislukt");
      }
    } catch {
      setData(null);
      setOrders([]);
      setOrdersError("Dashboard laden mislukt");
    }
    setLoading(false);
  }

  async function openOrderDetail(orderId: string) {
    setOrderDetailLoading(true);
    setOrderDetailError("");
    setOrderEvents([]);
    setOrderEventsError("");
    setGelatoStatus(null);
    setGelatoStatusError("");
    try {
      const [detail, eventsResult] = await Promise.all([
        api<ShopifyOrderDetail>(`/shopify/orders/${orderId}`),
        loadOrderEvents(orderId),
      ]);
      setSelectedOrder(detail);
      setOrderEvents(eventsResult);
      loadGelatoStatus(orderId);
    } catch (err) {
      setOrderDetailError(err instanceof Error ? err.message : "Besteldetails laden mislukt");
      setSelectedOrder(null);
    }
    setOrderDetailLoading(false);
  }

  async function loadOrderEvents(orderId: string) {
    setOrderEventsLoading(true);
    setOrderEventsError("");
    try {
      const response = await api<{ events: ShopifyOrderEvent[] }>(`/shopify/orders/${orderId}/events`);
      const events = response.events || [];
      setOrderEvents(events);
      return events;
    } catch (err) {
      setOrderEvents([]);
      setOrderEventsError(err instanceof Error ? err.message : "Shopify-events laden mislukt");
      return [];
    } finally {
      setOrderEventsLoading(false);
    }
  }

  async function loadGelatoStatus(orderId: string) {
    setGelatoStatusLoading(true);
    setGelatoStatusError("");
    try {
      const result = await api<GelatoOrderStatus>(`/gelato/orders/from-shopify/${orderId}/status`);
      setGelatoStatus(result);
    } catch (err) {
      setGelatoStatus(null);
      setGelatoStatusError(err instanceof Error ? err.message : "Gelato status laden mislukt");
    }
    setGelatoStatusLoading(false);
  }

  function closeOrderDetail() {
    setSelectedOrder(null);
    setOrderEvents([]);
    setOrderEventsError("");
    setOrderDetailError("");
    setSendGelatoStatus("");
    setGelatoStatus(null);
    setGelatoStatusError("");
  }

  async function sendOrderToGelato() {
    if (!selectedOrder?.id || gelatoStatus?.found) return;
    setSendGelatoBusy(true);
    setSendGelatoStatus("");
    try {
      const result = await api<{ message: string; unmapped_skus?: string[] }>(
        `/gelato/orders/from-shopify/${selectedOrder.id}`,
        {
          method: "POST",
          body: JSON.stringify({}),
        }
      );
      const unmapped = result.unmapped_skus && result.unmapped_skus.length > 0 ? ` (unmapped SKUs: ${result.unmapped_skus.join(", ")})` : "";
      setSendGelatoStatus(`${result.message}${unmapped}`);
      await loadGelatoStatus(selectedOrder.id);
    } catch (err) {
      setSendGelatoStatus(err instanceof Error ? err.message : "Bestelling verzenden naar Gelato mislukt");
    }
    setSendGelatoBusy(false);
  }

  const storagePercent = data?.system_info
    ? (data.system_info.storage_used_gb / data.system_info.storage_total_gb) * 100
    : 0;
  const storageColor = storagePercent > 90 ? "bg-red-500" : storagePercent > 75 ? "bg-yellow-500" : "bg-green-500";
  const hasGelatoOrder = Boolean(gelatoStatus?.found);
  const sendToGelatoDisabled = orderDetailLoading || sendGelatoBusy || !selectedOrder || hasGelatoOrder;

  const activityTypes = useMemo(() => {
    const set = new Set((data?.recent_activity || []).map((entry) => entry.event_type).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data?.recent_activity]);

  const filteredOrders = useMemo(() => {
    const query = ordersSearch.trim().toLowerCase();
    const rows = orders.filter((order) => {
      if (ordersStatusFilter !== "all") {
        const fulfillment = (order.fulfillment_status || "unfulfilled").toLowerCase();
        if (fulfillment !== ordersStatusFilter.toLowerCase()) return false;
      }
      if (!query) return true;
      return [order.name, order.customer_name, order.email, order.financial_status, order.fulfillment_status]
        .some((part) => (part || "").toLowerCase().includes(query));
    });

    return [...rows].sort((a, b) => {
      if (ordersSort === "amount") return Number(b.total_price || 0) - Number(a.total_price || 0);
      const aTime = new Date(a.created_at || 0).getTime();
      const bTime = new Date(b.created_at || 0).getTime();
      return ordersSort === "oldest" ? aTime - bTime : bTime - aTime;
    });
  }, [orders, ordersSearch, ordersSort, ordersStatusFilter]);

  const filteredActivity = useMemo(() => {
    const rows = data?.recent_activity || [];
    if (activityFilter === "all") return rows;
    return rows.filter((entry) => entry.event_type === activityFilter);
  }, [data?.recent_activity, activityFilter]);

  return (
    <LayoutShell>
      <div className="space-y-5">
        <section className="glass overflow-hidden rounded-[2rem] p-5 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[1.25fr_0.95fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/40 px-3 py-1 text-xs font-medium opacity-80">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                Operationeel overzicht
              </div>
              <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">Overzicht</h1>
              <p className="mt-3 max-w-3xl text-sm opacity-70 sm:text-base">
                Volg opslag, recente activiteit en orderoperaties vanuit een heldere werkruimte voor snellere beslissingen.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={loadData}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-2xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  {loading ? "Verversen..." : "Overzicht verversen"}
                </button>
                <div className="rounded-2xl border border-border px-4 py-2.5 text-sm opacity-70">
                  {orders.length} Shopify bestellingen geladen
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.5rem] border border-border/70 bg-card/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Opslag gebruikt</p>
                <p className="mt-2 text-2xl font-semibold">{formatBytes(data?.used_bytes || 0)}</p>
                <p className="mt-1 text-sm opacity-60">Data van gebruikers in opslag</p>
              </div>
              <div className="rounded-[1.5rem] border border-border/70 bg-card/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Files</p>
                <p className="mt-2 text-2xl font-semibold">{data?.files_count || 0}</p>
                <p className="mt-1 text-sm opacity-60">Items in cloudopslag</p>
              </div>
              <div className="rounded-[1.5rem] border border-border/70 bg-card/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Systeemschijf</p>
                <p className="mt-2 text-2xl font-semibold">{storagePercent.toFixed(1)}%</p>
                <p className="mt-1 text-sm opacity-60">Huidig schijfgebruik platform</p>
              </div>
              <div className="rounded-[1.5rem] border border-border/70 bg-card/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Activiteit</p>
                <p className="mt-2 text-2xl font-semibold">{filteredActivity.length}</p>
                <p className="mt-1 text-sm opacity-60">Zichtbare recente events</p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="glass rounded-[1.75rem] p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                <HardDrive className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-medium opacity-70">Totale gebruikte opslag</h3>
                <p className="text-xs opacity-55">Cloud dataverbruik</p>
              </div>
            </div>
            <p className="mt-4 text-3xl font-bold">{formatBytes(data?.used_bytes || 0)}</p>
            <ProgressBar current={data?.used_bytes || 0} total={(data?.system_info?.storage_total_gb || 1) * 1024 ** 3} />
          </div>

          <div className="glass rounded-[1.75rem] p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                <Boxes className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-medium opacity-70">Totaal bestanden</h3>
                <p className="text-xs opacity-55">Beheerde opgeslagen items</p>
              </div>
            </div>
            <p className="mt-4 text-3xl font-bold">{data?.files_count || 0}</p>
            <p className="mt-2 text-sm opacity-60">bestanden geüpload</p>
          </div>

          <div className="glass rounded-[1.75rem] p-5 md:col-span-2 xl:col-span-1">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                <Server className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-medium opacity-70">Systeemschijf</h3>
                <p className="text-xs opacity-55">Hostcapaciteit en vrije ruimte</p>
              </div>
            </div>
            <p className="mt-4 text-3xl font-bold">{storagePercent.toFixed(1)}%</p>
            <ProgressBar
              current={data?.system_info?.storage_used_gb || 0}
              total={data?.system_info?.storage_total_gb || 1}
              color={storageColor}
            />
            <p className="mt-1 text-xs opacity-60">
              {data?.system_info?.storage_free_gb.toFixed(1)} GB vrij van {data?.system_info?.storage_total_gb.toFixed(1)} GB
            </p>
          </div>
        </div>

        <div className="glass rounded-[2rem] p-5 sm:p-6">
          <div className="flex items-start gap-4 border-b border-border/60 pb-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Systeeminformatie</h2>
              <p className="mt-2 text-sm opacity-65">Kerninformatie over de draaiende omgeving.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-border bg-card/30 p-3">
              <span className="text-xs font-medium opacity-70">Hostnaam</span>
              <p className="mt-1 font-mono text-sm">{data?.system_info?.hostname || "-"}</p>
            </div>
            <div className="rounded-xl border border-border bg-card/30 p-3">
              <span className="text-xs font-medium opacity-70">Platform</span>
              <p className="mt-1 font-mono text-sm">{data?.system_info?.platform || "-"}</p>
            </div>
            <div className="rounded-xl border border-border bg-card/30 p-3">
              <span className="text-xs font-medium opacity-70">CPU-kernen</span>
              <p className="mt-1 font-mono text-sm">{data?.system_info?.cpu_cores || 0}</p>
            </div>
            <div className="rounded-xl border border-border bg-card/30 p-3">
              <span className="text-xs font-medium opacity-70">Opslagpad</span>
              <p className="mt-1 truncate font-mono text-sm">{data?.system_info?.storage_path || "-"}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="glass rounded-[2rem] p-5 sm:p-6">
            <div className="flex items-start gap-4 border-b border-border/60 pb-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                <Boxes className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold">Recente bestanden</h3>
                <p className="mt-1 text-sm opacity-65">Recent aangemaakte of geüploade bestanden in de cloud.</p>
              </div>
            </div>
            <ul className="mt-5 space-y-3">
              {data?.recent_files && data.recent_files.length > 0 ? (
                data.recent_files.map((file) => (
                  <li key={file.id} className="flex items-center justify-between gap-3 rounded-[1.5rem] border border-border bg-card/25 p-4">
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-medium">{file.name}</span>
                      <span className="mt-1 block text-xs opacity-55">{new Date(file.created_at).toLocaleString()}</span>
                    </div>
                    <span className="ml-2 shrink-0 text-xs opacity-60">{formatBytes(file.size_bytes)}</span>
                  </li>
                ))
              ) : (
                <li className="rounded-xl border border-dashed border-border p-4 text-center text-sm opacity-60">
                  Nog geen bestanden
                </li>
              )}
            </ul>
          </section>

          <section className="glass rounded-[2rem] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-5">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">Activiteitslog</h3>
                  <p className="mt-1 text-sm opacity-65">Recente systeemacties en operationele gebeurtenissen.</p>
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <label className="text-xs opacity-60">Filter</label>
              <select
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value)}
                className="rounded-lg border border-border bg-transparent px-2 py-1 text-xs"
              >
                <option value="all">Alle activiteit</option>
                {activityTypes.map((activity) => (
                  <option key={activity} value={activity}>
                    {activity}
                  </option>
                ))}
              </select>
            </div>
            <ul className="mt-4 space-y-3">
              {filteredActivity.length > 0 ? (
                filteredActivity.map((entry, index) => (
                  <li key={`${entry.event_type}-${index}`} className="rounded-[1.5rem] border border-border bg-card/25 p-4">
                    <span className="text-sm font-medium">{entry.event_type}</span>
                    <p className="mt-1 text-xs opacity-60">{new Date(entry.created_at).toLocaleString()}</p>
                  </li>
                ))
              ) : (
                <li className="rounded-xl border border-dashed border-border p-4 text-center text-sm opacity-60">
                  Nog geen activiteit
                </li>
              )}
            </ul>
          </section>
        </div>

        <section className="glass rounded-[2rem] p-5 sm:p-6">
          <div className="flex flex-col gap-4 border-b border-border/60 pb-5 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                <ShoppingCart className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold">Shopify bestellingen</h3>
                <p className="mt-1 text-sm opacity-65">Bekijk de laatste shopbestellingen en open volledige orderdetails.</p>
              </div>
            </div>
            <span className="rounded-full bg-card/45 px-3 py-1 text-xs opacity-70">Laatste 10</span>
          </div>

          <div className="mt-5 grid gap-2 md:grid-cols-[1fr_auto_auto]">
            <input
              value={ordersSearch}
              onChange={(e) => setOrdersSearch(e.target.value)}
              placeholder="Zoek bestelling, klant of e-mail"
              className="rounded-xl border border-border bg-transparent px-3 py-2 text-sm"
            />
            <select
              value={ordersSort}
              onChange={(e) => setOrdersSort(e.target.value as "newest" | "oldest" | "amount")}
              className="rounded-xl border border-border bg-transparent px-3 py-2 text-sm"
            >
              <option value="newest">Nieuwste eerst</option>
              <option value="oldest">Oudste eerst</option>
              <option value="amount">Hoogste bedrag</option>
            </select>
            <select
              value={ordersStatusFilter}
              onChange={(e) => setOrdersStatusFilter(e.target.value)}
              className="rounded-xl border border-border bg-transparent px-3 py-2 text-sm"
            >
              <option value="all">Alle afhandeling</option>
              <option value="unfulfilled">Niet vervuld</option>
              <option value="fulfilled">Vervuld</option>
              <option value="partial">Gedeeltelijk</option>
            </select>
          </div>

          {ordersError && <p className="mt-3 text-sm text-red-400">{ordersError}</p>}

          <div className="mt-4 overflow-x-auto rounded-[1.5rem] border border-border bg-card/20">
            {filteredOrders.length > 0 ? (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left opacity-70">
                    <th className="px-4 py-3">Bestelling</th>
                    <th className="px-4 py-3">Klant</th>
                    <th className="px-4 py-3">Totaal</th>
                    <th className="px-4 py-3">Betaling</th>
                    <th className="px-4 py-3">Afhandeling</th>
                    <th className="px-4 py-3">Aangemaakt</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr
                      key={order.id}
                      className="cursor-pointer border-b border-border/50 hover:bg-card/20"
                      onClick={() => openOrderDetail(order.id)}
                    >
                      <td className="px-4 py-3 font-medium">{order.name}</td>
                      <td className="px-4 py-3">{order.customer_name || order.email || "-"}</td>
                      <td className="px-4 py-3">
                        {order.total_price} {order.currency}
                      </td>
                      <td className="px-4 py-3">{order.financial_status || "-"}</td>
                      <td className="px-4 py-3">{order.fulfillment_status || "niet vervuld"}</td>
                      <td className="px-4 py-3">{order.created_at ? new Date(order.created_at).toLocaleString() : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm opacity-60">
                Nog geen Shopify bestellingen of Shopify is niet geconfigureerd.
              </div>
            )}
          </div>
          <p className="mt-2 text-xs opacity-60">Klik op een bestelregel om details te openen.</p>
        </section>

        {(orderDetailLoading || orderDetailError || selectedOrder) && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
            <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl border border-border bg-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Besteldetails</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={sendOrderToGelato}
                    disabled={sendToGelatoDisabled}
                    className="rounded-lg bg-accent px-3 py-1 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    {sendGelatoBusy ? "Verzenden..." : hasGelatoOrder ? "Reeds in Gelato" : "Stuur naar Gelato"}
                  </button>
                  <button onClick={closeOrderDetail} className="rounded-lg border border-border px-3 py-1 text-sm hover:bg-card/70">
                    Sluiten
                  </button>
                </div>
              </div>

              {orderDetailLoading && <p className="text-sm opacity-70">Besteldetails laden...</p>}
              {orderDetailError && <p className="text-sm text-red-400">{orderDetailError}</p>}
              {sendGelatoStatus && <p className="mb-3 text-sm text-green-400">{sendGelatoStatus}</p>}

              {selectedOrder && !orderDetailLoading && (
                <div className="space-y-4 text-sm">
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-xl border border-border bg-card/40 p-3">
                      <p className="text-xs opacity-60">Bestelling</p>
                      <p className="mt-1 font-medium">{selectedOrder.name}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card/40 p-3">
                      <p className="text-xs opacity-60">Klant</p>
                      <p className="mt-1 font-medium">{selectedOrder.customer_name || selectedOrder.email || "-"}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card/40 p-3">
                      <p className="text-xs opacity-60">Aangemaakt</p>
                      <p className="mt-1 font-medium">
                        {selectedOrder.created_at ? new Date(selectedOrder.created_at).toLocaleString() : "-"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-card/40 p-3">
                      <p className="text-xs opacity-60">Status</p>
                      <p className="mt-1 font-medium">{selectedOrder.fulfillment_status || "-"}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-xl border border-border bg-card/40 p-3">
                      <p className="text-xs opacity-60">Subtotaal</p>
                      <p className="mt-1 font-medium">
                        {selectedOrder.subtotal_price} {selectedOrder.currency}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-card/40 p-3">
                      <p className="text-xs opacity-60">Belasting</p>
                      <p className="mt-1 font-medium">
                        {selectedOrder.total_tax} {selectedOrder.currency}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-card/40 p-3">
                      <p className="text-xs opacity-60">Kortingen</p>
                      <p className="mt-1 font-medium">
                        {selectedOrder.total_discounts} {selectedOrder.currency}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-card/40 p-3">
                      <p className="text-xs opacity-60">Totaal</p>
                      <p className="mt-1 font-medium">
                        {selectedOrder.total_price} {selectedOrder.currency}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-border bg-card/40 p-3">
                      <p className="text-xs opacity-60">Verzendadres</p>
                      <div className="mt-1 space-y-1">
                        {selectedOrder.shipping_address.length > 0 ? (
                          selectedOrder.shipping_address.map((line, idx) => (
                            <p key={`shipping-${idx}`} className="font-medium">
                              {line}
                            </p>
                          ))
                        ) : (
                          <p className="font-medium">-</p>
                        )}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-card/40 p-3">
                      <p className="text-xs opacity-60">Factuuradres</p>
                      <div className="mt-1 space-y-1">
                        {selectedOrder.billing_address.length > 0 ? (
                          selectedOrder.billing_address.map((line, idx) => (
                            <p key={`billing-${idx}`} className="font-medium">
                              {line}
                            </p>
                          ))
                        ) : (
                          <p className="font-medium">-</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-border bg-card/40 p-3">
                      <p className="text-xs opacity-60">Bron & tags</p>
                      <p className="mt-1 font-medium">Bron: {selectedOrder.source_name || "-"}</p>
                      <p className="mt-1 text-xs opacity-70">Tags: {selectedOrder.tags || "-"}</p>
                      {selectedOrder.discount_codes && selectedOrder.discount_codes.length > 0 && (
                        <p className="mt-1 text-xs opacity-70">Kortingcodes: {selectedOrder.discount_codes.join(", ")}</p>
                      )}
                    </div>
                    <div className="rounded-xl border border-border bg-card/40 p-3">
                      <p className="text-xs opacity-60">Betaal- en verzendinfo</p>
                      <p className="mt-1 text-xs opacity-70">
                        Betaalgateways: {selectedOrder.payment_gateway_names && selectedOrder.payment_gateway_names.length > 0 ? selectedOrder.payment_gateway_names.join(", ") : "-"}
                      </p>
                      {selectedOrder.shipping_lines && selectedOrder.shipping_lines.length > 0 ? (
                        <ul className="mt-1 space-y-1 text-xs opacity-70">
                          {selectedOrder.shipping_lines.map((line, idx) => (
                            <li key={`${line.title}-${idx}`}>{line.title || "Verzending"}: {line.price} {selectedOrder.currency}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-xs opacity-70">Geen verzendlijnen</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-card/40 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs opacity-60">Shopify events & orderactiviteit</p>
                      {selectedOrder?.id && (
                        <button
                          onClick={() => void loadOrderEvents(selectedOrder.id)}
                          disabled={orderEventsLoading}
                          className="rounded-lg border border-border px-2 py-1 text-xs transition hover:bg-card/70 disabled:opacity-50"
                        >
                          {orderEventsLoading ? "Verversen..." : "Gebeurtenissen verversen"}
                        </button>
                      )}
                    </div>
                    {orderEventsError && <p className="text-sm text-red-400">{orderEventsError}</p>}
                    {!orderEventsError && orderEvents.length === 0 && !orderEventsLoading && (
                      <p className="text-sm opacity-70">Geen Shopify-gebeurtenissen gevonden voor deze bestelling.</p>
                    )}
                    {orderEventsLoading && <p className="text-sm opacity-70">Shopify-gebeurtenissen laden...</p>}
                    {orderEvents.length > 0 && (
                      <ul className="space-y-2">
                        {orderEvents.slice(0, 30).map((event) => (
                          <li key={event.id} className="rounded-lg border border-border/70 bg-card/30 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs font-medium uppercase opacity-65">{event.type}</p>
                              <p className="text-xs opacity-55">{event.created_at ? new Date(event.created_at).toLocaleString() : "-"}</p>
                            </div>
                            <p className="mt-1 text-sm font-medium">{event.author}</p>
                            <p className="mt-1 text-sm opacity-80">{event.message}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="rounded-xl border border-border bg-card/40 p-3">
                      <p className="text-xs opacity-60">Bestelregels</p>
                    {selectedOrder.line_items.length > 0 ? (
                      <div className="mt-2 overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-left opacity-70">
                              <th className="px-2 py-2">Product</th>
                              <th className="px-2 py-2">SKU</th>
                              <th className="px-2 py-2">Aantal</th>
                              <th className="px-2 py-2">Prijs</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedOrder.line_items.map((item) => (
                              <tr key={item.id || `${item.title}-${item.sku}`} className="border-b border-border/50">
                                <td className="px-2 py-2">{item.title || "-"}</td>
                                <td className="px-2 py-2">{item.sku || "-"}</td>
                                <td className="px-2 py-2">{item.quantity}</td>
                                <td className="px-2 py-2">
                                  {item.price} {item.currency}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="mt-1 font-medium">Geen orderregels</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-border bg-card/40 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs opacity-60">Gelato-afhandeling</p>
                      {selectedOrder?.id && (
                        <button
                          onClick={() => loadGelatoStatus(selectedOrder.id)}
                          disabled={gelatoStatusLoading}
                          className="rounded-lg border border-border px-2 py-1 text-xs transition hover:bg-card/70 disabled:opacity-50"
                        >
                          {gelatoStatusLoading ? "Verversen..." : "Ververs Gelato"}
                        </button>
                      )}
                    </div>

                    {gelatoStatusLoading && <p className="mt-2 text-sm opacity-70">Gelato status laden...</p>}
                    {gelatoStatusError && <p className="mt-2 text-sm text-red-400">{gelatoStatusError}</p>}

                    {!gelatoStatusLoading && !gelatoStatusError && gelatoStatus && !gelatoStatus.found && (
                      <p className="mt-2 text-sm opacity-70">Nog geen Gelato-bestelling gevonden voor deze Shopify-bestelling.</p>
                    )}

                    {!gelatoStatusLoading && !gelatoStatusError && gelatoStatus?.found && (
                      <div className="mt-3 space-y-3">
                        <div className="rounded-xl border border-border bg-card/30 p-3">
                          <p className="text-xs opacity-60">Huidige fase</p>
                          <p className="mt-1 font-medium">{gelatoStatus.stage || "-"}</p>
                          {gelatoStatus.stage_message && <p className="mt-1 text-xs opacity-70">{gelatoStatus.stage_message}</p>}
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                          <div className="rounded-xl border border-border bg-card/30 p-3">
                            <p className="text-xs opacity-60">Status</p>
                            <p className="mt-1 font-medium">{gelatoStatus.status || "-"}</p>
                          </div>
                          <div className="rounded-xl border border-border bg-card/30 p-3">
                            <p className="text-xs opacity-60">Productie</p>
                            <p className="mt-1 font-medium">{gelatoStatus.production_status || "-"}</p>
                          </div>
                          <div className="rounded-xl border border-border bg-card/30 p-3">
                            <p className="text-xs opacity-60">Verzending</p>
                            <p className="mt-1 font-medium">{gelatoStatus.shipping_status || gelatoStatus.delivery_status || "-"}</p>
                          </div>
                          <div className="rounded-xl border border-border bg-card/30 p-3">
                            <p className="text-xs opacity-60">ETA</p>
                            <p className="mt-1 font-medium">
                              {gelatoStatus.eta ? new Date(gelatoStatus.eta).toLocaleString() : "-"}
                            </p>
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="rounded-xl border border-border bg-card/30 p-3">
                            <p className="text-xs opacity-60">Gelato-bestelling</p>
                            <p className="mt-1 font-medium">{gelatoStatus.gelato_order_id || "-"}</p>
                            <p className="mt-1 text-xs opacity-60">Extern: {gelatoStatus.external_id || "-"}</p>
                          </div>
                          <div className="rounded-xl border border-border bg-card/30 p-3">
                            <p className="text-xs opacity-60">Ontvanger</p>
                            <p className="mt-1 font-medium">{gelatoStatus.recipient_name || "-"}</p>
                            <p className="mt-1 text-xs opacity-60">{gelatoStatus.recipient_country || "-"}</p>
                          </div>
                        </div>

                        <div className="rounded-xl border border-border bg-card/30 p-3">
                          <p className="text-xs opacity-60">Tracking</p>
                          {gelatoStatus.tracking_urls && gelatoStatus.tracking_urls.length > 0 ? (
                            <ul className="mt-2 space-y-1">
                              {gelatoStatus.tracking_urls.map((url, index) => (
                                <li key={`tracking-url-${index}`}>
                                  <a className="text-sm text-accent hover:underline" href={url} target="_blank" rel="noreferrer">
                                    Volg zending {index + 1}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-1 text-sm font-medium">Nog geen tracking beschikbaar.</p>
                          )}

                          {gelatoStatus.tracking_numbers && gelatoStatus.tracking_numbers.length > 0 && (
                            <p className="mt-2 text-xs opacity-60">Trackingnummers: {gelatoStatus.tracking_numbers.join(", ")}</p>
                          )}
                          {gelatoStatus.carriers && gelatoStatus.carriers.length > 0 && (
                            <p className="mt-1 text-xs opacity-60">Vervoerder(s): {gelatoStatus.carriers.join(", ")}</p>
                          )}
                          {gelatoStatus.shipment_statuses && gelatoStatus.shipment_statuses.length > 0 && (
                            <p className="mt-1 text-xs opacity-60">Zendingsstatus: {gelatoStatus.shipment_statuses.join(", ")}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {selectedOrder.note && (
                    <div className="rounded-xl border border-border bg-card/40 p-3">
                      <p className="text-xs opacity-60">Bestelnotitie</p>
                      <p className="mt-1 font-medium">{selectedOrder.note}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </LayoutShell>
  );
}
