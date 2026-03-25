"use client";

import { useEffect } from "react";
import { useState } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { AuthShell } from "@/components/auth-shell";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [noticeType, setNoticeType] = useState<"warning" | "success">("warning");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let notice: string | null = null;
    let type: string | null = null;
    try {
      notice = sessionStorage.getItem("auth_notice");
      type = sessionStorage.getItem("auth_notice_type");
    } catch {
      notice = null;
      type = null;
    }

    if (notice) {
      setError(notice);
      setNoticeType(type === "success" ? "success" : "warning");
      try {
        sessionStorage.removeItem("auth_notice");
        sessionStorage.removeItem("auth_notice_type");
      } catch {
        // Ignore storage errors.
      }
    }
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await api<{ access_token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      try {
        localStorage.setItem("access_token", response.access_token);
      } catch {
        setError("Browser-opslag geblokkeerd. Sta cookies/local storage toe en probeer opnieuw.");
        setLoading(false);
        return;
      }

      try {
        sessionStorage.removeItem("auth_notice");
      } catch {
        // Ignore storage errors.
      }

      window.location.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inloggen mislukt");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      badge="Secure cloud access"
      title="Welkom terug in een duidelijke ThoKan Cloud werkruimte."
      description="Log in om verder te werken met bestanden, e-mail, bestellingen en platformbeheer vanuit één samenhangende interface."
      eyebrow="Authenticatie"
      formTitle="Inloggen"
      formDescription="Gebruik je accountgegevens om de cloudwerkruimte te openen."
      asideLabel="Toegang"
      asideValue="Beveiligd"
      secondaryHref="/register"
      secondaryLabel="Registreren"
      secondaryText="Nog geen account? Vraag een administrator of registreer als self-signup geactiveerd is."
      features={[
        {
          title: "Protected access",
          description: "Sessie-gebaseerde authenticatie met veilige tokenflow.",
          icon: <ShieldCheck className="h-4 w-4" />,
        },
        {
          title: "Direct workspace access",
          description: "Ga direct naar je overzicht na het inloggen.",
          icon: <LockKeyhole className="h-4 w-4" />,
        },
        {
          title: "Samenhangende modules",
          description: "Files, mail, commerce en admin zitten in dezelfde productlaag.",
          icon: <Sparkles className="h-4 w-4" />,
        },
      ]}
    >
      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label htmlFor="email" className="field-label">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field-input"
            placeholder="you@example.com"
            required
            autoFocus
          />
        </div>

        <div>
          <label htmlFor="password" className="field-label">
            Wachtwoord
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field-input"
            placeholder="••••••••"
            required
          />
        </div>

        {error && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              noticeType === "success"
                ? "border-success/30 bg-success/10 text-success"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            }`}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Inloggen…
            </span>
          ) : (
            <>
              Inloggen
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
}
