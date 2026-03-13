"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Boxes,
  Cog,
  HardDrive,
  Mail,
  PackageCheck,
  RefreshCw,
  Server,
  ShoppingBag,
  Sparkles,
  Store,
  WandSparkles,
  X,
} from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { api, apiRaw } from "@/lib/api";

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
  channel: string;
  size_bytes: number;
  modified_at: string;
  release_notes?: string | null;
  version?: string | null;
};

type UpdateStatus = {
  state: string;
  package_name?: string | null;
  channel?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  return_code?: number | null;
  stdout?: string | null;
  stderr?: string | null;
  progress?: number | null;
  progress_step?: string | null;
  release_notes?: string | null;
  installed_package_name?: string | null;
  installed_build_date?: string | null;
  installed_version?: string | null;
};

type AptStatus = {
  upgradable: number;
  packages: string[];
  checked_at: string;
};

type UpdateConfig = {
  selected_channel: "stable" | "beta";
  stable_source_url: string;
  beta_source_url: string;
  auto_check_updates: boolean;
  auto_install_nightly: boolean;
  nightly_install_hour: number;
  auto_rebuild_docker: boolean;
  auto_update_ubuntu: boolean;
  docker_update_command: string;
  ubuntu_update_command: string;
};

type ShopifyConfig = {
  store_domain: string;
  api_version: string;
  has_access_token: boolean;
  has_client_credentials: boolean;
  is_global?: boolean;
};

type ShopifyCapabilities = {
  store_domain: string;
  granted_scopes: string[];
  supports_order_events: boolean;
  supports_inbox_chat: boolean;
  inbox_chat_reason: string;
};

type ShopifyWebsiteChatBridgeConfig = {
  enabled: boolean;
  shared_secret: string;
  has_shared_secret: boolean;
  endpoint_path: string;
  endpoint_url: string;
  integration_note: string;
};

type GelatoConfig = {
  base_url: string;
  has_api_key: boolean;
  sku_map: Record<string, string>;
  is_global?: boolean;
};

type CurrentUser = {
  id: string;
  roles: string[];
};

type MailConfig = {
  email: string;
  username: string;
  imap_host: string;
  imap_port: number;
  imap_use_ssl: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_use_tls: boolean;
  smtp_use_ssl: boolean;
  has_password: boolean;
  email_signature: string;
  is_global?: boolean;
};

function SectionShell({
  icon,
  eyebrow,
  title,
  description,
  children,
  aside,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="glass overflow-hidden rounded-[2rem] p-5 sm:p-6">
      <div className="flex flex-col gap-4 border-b border-border/60 pb-5 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            {icon}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-45">{eyebrow}</p>
            <h2 className="mt-1 text-xl font-semibold">{title}</h2>
            <p className="mt-2 max-w-3xl text-sm opacity-65">{description}</p>
          </div>
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-[1.5rem] border border-border/70 bg-card/35 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-sm opacity-60">{hint}</p>
    </div>
  );
}

function getUpdateStateTone(state?: string) {
  if (!state) return "bg-card/40 text-fg";
  if (state === "success") return "bg-green-500/15 text-green-600 dark:text-green-300";
  if (state === "failed" || state === "error") return "bg-red-500/15 text-red-600 dark:text-red-300";
  if (state === "running") return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300";
  return "bg-card/40 text-fg";
}

