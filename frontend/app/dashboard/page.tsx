"use client";

import { useEffect, useState } from "react";
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
};

type ShopifyOrderDetail = ShopifyOrder & {
  subtotal_price: string;
  total_tax: string;
  total_discounts: string;
  note: string;
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
  const [ordersError, setOrdersError] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<ShopifyOrderDetail | null>(null);
  const [orderDetailLoading, setOrderDetailLoading] = useState(false);
  const [orderDetailError, setOrderDetailError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [result, shopifyOrders] = await Promise.all([
        api<DashboardData>("/dashboard"),
        api<{ orders: ShopifyOrder[] }>("/shopify/orders?limit=10").catch(() => ({ orders: [] })),
      ]);
      setData(result);
      setOrders(shopifyOrders.orders || []);
      setOrdersError("");
    } catch {
      setData(null);
      setOrders([]);
      setOrdersError("Failed to load dashboard data");
    }
    setLoading(false);
  }

  async function openOrderDetail(orderId: string) {
    setOrderDetailLoading(true);
    setOrderDetailError("");
    try {
      const detail = await api<ShopifyOrderDetail>(`/shopify/orders/${orderId}`);
      setSelectedOrder(detail);
    } catch (err) {
      setOrderDetailError(err instanceof Error ? err.message : "Failed to load order detail");
      setSelectedOrder(null);
    }
    setOrderDetailLoading(false);
  }

  function closeOrderDetail() {
    setSelectedOrder(null);
    setOrderDetailError("");
  }

  const storagePercent = data?.system_info
    ? (data.system_info.storage_used_gb / data.system_info.storage_total_gb) * 100
    : 0;
  const storageColor = storagePercent > 90 ? "bg-red-500" : storagePercent > 75 ? "bg-yellow-500" : "bg-green-500";

  return (
    <LayoutShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <button
            onClick={loadData}
            disabled={loading}
            className="rounded-xl border border-border bg-card px-4 py-2 text-sm transition hover:bg-accent/10 disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="glass rounded-2xl p-5">
            <h3 className="text-sm font-medium opacity-70">Total Storage Used</h3>
            <p className="mt-2 text-3xl font-bold">{formatBytes(data?.used_bytes || 0)}</p>
            <ProgressBar current={data?.used_bytes || 0} total={(data?.system_info?.storage_total_gb || 1) * 1024 ** 3} />
          </div>

          <div className="glass rounded-2xl p-5">
            <h3 className="text-sm font-medium opacity-70">Total Files</h3>
            <p className="mt-2 text-3xl font-bold">{data?.files_count || 0}</p>
            <p className="mt-2 text-sm opacity-60">files uploaded</p>
          </div>

          <div className="glass rounded-2xl p-5">
            <h3 className="text-sm font-medium opacity-70">System Disk</h3>
            <p className="mt-2 text-3xl font-bold">{storagePercent.toFixed(1)}%</p>
            <ProgressBar
              current={data?.system_info?.storage_used_gb || 0}
              total={data?.system_info?.storage_total_gb || 1}
              color={storageColor}
            />
            <p className="mt-1 text-xs opacity-60">
              {data?.system_info?.storage_free_gb.toFixed(1)} GB free of {data?.system_info?.storage_total_gb.toFixed(1)} GB
            </p>
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <h2 className="text-xl font-semibold">System Information</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-card/30 p-3">
              <span className="text-xs font-medium opacity-70">Hostname</span>
              <p className="mt-1 font-mono text-sm">{data?.system_info?.hostname || "-"}</p>
            </div>
            <div className="rounded-xl border border-border bg-card/30 p-3">
              <span className="text-xs font-medium opacity-70">Platform</span>
              <p className="mt-1 font-mono text-sm">{data?.system_info?.platform || "-"}</p>
            </div>
            <div className="rounded-xl border border-border bg-card/30 p-3">
              <span className="text-xs font-medium opacity-70">CPU Cores</span>
              <p className="mt-1 font-mono text-sm">{data?.system_info?.cpu_cores || 0}</p>
            </div>
            <div className="rounded-xl border border-border bg-card/30 p-3">
              <span className="text-xs font-medium opacity-70">Storage Path</span>
              <p className="mt-1 truncate font-mono text-sm">{data?.system_info?.storage_path || "-"}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="glass rounded-2xl p-5">
            <h3 className="font-medium">Recent Files</h3>
            <ul className="mt-3 space-y-2">
              {data?.recent_files && data.recent_files.length > 0 ? (
                data.recent_files.map((file) => (
                  <li key={file.id} className="flex items-center justify-between rounded-xl border border-border p-3">
                    <span className="truncate text-sm font-medium">{file.name}</span>
                    <span className="ml-2 text-xs opacity-60">{formatBytes(file.size_bytes)}</span>
                  </li>
                ))
              ) : (
                <li className="rounded-xl border border-dashed border-border p-4 text-center text-sm opacity-60">
                  No files yet
                </li>
              )}
            </ul>
          </section>

          <section className="glass rounded-2xl p-5">
            <h3 className="font-medium">Activity Logs</h3>
            <ul className="mt-3 space-y-2">
              {data?.recent_activity && data.recent_activity.length > 0 ? (
                data.recent_activity.map((entry, index) => (
                  <li key={`${entry.event_type}-${index}`} className="rounded-xl border border-border p-3">
                    <span className="text-sm font-medium">{entry.event_type}</span>
                    <p className="mt-1 text-xs opacity-60">{new Date(entry.created_at).toLocaleString()}</p>
                  </li>
                ))
              ) : (
                <li className="rounded-xl border border-dashed border-border p-4 text-center text-sm opacity-60">
                  No activity yet
                </li>
              )}
            </ul>
          </section>
        </div>

        <section className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Shopify Orders</h3>
            <span className="text-xs opacity-60">Latest 10</span>
          </div>

          {ordersError && <p className="mt-3 text-sm text-red-400">{ordersError}</p>}

          <div className="mt-3 overflow-x-auto">
            {orders.length > 0 ? (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left opacity-70">
                    <th className="px-2 py-2">Order</th>
                    <th className="px-2 py-2">Customer</th>
                    <th className="px-2 py-2">Total</th>
                    <th className="px-2 py-2">Payment</th>
                    <th className="px-2 py-2">Fulfillment</th>
                    <th className="px-2 py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr
                      key={order.id}
                      className="cursor-pointer border-b border-border/50 hover:bg-card/20"
                      onClick={() => openOrderDetail(order.id)}
                    >
                      <td className="px-2 py-2 font-medium">{order.name}</td>
                      <td className="px-2 py-2">{order.customer_name || order.email || "-"}</td>
                      <td className="px-2 py-2">
                        {order.total_price} {order.currency}
                      </td>
                      <td className="px-2 py-2">{order.financial_status || "-"}</td>
                      <td className="px-2 py-2">{order.fulfillment_status || "unfulfilled"}</td>
                      <td className="px-2 py-2">{order.created_at ? new Date(order.created_at).toLocaleString() : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm opacity-60">
                No Shopify orders yet or Shopify is not configured.
              </div>
            )}
          </div>
          <p className="mt-2 text-xs opacity-60">Click an order row to view details.</p>
        </section>

        {(orderDetailLoading || orderDetailError || selectedOrder) && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
            <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl border border-border bg-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Order Details</h3>
                <button onClick={closeOrderDetail} className="rounded-lg border border-border px-3 py-1 text-sm hover:bg-card/70">
                  Close
                </button>
              </div>

              {orderDetailLoading && <p className="text-sm opacity-70">Loading order details...</p>}
              {orderDetailError && <p className="text-sm text-red-400">{orderDetailError}</p>}

              {selectedOrder && !orderDetailLoading && (
                <div className="space-y-4 text-sm">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-border bg-card/40 p-3">
                      <p className="text-xs opacity-60">Order</p>
                      <p className="mt-1 font-medium">{selectedOrder.name}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card/40 p-3">
                      <p className="text-xs opacity-60">Customer</p>
                      <p className="mt-1 font-medium">{selectedOrder.customer_name || selectedOrder.email || "-"}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card/40 p-3">
                      <p className="text-xs opacity-60">Created</p>
                      <p className="mt-1 font-medium">
                        {selectedOrder.created_at ? new Date(selectedOrder.created_at).toLocaleString() : "-"}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-xl border border-border bg-card/40 p-3">
                      <p className="text-xs opacity-60">Subtotal</p>
                      <p className="mt-1 font-medium">
                        {selectedOrder.subtotal_price} {selectedOrder.currency}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-card/40 p-3">
                      <p className="text-xs opacity-60">Tax</p>
                      <p className="mt-1 font-medium">
                        {selectedOrder.total_tax} {selectedOrder.currency}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-card/40 p-3">
                      <p className="text-xs opacity-60">Discounts</p>
                      <p className="mt-1 font-medium">
                        {selectedOrder.total_discounts} {selectedOrder.currency}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-card/40 p-3">
                      <p className="text-xs opacity-60">Total</p>
                      <p className="mt-1 font-medium">
                        {selectedOrder.total_price} {selectedOrder.currency}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-border bg-card/40 p-3">
                      <p className="text-xs opacity-60">Shipping Address</p>
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
                      <p className="text-xs opacity-60">Billing Address</p>
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

                  <div className="rounded-xl border border-border bg-card/40 p-3">
                    <p className="text-xs opacity-60">Line Items</p>
                    {selectedOrder.line_items.length > 0 ? (
                      <div className="mt-2 overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-left opacity-70">
                              <th className="px-2 py-2">Product</th>
                              <th className="px-2 py-2">SKU</th>
                              <th className="px-2 py-2">Qty</th>
                              <th className="px-2 py-2">Price</th>
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
                      <p className="mt-1 font-medium">No line items</p>
                    )}
                  </div>

                  {selectedOrder.note && (
                    <div className="rounded-xl border border-border bg-card/40 p-3">
                      <p className="text-xs opacity-60">Order Note</p>
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
