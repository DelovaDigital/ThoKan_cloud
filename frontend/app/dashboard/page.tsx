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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const result = await api<DashboardData>("/dashboard");
      setData(result);
    } catch {
      setData(null);
    }
    setLoading(false);
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
      </div>
    </LayoutShell>
  );
}