function getBuildDateFromPackageName(value?: string | null): string {
  if (!value) return "-";
  const match = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return "-";
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function isLikelyRestartInterruption(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("cannot reach api server") || message.includes("failed to fetch") || message.includes("networkerror");
}

export default function SettingsPage() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [newPath, setNewPath] = useState("");
  const [packages, setPackages] = useState<UpdatePackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState("");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateConfig, setUpdateConfig] = useState<UpdateConfig | null>(null);
  const [updateChannel, setUpdateChannel] = useState<"stable" | "beta">("stable");
  const [updateBusy, setUpdateBusy] = useState(false);
  const [fetchBusy, setFetchBusy] = useState(false);
  const [checkResult, setCheckResult] = useState<{ version: string | null; up_to_date: boolean; notes: string | null } | null>(null);
  const [updatePrompt, setUpdatePrompt] = useState<{ version: string | null; notes: string | null; installedVersion: string | null } | null>(null);
  const [dryRun, setDryRun] = useState(false);
  const [updateFile, setUpdateFile] = useState<File | null>(null);
  const [aptStatus, setAptStatus] = useState<AptStatus | null>(null);
  const [aptBusy, setAptBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nightlyInstallRef = useRef(false);
  const [shopifyDomain, setShopifyDomain] = useState("");
  const [shopifyApiVersion, setShopifyApiVersion] = useState("2024-10");
  const [shopifyAccessToken, setShopifyAccessToken] = useState("");
  const [shopifyHasToken, setShopifyHasToken] = useState(false);
  const [shopifyClientId, setShopifyClientId] = useState("");
  const [shopifyClientSecret, setShopifyClientSecret] = useState("");
  const [shopifyHasClientCredentials, setShopifyHasClientCredentials] = useState(false);
  const [shopifyIsGlobal, setShopifyIsGlobal] = useState(false);
  const [shopifyApplyToAll, setShopifyApplyToAll] = useState(false);
  const [shopifyCapabilities, setShopifyCapabilities] = useState<ShopifyCapabilities | null>(null);
  const [shopifyWebsiteChatBridge, setShopifyWebsiteChatBridge] = useState<ShopifyWebsiteChatBridgeConfig | null>(null);
  const [shopifyWebsiteChatEnabled, setShopifyWebsiteChatEnabled] = useState(false);
  const [shopifyWebsiteChatSecret, setShopifyWebsiteChatSecret] = useState("");
  const [shopifyWebsiteChatBusy, setShopifyWebsiteChatBusy] = useState(false);
  const [shopifyBusy, setShopifyBusy] = useState(false);
  const [shopifyTestStatus, setShopifyTestStatus] = useState("");
  const [testShopifyBusy, setTestShopifyBusy] = useState(false);
  const [gelatoBaseUrl, setGelatoBaseUrl] = useState("https://order.gelatoapis.com");
  const [gelatoApiKey, setGelatoApiKey] = useState("");
  const [gelatoHasKey, setGelatoHasKey] = useState(false);
  const [gelatoIsGlobal, setGelatoIsGlobal] = useState(false);
  const [gelatoApplyToAll, setGelatoApplyToAll] = useState(false);
  const [gelatoSkuMapText, setGelatoSkuMapText] = useState("{}");
  const [gelatoBusy, setGelatoBusy] = useState(false);
  const [mailConfig, setMailConfig] = useState<MailConfig | null>(null);
  const [mailPassword, setMailPassword] = useState("");
  const [mailApplyToAll, setMailApplyToAll] = useState(false);
  const [mailBusy, setMailBusy] = useState(false);
  const [mailTestBusy, setMailTestBusy] = useState(false);
  const [canConfigureGlobal, setCanConfigureGlobal] = useState(false);
  const [sectionFilter, setSectionFilter] = useState<"info" | "storage" | "mail" | "api">("info");

  function formatNightlyWindow(hour: number) {
    const normalized = Math.max(0, Math.min(23, hour || 0));
    const end = (normalized + 1) % 24;
    return `${String(normalized).padStart(2, "0")}:00–${String(end).padStart(2, "0")}:00`;
  }

  useEffect(() => {
    loadInfo();
    loadUpdateData();
    loadUpdateConfig();
    loadShopifyConfig();
    loadShopifyCapabilities();
    loadShopifyWebsiteChatBridgeConfig();
    loadGelatoConfig();
    loadMailConfig();
    loadCurrentUser();
    loadAptStatus();
  }, []);

  function markUpdateRunning(packageName: string) {
    setUpdateStatus((prev) => ({
      ...prev,
      state: "running",
      package_name: packageName,
      channel: updateChannel,
      started_at: new Date().toISOString(),
      finished_at: null,
      return_code: null,
      stdout: "",
      stderr: "",
      progress: 0,
      progress_step: "Update gestart...",
    }));
  }

  function shouldForceReloginAfterRebuild(result: UpdateStatus | null): boolean {
    if (!result || result.state !== "success") return false;
    if (dryRun) return false;
    return true;
  }

  function forceReloginAfterRebuild() {
    // Navigate to the dedicated restarting page, which polls and redirects to /login when ready.
    window.location.replace("/restarting");
  }

  async function loadAptStatus() {
    try {
      const data = await api<AptStatus>("/system/update/apt-status");
      setAptStatus(data);
    } catch {
      // apt not available on this system
    }
  }

  async function applyAptUpgrade() {
    setAptBusy(true);
    setStatus("");
    try {
      const result = await api<UpdateStatus>("/system/update/apt-upgrade", { method: "POST" });
      setUpdateStatus(result);
      setStatus(result.state === "success" ? "Systeempakketten bijgewerkt" : "Systeempakketten bijwerken mislukt");
      await loadAptStatus();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Systeempakketten bijwerken mislukt");
    }
    setAptBusy(false);
  }

  async function loadCurrentUser() {
    try {
      const me = await api<CurrentUser>("/auth/me");
      setCanConfigureGlobal(Boolean(me.roles?.includes("admin")));
    } catch {
      setCanConfigureGlobal(false);
    }
  }

  async function loadMailConfig() {
    try {
      const data = await api<MailConfig>("/mail/config");
      setMailConfig(data);
      setMailApplyToAll(Boolean(data.is_global));
    } catch {
      setMailConfig(null);
    }
  }

  async function saveMailConfig() {
    if (!mailConfig) return;
    setMailBusy(true);
    setStatus("");
    try {
      const payload: Record<string, unknown> = {
        email: mailConfig.email,
        username: mailConfig.username,
        imap_host: mailConfig.imap_host,
        imap_port: mailConfig.imap_port,
        imap_use_ssl: mailConfig.imap_use_ssl,
        smtp_host: mailConfig.smtp_host,
        smtp_port: mailConfig.smtp_port,
        smtp_use_tls: mailConfig.smtp_use_tls,
        smtp_use_ssl: mailConfig.smtp_use_ssl,
        email_signature: mailConfig.email_signature,
        apply_to_all: canConfigureGlobal ? mailApplyToAll : false,
      };
      if (mailPassword.trim()) {
        payload.password = mailPassword.trim();
      }

      const result = await api<{ message: string }>("/mail/config", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setStatus(result.message);
      setMailPassword("");
      await loadMailConfig();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Mail-instellingen opslaan mislukt");
    }
    setMailBusy(false);
  }

  async function testMailConfig() {
    setMailTestBusy(true);
    setStatus("");
    try {
      const result = await api<{ message: string }>("/mail/test", { method: "POST" });
      setStatus(result.message);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Mail-test mislukt");
    }
    setMailTestBusy(false);
  }

  useEffect(() => {
    if (updateBusy || aptBusy) {
      pollRef.current = setInterval(async () => {
        try {
          const latest = await api<UpdateStatus>("/system/update/status");
          setUpdateStatus(latest);
          if (latest.state !== "running") {
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch {
          // ignore polling errors
        }
      }, 2000);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [updateBusy, aptBusy]);

  async function loadInfo() {
    setLoading(true);
    try {
      const data = await api<SystemInfo>("/system/info");
      setInfo(data);
      setNewPath(data.storage.current_path);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Systeeminfo laden mislukt");
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

  async function loadUpdateConfig() {
    try {
      const config = await api<UpdateConfig>("/system/update/config");
      setUpdateConfig(config);
      setUpdateChannel(config.selected_channel || "stable");
    } catch {
      // keep section optional if route not yet available
    }
  }

  async function saveUpdateConfig() {
    if (!updateConfig) return;
    setUpdateBusy(true);
    setStatus("");
    try {
      const saved = await api<UpdateConfig>("/system/update/config", {
        method: "PUT",
        body: JSON.stringify({ ...updateConfig, selected_channel: updateChannel }),
      });
      setUpdateConfig(saved);
      setStatus("Updatekanaal-instellingen opgeslagen");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Update-instellingen opslaan mislukt");
    }
    setUpdateBusy(false);
  }

  async function fetchLatestUpdate() {
    setFetchBusy(true);
    setStatus("");
    try {
      const result = await api<UpdatePackage>("/system/update/fetch-latest", {
        method: "POST",
        body: JSON.stringify({
          channel: updateChannel,
        }),
      });
      setSelectedPackage(result.name);
      setStatus(`Laatste ${updateChannel}-update gedownload: ${result.name}`);
      await loadUpdateData();

      setUpdateBusy(true);
      markUpdateRunning(result.name);
      try {
        const applied = await api<UpdateStatus>("/system/update/apply", {
          method: "POST",
          body: JSON.stringify({
            package_name: result.name,
            channel: updateChannel,
            script_name: "update.sh",
            dry_run: dryRun,
            auto_rebuild_docker: updateConfig?.auto_rebuild_docker,
            auto_update_ubuntu: updateConfig?.auto_update_ubuntu,
          }),
        });
        setUpdateStatus(applied);
        setStatus(applied.state === "success" ? "Update voltooid" : "Update mislukt");
        if (applied.state === "success") {
          setCheckResult({ version: applied.installed_version ?? result.version ?? null, up_to_date: true, notes: updatePrompt?.notes ?? null });
          setUpdatePrompt(null);
        }
        await loadUpdateData();
        if (shouldForceReloginAfterRebuild(applied)) {
          forceReloginAfterRebuild();
          return;
        }
      } catch (err) {
        if (isLikelyRestartInterruption(err) && !dryRun && Boolean(updateConfig?.auto_rebuild_docker ?? true)) {
          forceReloginAfterRebuild();
          return;
        }
        setStatus(err instanceof Error ? err.message : "Update mislukt");
        await loadUpdateData();
      }
      setUpdateBusy(false);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Laatste update ophalen mislukt");
    }
    setFetchBusy(false);
  }

  async function runUpdateCheck(showPrompt: boolean) {
    type CheckPayload = { version: string | null; up_to_date: boolean; notes: string | null; installed_version: string | null };
    const check = await api<CheckPayload>("/system/update/check-latest", {
      method: "POST",
      body: JSON.stringify({ channel: updateChannel }),
    });

    if (check.up_to_date) {
      const label = check.version ? `v${check.version}` : "de huidige versie";
      setCheckResult({ version: check.version, up_to_date: true, notes: check.notes });
      setUpdatePrompt(null);
      if (showPrompt) {
        setStatus(`Je draait al ${label} — geen update beschikbaar.`);
      }
      return;
    }

    setCheckResult({ version: check.version, up_to_date: false, notes: check.notes });
    setUpdatePrompt({ version: check.version, notes: check.notes, installedVersion: check.installed_version });

    if (!showPrompt && updateConfig?.auto_install_nightly && !nightlyInstallRef.current && !updateBusy && !fetchBusy) {
      const now = new Date();
      const nightlyHour = Math.max(0, Math.min(23, updateConfig?.nightly_install_hour ?? 3));
      const dailyKey = `nightly_update_done_${now.toISOString().slice(0, 10)}_${updateChannel}`;
      if (now.getHours() === nightlyHour && sessionStorage.getItem(dailyKey) !== "1") {
        nightlyInstallRef.current = true;
        setStatus(`Nacht-update gestart voor ${check.version ? `v${check.version}` : "beschikbare update"}...`);
        try {
          await fetchLatestUpdate();
          sessionStorage.setItem(dailyKey, "1");
        } finally {
          nightlyInstallRef.current = false;
        }
        return;
      }
    }

    if (showPrompt) {
      const label = check.version ? `v${check.version}` : "een nieuwe versie";
      if (updateConfig?.auto_install_nightly) {
        setStatus(`Update beschikbaar: ${label}. Geplande nacht-installatie: ${formatNightlyWindow(updateConfig?.nightly_install_hour ?? 3)}.`);
      } else {
        setStatus(`Update beschikbaar: ${label}. Je kan nu installeren.`);
      }
    }
  }

  async function checkAndFetchLatestUpdate() {
    setFetchBusy(true);
    setStatus("");
    try {
      await runUpdateCheck(true);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Update controleren mislukt");
    }
    setFetchBusy(false);
  }

  async function uploadUpdatePackage() {
    if (!updateFile) return;
    setUpdateBusy(true);
    setStatus("");
    try {
      const formData = new FormData();
      formData.append("upload", updateFile);
      formData.append("channel", updateChannel);
      const response = await apiRaw("/system/update/upload", {
        method: "POST",
        body: formData,
      });

      setStatus("Updatepakket geüpload");
      setUpdateFile(null);
      await loadUpdateData();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Uploaden updatepakket mislukt");
    }
    setUpdateBusy(false);
  }

  async function applyUpdate() {
    if (!selectedPackage) return;
    setUpdateBusy(true);
    setStatus("");
    markUpdateRunning(selectedPackage);
    try {
      const result = await api<UpdateStatus>("/system/update/apply", {
        method: "POST",
        body: JSON.stringify({
          package_name: selectedPackage,
          channel: updateChannel,
          script_name: "update.sh",
          dry_run: dryRun,
          auto_rebuild_docker: updateConfig?.auto_rebuild_docker,
          auto_update_ubuntu: updateConfig?.auto_update_ubuntu,
        }),
      });
      setUpdateStatus(result);
      setStatus(result.state === "success" ? "Update voltooid" : "Update mislukt");
      await loadUpdateData();
      if (shouldForceReloginAfterRebuild(result)) {
        forceReloginAfterRebuild();
        return;
      }
    } catch (err) {
      if (isLikelyRestartInterruption(err) && !dryRun && Boolean(updateConfig?.auto_rebuild_docker ?? true)) {
        forceReloginAfterRebuild();
        return;
      }
      setStatus(err instanceof Error ? err.message : "Update mislukt");
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
      setShopifyIsGlobal(Boolean(row.is_global));
      setShopifyApplyToAll(Boolean(row.is_global));
    } catch {
      // keep section optional if route not yet available
    }
  }

  async function loadShopifyCapabilities() {
    try {
      const data = await api<ShopifyCapabilities>("/shopify/capabilities");
      setShopifyCapabilities(data);
    } catch {
      setShopifyCapabilities(null);
    }
  }

  async function loadShopifyWebsiteChatBridgeConfig() {
    try {
      const data = await api<ShopifyWebsiteChatBridgeConfig>("/shopify/website-chat/config");
      setShopifyWebsiteChatBridge(data);
      setShopifyWebsiteChatEnabled(Boolean(data.enabled));
      setShopifyWebsiteChatSecret(data.shared_secret || "");
    } catch {
      setShopifyWebsiteChatBridge(null);
      setShopifyWebsiteChatEnabled(false);
      setShopifyWebsiteChatSecret("");
    }
  }

  async function testShopifyConnection() {
    setTestShopifyBusy(true);
    setShopifyTestStatus("");
    try {
      const result = await api<{ success: boolean; message: string; store_domain: string }>("/shopify/test");
      setShopifyTestStatus(result.message + ` (${result.store_domain})`);
    } catch (err) {
      setShopifyTestStatus(err instanceof Error ? err.message : "Verbindingstest mislukt");
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
        apply_to_all?: boolean;
      } = {
        store_domain: shopifyDomain,
        api_version: shopifyApiVersion,
        apply_to_all: canConfigureGlobal ? shopifyApplyToAll : false,
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
      await loadShopifyCapabilities();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Shopify-config opslaan mislukt");
    }
    setShopifyBusy(false);
  }

  async function saveShopifyWebsiteChatBridgeConfig(regenerateSecret = false) {
    setShopifyWebsiteChatBusy(true);
    setStatus("");
    try {
      const result = await api<ShopifyWebsiteChatBridgeConfig & { message: string }>("/shopify/website-chat/config", {
        method: "PUT",
        body: JSON.stringify({
          enabled: shopifyWebsiteChatEnabled,
          shared_secret: shopifyWebsiteChatSecret.trim(),
          regenerate_secret: regenerateSecret,
        }),
      });
      setStatus(result.message);
      setShopifyWebsiteChatBridge(result);
      setShopifyWebsiteChatEnabled(Boolean(result.enabled));
      setShopifyWebsiteChatSecret(result.shared_secret || "");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Shopify website-chat bridge opslaan mislukt");
    }
    setShopifyWebsiteChatBusy(false);
  }

  async function loadGelatoConfig() {
    try {
      const row = await api<GelatoConfig>("/gelato/config");
      setGelatoBaseUrl(row.base_url || "https://order.gelatoapis.com");
      setGelatoHasKey(Boolean(row.has_api_key));
      setGelatoSkuMapText(JSON.stringify(row.sku_map || {}, null, 2));
      setGelatoIsGlobal(Boolean(row.is_global));
      setGelatoApplyToAll(Boolean(row.is_global));
    } catch {
      // keep section optional if route not yet available
    }
  }

  async function saveGelatoConfig() {
    setGelatoBusy(true);
    setStatus("");
    try {
      const parsed = JSON.parse(gelatoSkuMapText || "{}") as Record<string, string>;
      const payload: { base_url: string; sku_map: Record<string, string>; api_key?: string; apply_to_all?: boolean } = {
        base_url: gelatoBaseUrl,
        sku_map: parsed,
        apply_to_all: canConfigureGlobal ? gelatoApplyToAll : false,
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
      setStatus(err instanceof Error ? err.message : "Gelato-config opslaan mislukt");
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
      setStatus(err instanceof Error ? err.message : "Opslagpad bijwerken mislukt");
    }
  }

  function getStorageColor(percent: number): string {
    if (percent > 90) return "bg-red-500";
    if (percent > 75) return "bg-yellow-500";
    return "bg-green-500";
  }

  const channelPackages = useMemo(() => {
    return packages.filter((pkg) => {
      if (!pkg.channel || pkg.channel === "manual") return true;
      return pkg.channel === updateChannel;
    });
  }, [packages, updateChannel]);

  useEffect(() => {
    if (!updateConfig?.auto_check_updates) return;
    let cancelled = false;
    const timer = setInterval(() => {
      if (cancelled) return;
      void runUpdateCheck(false).catch(() => {
        // silent auto-check failures should not break the UI
      });
    }, 300000);
    void runUpdateCheck(false).catch(() => {
      // ignore initial silent check failure
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [updateChannel, updateConfig?.auto_check_updates]);

  function shouldShowSection(sectionKey: "info" | "storage" | "mail" | "api"): boolean {
    return sectionFilter === sectionKey;
  }

  return (
    <LayoutShell>
      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="glass h-fit rounded-[1.5rem] p-3 lg:sticky lg:top-6">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.18em] opacity-50">Instellingen</p>
          <div className="space-y-1">
            <button
              onClick={() => {
                setSectionFilter("info");
              }}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${sectionFilter === "info" ? "bg-accent/15 text-accent" : "hover:bg-card/40"}`}
            >
              <Server className="h-4 w-4" />
              Info
            </button>
            <button
              onClick={() => {
                setSectionFilter("storage");
              }}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${sectionFilter === "storage" ? "bg-accent/15 text-accent" : "hover:bg-card/40"}`}
            >
              <HardDrive className="h-4 w-4" />
              Opslag
            </button>
            <button
              onClick={() => {
                setSectionFilter("mail");
              }}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${sectionFilter === "mail" ? "bg-accent/15 text-accent" : "hover:bg-card/40"}`}
            >
              <Mail className="h-4 w-4" />
              Mail instellingen
            </button>
            <button
              onClick={() => {
                setSectionFilter("api");
              }}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${sectionFilter === "api" ? "bg-accent/15 text-accent" : "hover:bg-card/40"}`}
            >
              <Store className="h-4 w-4" />
              Integraties
            </button>
          </div>
        </aside>

        <div className="space-y-5">
          <section className="glass overflow-hidden rounded-[1.75rem] p-4">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-xl font-semibold">Instellingen</h1>
              <button
                onClick={() => {
                  loadInfo();
                  loadUpdateData();
                  loadUpdateConfig();
                  loadShopifyConfig();
                  loadShopifyWebsiteChatBridgeConfig();
                  loadGelatoConfig();
                  loadMailConfig();
                  loadAptStatus();
                }}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                {loading ? "Verversen..." : "Verversen"}
              </button>
            </div>
          </section>

        {status && (
          <div className="glass rounded-[1.5rem] border border-border/70 bg-card/50 p-4 text-sm">
            <p>{status}</p>
          </div>
        )}

        {shouldShowSection("info") && (
        <SectionShell
          icon={<Server className="h-5 w-5" />}
          eyebrow="Kern"
          title="Systeeminformatie"
          description="Een beknopt overzicht van de omgeving die deze cloudinstantie aandrijft."
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-border bg-card/30 p-3">
              <span className="text-xs font-medium opacity-70">Hostnaam</span>
              <p className="mt-1 font-mono text-sm">{info?.hostname || "-"}</p>
            </div>
            <div className="rounded-xl border border-border bg-card/30 p-3">
              <span className="text-xs font-medium opacity-70">Platform</span>
              <p className="mt-1 font-mono text-sm">{info?.platform || "-"}</p>
            </div>
            <div className="rounded-xl border border-border bg-card/30 p-3">
              <span className="text-xs font-medium opacity-70">CPU-kernen</span>
              <p className="mt-1 font-mono text-sm">{info?.cpu_cores || 0}</p>
            </div>
            <div className="rounded-xl border border-border bg-card/30 p-3">
              <span className="text-xs font-medium opacity-70">Python-versie</span>
              <p className="mt-1 font-mono text-sm">{info?.python_version || "-"}</p>
            </div>
          </div>
        </SectionShell>
        )}

        {shouldShowSection("storage") && (
        <SectionShell
          icon={<HardDrive className="h-5 w-5" />}
          eyebrow="Storage"
          title="Huidige opslag"
          description="Volg het actieve opslagdoel en wijzig veilig de hoofdlocatie voor cloudbestanden."
          aside={
            <div className="rounded-2xl border border-border/70 bg-card/40 px-4 py-3 text-right">
              <p className="text-xs uppercase tracking-[0.18em] opacity-45">Gebruik</p>
              <p className="mt-1 text-lg font-semibold">{(info?.storage.free_gb ?? 0).toFixed(2)} GB vrij</p>
            </div>
          }
        >
          <div className="rounded-[1.5rem] border border-border bg-card/30 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{info?.storage.current_path || "-"}</p>
                <p className="mt-1 text-xs opacity-60">
                  {info?.storage.used_gb.toFixed(2)} GB gebruikt van {info?.storage.total_gb.toFixed(2)} GB (
                  {info?.storage.percent_used.toFixed(1)}%)
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">{info?.storage.free_gb.toFixed(2)} GB vrij</p>
              </div>
            </div>
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-card/50">
              <div
                className={`h-full transition-all duration-500 ${getStorageColor(info?.storage.percent_used || 0)}`}
                style={{ width: `${info?.storage.percent_used || 0}%` }}
              />
            </div>
          </div>

          <div className="mt-5 rounded-[1.5rem] border border-border/70 bg-card/25 p-4">
            <label className="block text-sm font-medium">Opslagpad wijzigen</label>
            <p className="mt-1 text-xs opacity-60">Kies een nieuw pad of koppelpunt voor cloudbestanden</p>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                className="flex-1 rounded-xl border border-border bg-card px-3 py-2 font-mono text-sm"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="/pad/naar/opslag"
              />
              <button
                onClick={() => updateStoragePath(newPath)}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
              >
                Pad bijwerken
              </button>
            </div>
          </div>
        </SectionShell>
        )}

        {shouldShowSection("storage") && (
        <SectionShell
          icon={<Boxes className="h-5 w-5" />}
          eyebrow="Storage"
          title="Beschikbare mount points"
          description="Bekijk gedetecteerde schijven en schakel snel naar een andere mount wanneer nodig."
        >
          <div className="space-y-3">
            {info?.available_mounts && info.available_mounts.length > 0 ? (
              info.available_mounts.map((mount, index) => {
                const percent = mount.total_gb > 0 ? (mount.used_gb / mount.total_gb) * 100 : 0;
                return (
                  <div key={index} className="rounded-[1.5rem] border border-border bg-card/30 p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-sm font-medium">{mount.path}</p>
                          {mount.path === info.storage.current_path && (
                            <span className="rounded-md bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
                              Actief
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs opacity-60">
                          {mount.device} ({mount.fstype})
                        </p>
                        <p className="mt-1 text-xs opacity-60">
                          {mount.used_gb.toFixed(1)} GB / {mount.total_gb.toFixed(1)} GB gebruikt ({percent.toFixed(1)}%)
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{mount.free_gb.toFixed(1)} GB vrij</p>
                        {mount.path !== info.storage.current_path && (
                          <button
                            onClick={() => {
                              setNewPath(mount.path);
                              updateStoragePath(mount.path);
                            }}
                            className="mt-2 rounded-lg border border-border bg-card px-3 py-1 text-xs transition hover:bg-accent/10"
                          >
                            Deze schijf gebruiken
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
                Geen mount points gedetecteerd (mogelijk Linux-systeem met /proc/mounts vereist)
              </div>
            )}
          </div>
        </SectionShell>
        )}

        {shouldShowSection("mail") && mailConfig && (
        <SectionShell
          icon={<Mail className="h-5 w-5" />}
          eyebrow="Mail"
          title="Mail instellingen"
          description="Beheer IMAP/SMTP apart voor mailbox synchronisatie en uitgaande berichten."
          aside={
            <div className={`rounded-full px-3 py-1 text-xs font-medium ${mailConfig.has_password ? "bg-green-500/15 text-green-600 dark:text-green-300" : "bg-card/40"}`}>
              {mailConfig.has_password ? "Wachtwoord opgeslagen" : "Wachtwoord vereist"}
            </div>
          }
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">E-mailadres</label>
              <input
                type="email"
                className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                value={mailConfig.email}
                onChange={(e) => setMailConfig((prev) => (prev ? { ...prev, email: e.target.value } : prev))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Gebruikersnaam</label>
              <input
                type="text"
                className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                value={mailConfig.username}
                onChange={(e) => setMailConfig((prev) => (prev ? { ...prev, username: e.target.value } : prev))}
              />
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium">IMAP host</label>
              <input
                type="text"
                className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                value={mailConfig.imap_host}
                onChange={(e) => setMailConfig((prev) => (prev ? { ...prev, imap_host: e.target.value } : prev))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">IMAP poort</label>
              <input
                type="number"
                className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                value={mailConfig.imap_port}
                onChange={(e) => setMailConfig((prev) => (prev ? { ...prev, imap_port: Number(e.target.value) || 993 } : prev))}
              />
            </div>
            <label className="mt-7 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={mailConfig.imap_use_ssl}
                onChange={(e) => setMailConfig((prev) => (prev ? { ...prev, imap_use_ssl: e.target.checked } : prev))}
              />
              IMAP SSL gebruiken
            </label>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <div>
              <label className="block text-sm font-medium">SMTP host</label>
              <input
                type="text"
                className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                value={mailConfig.smtp_host}
                onChange={(e) => setMailConfig((prev) => (prev ? { ...prev, smtp_host: e.target.value } : prev))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">SMTP poort</label>
              <input
                type="number"
                className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                value={mailConfig.smtp_port}
                onChange={(e) => setMailConfig((prev) => (prev ? { ...prev, smtp_port: Number(e.target.value) || 587 } : prev))}
              />
            </div>
            <label className="mt-7 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={mailConfig.smtp_use_tls}
                onChange={(e) => setMailConfig((prev) => (prev ? { ...prev, smtp_use_tls: e.target.checked } : prev))}
              />
              SMTP TLS
            </label>
            <label className="mt-7 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={mailConfig.smtp_use_ssl}
                onChange={(e) => setMailConfig((prev) => (prev ? { ...prev, smtp_use_ssl: e.target.checked } : prev))}
              />
              SMTP SSL
            </label>
          </div>

          <div className="mt-3">
            <label className="block text-sm font-medium">Wachtwoord</label>
            <input
              type="password"
              className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
              placeholder={mailConfig.has_password ? "Al opgeslagen (leeg laten om te behouden)" : "Mailbox wachtwoord"}
              value={mailPassword}
              onChange={(e) => setMailPassword(e.target.value)}
            />
          </div>

          <div className="mt-3">
            <label className="block text-sm font-medium">E-mailhandtekening</label>
            <textarea
              className="mt-2 h-32 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
              value={mailConfig.email_signature}
              onChange={(e) => setMailConfig((prev) => (prev ? { ...prev, email_signature: e.target.value } : prev))}
            />
          </div>

          {canConfigureGlobal && (
            <label className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
              <input type="checkbox" checked={mailApplyToAll} onChange={(e) => setMailApplyToAll(e.target.checked)} />
              Deze mailconfiguratie voor alle accounts gebruiken
            </label>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={saveMailConfig}
              disabled={mailBusy}
              className="rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {mailBusy ? "Opslaan..." : "Mail-instellingen opslaan"}
            </button>
            <button
              onClick={testMailConfig}
              disabled={mailTestBusy}
              className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium transition hover:bg-accent/10 disabled:opacity-50"
            >
              {mailTestBusy ? "Testen..." : "Mailverbinding testen"}
            </button>
          </div>
        </SectionShell>
        )}

        {shouldShowSection("api") && (
        <SectionShell
          icon={<Store className="h-5 w-5" />}
          eyebrow="API"
          title="API instellingen: Shopify"
          description="Koppel Shopify om besteldata en orderevents in het cloud-dashboard en de afhandelingsflow te tonen."
          aside={
            <div className={`rounded-full px-3 py-1 text-xs font-medium ${shopifyHasToken ? "bg-green-500/15 text-green-600 dark:text-green-300" : "bg-card/40"}`}>
              {shopifyHasToken ? "Geconfigureerd" : "Token vereist"}
            </div>
          }
        >
          <p className="mt-2 text-xs opacity-70">
            Gebruik hier je <strong>.myshopify.com</strong> admin-domein (niet je webshopdomein zoals thokan.be).
          </p>
          <p className="mt-1 text-xs opacity-70">
            Toegangstoken: Shopify Admin → Apps and sales channels → Develop apps → jouw app → Configuration (scope: read_orders)
            → App installeren → API credentials → Admin API-access token.
          </p>
          <p className="mt-1 text-xs opacity-70">
            Shopify Inbox-conversaties zijn niet beschikbaar via deze Admin API-route. De huidige integratie kan wel Shopify-orderdata en orderevents tonen.
          </p>
          <p className="mt-1 text-xs opacity-70">
            Voor websitechats kun je hieronder de website-chat bridge activeren. Je website of middleware stuurt dan berichten naar Cloud, waar ze in de Shopify-werkruimte verschijnen.
          </p>
          <p className="mt-1 text-xs opacity-70">
            Client ID/Secret kun je optioneel bewaren als referentie, maar voor bestellingen is altijd een Admin API-access token nodig.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">Store-domein</label>
              <input
                type="text"
                className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                placeholder="your-store.myshopify.com"
                value={shopifyDomain}
                onChange={(e) => setShopifyDomain(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">API-versie</label>
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
              <label className="block text-sm font-medium">Admin API access token</label>
            <input
              type="password"
              className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
              placeholder={shopifyHasToken ? "Token al opgeslagen (leeg laten om te behouden)" : "shpat_..."}
              value={shopifyAccessToken}
              onChange={(e) => setShopifyAccessToken(e.target.value)}
            />
            {shopifyHasToken && <p className="mt-1 text-xs opacity-60">Er is al een token veilig opgeslagen.</p>}
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">Client ID (optioneel)</label>
              <input
                type="text"
                className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                placeholder="Shopify app client id"
                value={shopifyClientId}
                onChange={(e) => setShopifyClientId(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Clientgeheim (optioneel)</label>
              <input
                type="password"
                className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                placeholder={shopifyHasClientCredentials ? "Al opgeslagen (leeg laten om te behouden)" : "Shopify app client secret"}
                value={shopifyClientSecret}
                onChange={(e) => setShopifyClientSecret(e.target.value)}
              />
            </div>
          </div>
          {shopifyHasClientCredentials && (
            <p className="mt-1 text-xs opacity-60">Clientgegevens zijn al veilig opgeslagen.</p>
          )}

          {canConfigureGlobal && (
            <label className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
              <input type="checkbox" checked={shopifyApplyToAll} onChange={(e) => setShopifyApplyToAll(e.target.checked)} />
              Deze Shopify-configuratie voor alle accounts gebruiken
            </label>
          )}
          {shopifyIsGlobal && (
            <p className="mt-2 text-xs opacity-60">Deze Shopify-configuratie wordt momenteel globaal gebruikt voor alle accounts zonder eigen instelling.</p>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={saveShopifyConfig}
              disabled={!shopifyDomain || !shopifyApiVersion || shopifyBusy}
              className="rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {shopifyBusy ? "Opslaan..." : "Shopify-config opslaan"}
            </button>
            <button
              onClick={testShopifyConnection}
              disabled={!shopifyDomain || testShopifyBusy || !shopifyHasToken}
              className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium transition hover:bg-accent/10 disabled:opacity-50"
            >
              {testShopifyBusy ? "Testen..." : "Verbinding testen"}
            </button>
          </div>
          {shopifyTestStatus && (
            <div className="mt-2 rounded-xl border border-border bg-card/50 p-3 text-sm">
              <p>{shopifyTestStatus}</p>
            </div>
          )}

          {shopifyCapabilities && (
            <div className="mt-4 rounded-2xl border border-border bg-card/35 p-4">
              <p className="text-sm font-medium">Shopify API-capaciteiten</p>
              <p className="mt-2 text-xs opacity-70">{shopifyCapabilities.inbox_chat_reason}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {shopifyCapabilities.granted_scopes.length > 0 ? (
                  shopifyCapabilities.granted_scopes.map((scope) => (
                    <span key={scope} className="rounded-full border border-border px-2.5 py-1 text-xs opacity-80">
                      {scope}
                    </span>
                  ))
                ) : (
                  <span className="text-xs opacity-60">Geen scopes gevonden.</span>
                )}
              </div>
            </div>
          )}

          {canConfigureGlobal && (
            <div className="mt-5 rounded-[1.5rem] border border-border/70 bg-card/25 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-medium">Shopify website-chat bridge</p>
                  <p className="mt-1 text-xs opacity-70">
                    Gebruik deze bridge wanneer je websitechatbox berichten server-side of via middleware naar ThoKan Cloud moet doorsturen.
                  </p>
                </div>
                <div className={`rounded-full px-3 py-1 text-xs font-medium ${shopifyWebsiteChatEnabled ? "bg-green-500/15 text-green-600 dark:text-green-300" : "bg-card/40"}`}>
                  {shopifyWebsiteChatEnabled ? "Ingeschakeld" : "Uitgeschakeld"}
                </div>
              </div>

              <label className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={shopifyWebsiteChatEnabled}
                  onChange={(e) => setShopifyWebsiteChatEnabled(e.target.checked)}
                />
                Website-chat bridge inschakelen
              </label>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium">Bridge endpoint</label>
                  <input
                    type="text"
                    readOnly
                    value={shopifyWebsiteChatBridge?.endpoint_url || ""}
                    className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm opacity-80"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">Shared secret</label>
                  <input
                    type="text"
                    value={shopifyWebsiteChatSecret}
                    onChange={(e) => setShopifyWebsiteChatSecret(e.target.value)}
                    placeholder="Laat leeg om automatisch te genereren bij inschakelen"
                    className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => void saveShopifyWebsiteChatBridgeConfig(false)}
                  disabled={shopifyWebsiteChatBusy}
                  className="rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {shopifyWebsiteChatBusy ? "Opslaan..." : "Bridge opslaan"}
                </button>
                <button
                  onClick={() => void saveShopifyWebsiteChatBridgeConfig(true)}
                  disabled={shopifyWebsiteChatBusy}
                  className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium transition hover:bg-accent/10 disabled:opacity-50"
                >
                  Nieuw secret genereren
                </button>
              </div>

              {shopifyWebsiteChatBridge?.integration_note && (
                <p className="mt-3 text-xs opacity-70">{shopifyWebsiteChatBridge.integration_note}</p>
              )}

              <div className="mt-4 rounded-2xl border border-border bg-card/35 p-4">
                <p className="text-sm font-medium">Payload voorbeeld</p>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl border border-border bg-card/40 p-3 text-xs opacity-85">{`POST ${shopifyWebsiteChatBridge?.endpoint_path || "/api/v1/shopify/website-chat/ingest"}
Header: X-Shopify-Chat-Secret: ${shopifyWebsiteChatSecret || "<shared-secret>"}

{
  "conversation_id": "shopify-chat-123",
  "message_id": "message-456",
  "customer_name": "Jane Doe",
  "customer_email": "jane@example.com",
  "customer_phone": "+32...",
  "page_url": "https://jouwdomein.be/products/item",
  "shop_domain": "your-store.myshopify.com",
  "direction": "inbound",
  "message": "Hallo, ik heb een vraag over mijn bestelling",
  "sent_at": "2026-03-12T10:30:00Z",
  "source": "shopify-website-chat",
  "author_name": "Jane Doe"
}`}</pre>
              </div>
            </div>
          )}
        </SectionShell>
        )}

        {shouldShowSection("api") && (
        <SectionShell
          icon={<ShoppingBag className="h-5 w-5" />}
          eyebrow="API"
          title="API instellingen: Gelato"
          description="Configureer Gelato voor productmapping, prijzen en bestelplaatsing vanuit Shopify-bestellingen."
          aside={
            <div className={`rounded-full px-3 py-1 text-xs font-medium ${gelatoHasKey ? "bg-green-500/15 text-green-600 dark:text-green-300" : "bg-card/40"}`}>
              {gelatoHasKey ? "Verbonden" : "API-sleutel vereist"}
            </div>
          }
        >
          <p className="mt-1 text-sm opacity-60">
            Configureer de Gelato API voor catalogusdetectie, prijzen en bestelplaatsing vanuit Shopify-bestellingen.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">Basis-URL</label>
              <input
                type="text"
                className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                placeholder="https://order.gelatoapis.com"
                value={gelatoBaseUrl}
                onChange={(e) => setGelatoBaseUrl(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">API-sleutel</label>
              <input
                type="password"
                className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                placeholder={gelatoHasKey ? "API-sleutel al opgeslagen (leeg laten om te behouden)" : "Gelato API-sleutel"}
                value={gelatoApiKey}
                onChange={(e) => setGelatoApiKey(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-3">
            <label className="block text-sm font-medium">SKU-mapping (Shopify SKU → Gelato productUid)</label>
            <p className="mt-1 text-xs opacity-60">Voorbeeld: {`{ "TSHIRT-BLACK-M": "gelato-product-uid" }`}</p>
            <textarea
              className="mt-2 h-40 w-full rounded-xl border border-border bg-card px-3 py-2 font-mono text-xs"
              value={gelatoSkuMapText}
              onChange={(e) => setGelatoSkuMapText(e.target.value)}
            />
          </div>

          {canConfigureGlobal && (
            <label className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
              <input type="checkbox" checked={gelatoApplyToAll} onChange={(e) => setGelatoApplyToAll(e.target.checked)} />
              Deze Gelato-configuratie voor alle accounts gebruiken
            </label>
          )}
          {gelatoIsGlobal && (
            <p className="mt-2 text-xs opacity-60">Deze Gelato-configuratie wordt momenteel globaal gebruikt voor alle accounts zonder eigen instelling.</p>
          )}

          <div className="mt-4">
            <button
              onClick={saveGelatoConfig}
              disabled={!gelatoBaseUrl || gelatoBusy}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {gelatoBusy ? "Opslaan..." : "Gelato-config opslaan"}
            </button>
          </div>
        </SectionShell>
        )}

        {shouldShowSection("info") && (
        <SectionShell
          icon={<PackageCheck className="h-5 w-5" />}
          eyebrow="Info"
          title="Systeemupdates"
          description="Controleer GitHub-gepubliceerde stable- of beta-updates, download ze naar de server en installeer ze gecontroleerd."
          aside={
            <div className={`rounded-full px-3 py-1 text-xs font-medium ${getUpdateStateTone(updateStatus?.state)}`}>
              {updateStatus?.state || "inactief"}
            </div>
          }
        >
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card/30 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.16em] opacity-50">Huidige versie</p>
              <p className="mt-2 text-2xl font-bold">{updateStatus?.installed_version ? `v${updateStatus.installed_version}` : "Onbekend"}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card/30 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.16em] opacity-50">Beschikbare versie</p>
              <p className="mt-2 text-2xl font-bold">
                {checkResult?.up_to_date
                  ? "Geen update"
                  : updatePrompt?.version
                  ? `v${updatePrompt.version}`
                  : checkResult?.version
                  ? `v${checkResult.version}`
                  : "Nog niet gecontroleerd"}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={checkAndFetchLatestUpdate}
              disabled={fetchBusy}
              className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2 text-sm font-medium transition hover:bg-accent/10 disabled:opacity-50"
            >
              <ArrowUpRight className="h-4 w-4" />
              {fetchBusy ? "Controleren..." : "Update controleren"}
            </button>
            {updatePrompt && (
              <button
                onClick={() => void fetchLatestUpdate()}
                disabled={updateBusy || fetchBusy}
                className="inline-flex items-center gap-2 rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {updateBusy ? "Installeren..." : "Update installeren"}
              </button>
            )}
          </div>

          {updatePrompt?.notes && (
            <div className="mt-4 rounded-xl border border-border bg-card/40 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider opacity-60">Releasenotes</p>
              <pre className="whitespace-pre-wrap text-xs leading-relaxed">{updatePrompt.notes}</pre>
            </div>
          )}

          {status && (
            <p className="mt-3 text-sm opacity-75">{status}</p>
          )}

          {(updateBusy || updateStatus?.state === "running") && (
            <div className="mt-4 rounded-xl border border-border bg-card/30 p-3 text-sm">
              <p className="opacity-70">{updateStatus?.progress_step || "Update bezig..."}</p>
            </div>
          )}
        </SectionShell>
        )}

        </div>
      </div>
    </LayoutShell>
  );
}
