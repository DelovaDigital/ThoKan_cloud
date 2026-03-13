"use client";

import { useEffect, useRef, useState } from "react";
import { Cloud } from "lucide-react";
import { getApiBase } from "@/lib/api";

const POLL_INTERVAL_MS = 2500;
const TIMEOUT_MS = 300_000; // 5 minutes

export default function RestartingPage() {
  const [dots, setDots] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  // Animated dots
  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d + 1) % 4), 500);
    return () => clearInterval(t);
  }, []);

  // Elapsed timer (seconds)
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  // Poll backend and redirect when ready
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const deadline = startRef.current + TIMEOUT_MS;
      while (!cancelled && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (cancelled) break;
        try {
          const res = await fetch(`${getApiBase()}/auth/me`, {
            method: "GET",
            cache: "no-store",
          });
          // Any real HTTP response means the server is up
          if (res.status === 200 || res.status === 401 || res.status === 403) {
            if (!cancelled) {
              localStorage.removeItem("access_token");
              sessionStorage.setItem(
                "auth_notice",
                "Update toegepast en services herstart. Log opnieuw in om verder te gaan."
              );
              sessionStorage.setItem("auth_notice_type", "success");
              window.location.replace("/login");
            }
            return;
          }
        } catch {
          // still restarting — keep waiting
        }
      }
      // Timed out: go to login anyway
      if (!cancelled) {
        localStorage.removeItem("access_token");
        sessionStorage.setItem("auth_notice", "Herstart duurde te lang. Probeer opnieuw in te loggen.");
        sessionStorage.setItem("auth_notice_type", "warning");
        window.location.replace("/login");
      }
    }

    void poll();
    return () => { cancelled = true; };
  }, []);

  const dotStr = ".".repeat(dots).padEnd(3, "\u00a0");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-bg px-4 text-center">
      {/* Pulsing logo */}
      <div className="relative flex items-center justify-center">
        <span className="absolute inline-flex h-24 w-24 animate-ping rounded-3xl bg-accent/20" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-accent/15 text-accent">
          <Cloud className="h-10 w-10" />
        </div>
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          ThoKan Cloud wordt herstart{dotStr}
        </h1>
        <p className="text-sm opacity-60">
          De server wordt bijgewerkt. Dit duurt gewoonlijk 10–30 seconden.
        </p>
      </div>

      {/* Spinner bar */}
      <div className="h-1.5 w-56 overflow-hidden rounded-full bg-card/60">
        <div className="h-full animate-[shimmer_1.5s_ease-in-out_infinite] rounded-full bg-accent/70" />
      </div>

      <p className="text-xs opacity-40">{elapsed}s gewacht — je wordt automatisch doorgestuurd</p>
    </div>
  );
}
