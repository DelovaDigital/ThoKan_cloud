"use client";

import { useEffect, useState } from "react";
import { Moon, SunMedium } from "lucide-react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const isDark = saved === "dark";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    localStorage.setItem("theme", next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
  }

  return (
    <button
      onClick={toggle}
      className="flex w-full items-center justify-between border border-border px-3 py-2.5 text-sm transition hover:bg-card"
    >
      <span>{dark ? "Lichte" : "Donkere"} modus</span>
      {dark ? <SunMedium className="h-4 w-4 opacity-70" /> : <Moon className="h-4 w-4 opacity-70" />}
    </button>
  );
}
