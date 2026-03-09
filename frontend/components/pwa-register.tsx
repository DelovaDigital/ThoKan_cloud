"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

export function PWARegister() {
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      return;
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Ignore registration issues silently to avoid UX disruption
      });
    }
  }, []);

  return null;
}
