"use client";

import { useEffect, useState } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { api } from "@/lib/api";

type StorageInfo = {
  current_path: string;
  total_gb: number;
  used_gb: number;
  free_gb: number;
  percent_used: number;
};

type MountPoint = {
  path: string;
  device: string;
  fstype: string;
  total_gb: number;
  used_gb: number;
  free_gb: number;
};

type SystemInfo = {
  hostname: string;
  platform: string;
  cpu_cores: number;
  python_version: string;
  storage: StorageInfo;
  available_mounts: MountPoint[];
};

type UpdatePackage = {
  name: string;
  size_bytes: number;
  modified_at: string;
};

type UpdateStatus = {
  state: string;
  package_name?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  return_code?: number | null;
  stdout?: string | null;
  stderr?: string | null;
};

type ShopifyConfig = {
  store_domain: string;
  api_version: string;
  has_access_token: boolean;
  has_client_credentials: boolean;
};

type GelatoConfig = {
  base_url: string;
  has_api_key: boolean;
  sku_map: Record<string, string>;
};

export default function SettingsPage() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [newPath, setNewPath] = useState("");
  const [packages, setPackages] = useState<UpdatePackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState("");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [updateFile, setUpdateFile] = useState<File | null>(null);
  const [shopifyDomain, setShopifyDomain] = useState("");
  const [shopifyApiVersion, setShopifyApiVersion] = useState("2024-10");
  const [shopifyAccessToken, setShopifyAccessToken] = useState("");
  const [shopifyHasToken, setShopifyHasToken] = useState(false);
  const [shopifyClientId, setShopifyClientId] = useState("");
  const [shopifyClientSecret, setShopifyClientSecret] = useState("");
  const [shopifyHasClientCredentials, setShopifyHasClientCredentials] = useState(false);
  const [shopifyBusy, setShopifyBusy] = useState(false);
  const [shopifyTestStatus, setShopifyTestStatus] = useState("");
  const [testShopifyBusy, setTestShopifyBusy] = useState(false);
  const [gelatoBaseUrl, setGelatoBaseUrl] = useState("https://order.gelatoapis.com");
  const [gelatoApiKey, setGelatoApiKey] = useState("");
  const [gelatoHasKey, setGelatoHasKey] = useState(false);
  const [gelatoSkuMapText, setGelatoSkuMapText] = useState("{}");
  const [gelatoBusy, setGelatoBusy] = useState(false);

  useEffect(() => {
    loadInfo();
    loadUpdateData();
    loadShopifyConfig();
    loadGelatoConfig();
  }, []);

  async function loadInfo() {
    setLoading(true);
    try {
      const data = await api<SystemInfo>("/system/info");
      setInfo(data);
      setNewPath(data.storage.current_path);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to load system info");
    }
    setLoading(false);
  }

  async function loadUpdateData() {
    try {
      const [packageRows, latest] = await Promise.all([
        api<UpdatePackage[]>("/system/update/packages"),
        api<UpdateStatus>("/system/update/status"),
      ]);
      setPackages(packageRows);
      setUpdateStatus(latest);
      if (!selectedPackage && packageRows.length > 0) {
        setSelectedPackage(packageRows[0].name);
      }
    } catch {
      // keep update section optional if unavailable
    }
  }

  function getAuthHeaders() {
    const token = localStorage.getItem("access_token");
    const csrfMatch = document.cookie.match(/(?:^|; )csrf_token=([^;]+)/);
    const csrfToken = csrfMatch ? decodeURIComponent(csrfMatch[1]) : "";
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (csrfToken) headers.set("x-csrf-token", csrfToken);
    return headers;
  }

  async function uploadUpdatePackage() {
    if (!updateFile) return;
    setUpdateBusy(true);
    setStatus("");
    try {
      const formData = new FormData();
      formData.append("upload", updateFile);
      const base = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";
      const response = await fetch(`${base}/system/update/upload`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || "Update package upload failed");
      }
      setStatus("Update package uploaded");
      setUpdateFile(null);
      await loadUpdateData();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Update package upload failed");
    }
    setUpdateBusy(false);
  }

  async function applyUpdate() {
    if (!selectedPackage) return;
    setUpdateBusy(true);
    setStatus("");
    try {
      const result = await api<UpdateStatus>("/system/update/apply", {
        method: "POST",
        body: JSON.stringify({ package_name: selectedPackage, script_name: "update.sh", dry_run: dryRun }),
      });
      setUpdateStatus(result);
      setStatus(result.state === "success" ? "Update completed" : "Update failed");
      await loadUpdateData();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Update failed");
      await loadUpdateData();
    }
    setUpdateBusy(false);
  }

  async function loadShopifyConfig() {
    try {
      const row = await api<ShopifyConfig>("/shopify/config");
      setShopifyDomain(row.store_domain || "");
      setShopifyApiVersion(row.api_version || "2024-10");
      setShopifyHasToken(Boolean(row.has_access_token));
      setShopifyHasClientCredentials(Boolean(row.has_client_credentials));
    } catch {
      // keep section optional if route not yet available
    }
  }

  async function testShopifyConnection() {
    setTestShopifyBusy(true);
    setShopifyTestStatus("");
    try {
      const result = await api<{ success: boolean; message: string; store_domain: string }>("/shopify/test");
      setShopifyTestStatus(result.message + ` (${result.store_domain})`);
    } catch (err) {
      setShopifyTestStatus(err instanceof Error ? err.message : "Connection test failed");
    }
    setTestShopifyBusy(false);
  }

  async function saveShopifyConfig() {
    setShopifyBusy(true);
    setStatus("");
    try {
      const payload: {
        store_domain: string;
        api_version: string;
        access_token?: string;
        client_id?: string;
        client_secret?: string;
      } = {
        store_domain: shopifyDomain,
        api_version: shopifyApiVersion,
      };
      if (shopifyAccessToken.trim()) {
        payload.access_token = shopifyAccessToken.trim();
      }
      if (shopifyClientId.trim()) {
        payload.client_id = shopifyClientId.trim();
      }
      if (shopifyClientSecret.trim()) {
        payload.client_secret = shopifyClientSecret.trim();
      }

      const result = await api<{ message: string }>("/shopify/config", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setStatus(result.message);
      setShopifyAccessToken("");
      setShopifyClientSecret("");
      await loadShopifyConfig();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save Shopify config");
    }
    setShopifyBusy(false);
  }

  async function loadGelatoConfig() {
    try {
      const row = await api<GelatoConfig>("/gelato/config");
      setGelatoBaseUrl(row.base_url || "https://order.gelatoapis.com");
      setGelatoHasKey(Boolean(row.has_api_key));
      setGelatoSkuMapText(JSON.stringify(row.sku_map || {}, null, 2));
    } catch {
      // keep section optional if route not yet available
    }
  }

  async function saveGelatoConfig() {
    setGelatoBusy(true);
    setStatus("");
    try {
      const parsed = JSON.parse(gelatoSkuMapText || "{}") as Record<string, string>;
      const payload: { base_url: string; sku_map: Record<string, string>; api_key?: string } = {
        base_url: gelatoBaseUrl,
        sku_map: parsed,
      };
      if (gelatoApiKey.trim()) {
        payload.api_key = gelatoApiKey.trim();
      }

      const result = await api<{ message: string }>("/gelato/config", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setStatus(result.message);
      setGelatoApiKey("");
      await loadGelatoConfig();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save Gelato config");
    }
    setGelatoBusy(false);
  }

  async function updateStoragePath(path: string) {
    setStatus("");
    try {
      const response = await api<{ message: string; new_path: string }>("/system/storage-path", {
        method: "POST",
        body: JSON.stringify({ new_path: path }),
      });
      setStatus(response.message);
      await loadInfo();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to update storage path");
    }
  }

  function getStorageColor(percent: number): string {
    if (percent > 90) return "bg-red-500";
    if (percent > 75) return "bg-yellow-500";
    return "bg-green-500";
  }

  return (
    <LayoutShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">System Settings</h1>
          <button
            onClick={() => {
              loadInfo();
              loadUpdateData();
            }}
            disabled={loading}
            className="rounded-xl border border-border bg-card px-4 py-2 text-sm transition hover:bg-accent/10 disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {status && (
          <div className="rounded-xl border border-border bg-card/50 p-4 text-sm">
            <p>{status}</p>
          </div>
        )}

        <section className="glass rounded-2xl p-5">
          <h2 className="text-xl font-semibold">System Information</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-card/30 p-3">
              <span className="text-xs font-medium opacity-70">Hostname</span>
              <p className="mt-1 font-mono text-sm">{info?.hostname || "-"}</p>
            </div>
            <div className="rounded-xl border border-border bg-card/30 p-3">
              <span className="text-xs font-medium opacity-70">Platform</span>
              <p className="mt-1 font-mono text-sm">{info?.platform || "-"}</p>
            </div>
            <div className="rounded-xl border border-border bg-card/30 p-3">
              <span className="text-xs font-medium opacity-70">CPU Cores</span>
              <p className="mt-1 font-mono text-sm">{info?.cpu_cores || 0}</p>
            </div>
            <div className="rounded-xl border border-border bg-card/30 p-3">
              <span className="text-xs font-medium opacity-70">Python Version</span>
              <p className="mt-1 font-mono text-sm">{info?.python_version || "-"}</p>
            </div>
          </div>
        </section>

        <section className="glass rounded-2xl p-5">
          <h2 className="text-xl font-semibold">Current Storage</h2>
          <div className="mt-4 rounded-xl border border-border bg-card/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{info?.storage.current_path || "-"}</p>
                <p className="mt-1 text-xs opacity-60">
                  {info?.storage.used_gb.toFixed(2)} GB used of {info?.storage.total_gb.toFixed(2)} GB (
                  {info?.storage.percent_used.toFixed(1)}%)
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">{info?.storage.free_gb.toFixed(2)} GB free</p>
              </div>
            </div>
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-card/50">
              <div
                className={`h-full transition-all duration-500 ${getStorageColor(info?.storage.percent_used || 0)}`}
                style={{ width: `${info?.storage.percent_used || 0}%` }}
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium">Change Storage Path</label>
            <p className="mt-1 text-xs opacity-60">Select a new path or mount point for storing cloud files</p>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                className="flex-1 rounded-xl border border-border bg-card px-3 py-2 font-mono text-sm"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="/path/to/storage"
              />
              <button
                onClick={() => updateStoragePath(newPath)}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
              >
                Update Path
              </button>
            </div>
          </div>
        </section>

        <section className="glass rounded-2xl p-5">
          <h2 className="text-xl font-semibold">Available Mount Points</h2>
          <p className="mt-1 text-sm opacity-60">Detected disks and mount points on this system</p>
          <div className="mt-4 space-y-3">
            {info?.available_mounts && info.available_mounts.length > 0 ? (
              info.available_mounts.map((mount, index) => {
                const percent = mount.total_gb > 0 ? (mount.used_gb / mount.total_gb) * 100 : 0;
                return (
                  <div key={index} className="rounded-xl border border-border bg-card/30 p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-sm font-medium">{mount.path}</p>
                          {mount.path === info.storage.current_path && (
                            <span className="rounded-md bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs opacity-60">
                          {mount.device} ({mount.fstype})
                        </p>
                        <p className="mt-1 text-xs opacity-60">
                          {mount.used_gb.toFixed(1)} GB / {mount.total_gb.toFixed(1)} GB used ({percent.toFixed(1)}%)
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{mount.free_gb.toFixed(1)} GB free</p>
                        {mount.path !== info.storage.current_path && (
                          <button
                            onClick={() => {
                              setNewPath(mount.path);
                              updateStoragePath(mount.path);
                            }}
                            className="mt-2 rounded-lg border border-border bg-card px-3 py-1 text-xs transition hover:bg-accent/10"
                          >
                            Use this disk
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-card/50">
                      <div
                        className={`h-full transition-all duration-500 ${getStorageColor(percent)}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm opacity-60">
                No mount points detected (may require Linux system with /proc/mounts)
              </div>
            )}
          </div>
        </section>

        <section className="glass rounded-2xl p-5">
          <h2 className="text-xl font-semibold">Shopify Integration</h2>
          <p className="mt-1 text-sm opacity-60">Connect your Shopify store to display recent orders in the dashboard.</p>
          <p className="mt-2 text-xs opacity-70">
            Gebruik hier je <strong>.myshopify.com</strong> admin domein (niet je storefront domein zoals thokan.be).
          </p>
          <p className="mt-1 text-xs opacity-70">
            Access token: Shopify Admin → Apps and sales channels → Develop apps → jouw app → Configuration (scope: read_orders)
            → Install app → API credentials → Admin API access token.
          </p>
          <p className="mt-1 text-xs opacity-70">
            Client ID/Secret kun je optioneel bewaren voor referentie, maar voor orders is altijd een Admin API access token nodig.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">Store Domain</label>
              <input
                type="text"
                className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                placeholder="your-store.myshopify.com"
                value={shopifyDomain}
                onChange={(e) => setShopifyDomain(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">API Version</label>
              <input
                type="text"
                className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                placeholder="2024-10"
                value={shopifyApiVersion}
                onChange={(e) => setShopifyApiVersion(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-3">
            <label className="block text-sm font-medium">Admin API Access Token</label>
            <input
              type="password"
              className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
              placeholder={shopifyHasToken ? "Token already saved (leave empty to keep)" : "shpat_..."}
              value={shopifyAccessToken}
              onChange={(e) => setShopifyAccessToken(e.target.value)}
            />
            {shopifyHasToken && <p className="mt-1 text-xs opacity-60">A token is already stored securely.</p>}
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">Client ID (optional)</label>
              <input
                type="text"
                className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                placeholder="Shopify app client id"
                value={shopifyClientId}
                onChange={(e) => setShopifyClientId(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Client Secret (optional)</label>
              <input
                type="password"
                className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                placeholder={shopifyHasClientCredentials ? "Already stored (leave empty to keep)" : "Shopify app client secret"}
                value={shopifyClientSecret}
                onChange={(e) => setShopifyClientSecret(e.target.value)}
              />
            </div>
          </div>
          {shopifyHasClientCredentials && (
            <p className="mt-1 text-xs opacity-60">Client credentials are already stored securely.</p>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={saveShopifyConfig}
              disabled={!shopifyDomain || !shopifyApiVersion || shopifyBusy}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {shopifyBusy ? "Saving..." : "Save Shopify Config"}
            </button>
            <button
              onClick={testShopifyConnection}
              disabled={!shopifyDomain || testShopifyBusy || !shopifyHasToken}
              className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium transition hover:bg-accent/10 disabled:opacity-50"
            >
              {testShopifyBusy ? "Testing..." : "Test Connection"}
            </button>
          </div>
          {shopifyTestStatus && (
            <div className="mt-2 rounded-xl border border-border bg-card/50 p-3 text-sm">
              <p>{shopifyTestStatus}</p>
            </div>
          )}
        </section>

        <section className="glass rounded-2xl p-5">
          <h2 className="text-xl font-semibold">Gelato Integration</h2>
          <p className="mt-1 text-sm opacity-60">
            Configure Gelato API for catalog discovery, pricing and order placement from Shopify orders.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">Base URL</label>
              <input
                type="text"
                className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                placeholder="https://order.gelatoapis.com"
                value={gelatoBaseUrl}
                onChange={(e) => setGelatoBaseUrl(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">API Key</label>
              <input
                type="password"
                className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                placeholder={gelatoHasKey ? "API key already saved (leave empty to keep)" : "Gelato API key"}
                value={gelatoApiKey}
                onChange={(e) => setGelatoApiKey(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-3">
            <label className="block text-sm font-medium">SKU mapping (Shopify SKU → Gelato productUid)</label>
            <p className="mt-1 text-xs opacity-60">Example: {`{ "TSHIRT-BLACK-M": "gelato-product-uid" }`}</p>
            <textarea
              className="mt-2 h-40 w-full rounded-xl border border-border bg-card px-3 py-2 font-mono text-xs"
              value={gelatoSkuMapText}
              onChange={(e) => setGelatoSkuMapText(e.target.value)}
            />
          </div>

          <div className="mt-4">
            <button
              onClick={saveGelatoConfig}
              disabled={!gelatoBaseUrl || gelatoBusy}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {gelatoBusy ? "Saving..." : "Save Gelato Config"}
            </button>
          </div>
        </section>

        <section className="glass rounded-2xl p-5">
          <h2 className="text-xl font-semibold">System Updates</h2>
          <p className="mt-1 text-sm opacity-60">
            Upload your own update package (.zip/.tar/.tar.gz/.tgz) with an update.sh in package root.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              type="file"
              accept=".zip,.tar,.tar.gz,.tgz"
              onChange={(e) => setUpdateFile(e.target.files?.[0] || null)}
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
            />
            <button
              onClick={uploadUpdatePackage}
              disabled={!updateFile || updateBusy}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {updateBusy ? "Uploading..." : "Upload Package"}
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <select
              value={selectedPackage}
              onChange={(e) => setSelectedPackage(e.target.value)}
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
            >
              <option value="">Select update package</option>
              {packages.map((pkg) => (
                <option key={pkg.name} value={pkg.name}>
                  {pkg.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
              Dry run
            </label>
            <button
              onClick={applyUpdate}
              disabled={!selectedPackage || updateBusy}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {updateBusy ? "Applying..." : "Apply Update"}
            </button>
          </div>

          {updateStatus && (
            <div className="mt-4 rounded-xl border border-border bg-card/30 p-4 text-sm">
              <p>
                Status: <span className="font-medium">{updateStatus.state}</span>
              </p>
              {updateStatus.package_name && <p className="mt-1">Package: {updateStatus.package_name}</p>}
              {typeof updateStatus.return_code === "number" && <p className="mt-1">Return code: {updateStatus.return_code}</p>}
              {updateStatus.started_at && <p className="mt-1 opacity-70">Started: {new Date(updateStatus.started_at).toLocaleString()}</p>}
              {updateStatus.finished_at && <p className="mt-1 opacity-70">Finished: {new Date(updateStatus.finished_at).toLocaleString()}</p>}
              {updateStatus.stderr && (
                <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-black/20 p-3 text-xs text-red-300">
                  {updateStatus.stderr}
                </pre>
              )}
              {updateStatus.stdout && (
                <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-black/20 p-3 text-xs">
                  {updateStatus.stdout}
                </pre>
              )}
            </div>
          )}
        </section>
      </div>
    </LayoutShell>
  );
}
