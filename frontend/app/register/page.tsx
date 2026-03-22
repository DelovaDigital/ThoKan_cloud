"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, ShieldCheck, Sparkles, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { AuthShell } from "@/components/auth-shell";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Wachtwoorden komen niet overeen");
      return;
    }

    if (password.length < 8) {
      setError("Wachtwoord moet minstens 8 tekens bevatten");
      return;
    }

    setLoading(true);

    try {
      await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email,
          full_name: fullName,
          password,
          role: "employee",
        }),
      });

      // Auto-login after registration
      const loginResponse = await api<{ access_token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      localStorage.setItem("access_token", loginResponse.access_token);
      
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registratie mislukt");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      badge="Start op één plek"
      title="Maak je ThoKan Cloud account en ga meteen aan de slag."
      description="Registreer één keer en krijg toegang tot je overzicht, bestanden, mailbox en operationele tools."
      eyebrow="Account setup"
      formTitle="Account aanmaken"
      formDescription="Stel je account in en ga meteen de cloud in."
      asideLabel="Flow"
      asideValue="Direct live"
      secondaryHref="/login"
      secondaryLabel="Inloggen"
      secondaryText="Heb je al een account? Gebruik je bestaande gegevens en open meteen je workspace."
      features={[
        {
          title: "Quick onboarding",
          description: "Account aanmaken en inloggen gebeuren in één flow.",
          icon: <CheckCircle2 className="h-4 w-4" />,
        },
        {
          title: "Professional workspace",
          description: "Direct toegang tot de vernieuwde cloudomgeving na registratie.",
          icon: <ShieldCheck className="h-4 w-4" />,
        },
        {
          title: "Self-serve start",
          description: "Nieuwe accounts landen meteen in dezelfde control workspace als bestaande teams.",
          icon: <Sparkles className="h-4 w-4" />,
        },
      ]}
    >
      <form onSubmit={handleRegister} className="space-y-4">
        <div>
          <label htmlFor="fullName" className="mb-2 block text-sm font-medium">
            Volledige naam
          </label>
          <input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-2xl border border-border bg-transparent px-4 py-3"
            placeholder="John Doe"
            required
            autoFocus
          />
        </div>

        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl border border-border bg-transparent px-4 py-3"
            placeholder="you@example.com"
            required
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-medium">
            Wachtwoord
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-2xl border border-border bg-transparent px-4 py-3"
            placeholder="••••••••"
            required
            minLength={8}
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium">
            Bevestig wachtwoord
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-2xl border border-border bg-transparent px-4 py-3"
            placeholder="••••••••"
            required
            minLength={8}
          />
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-500">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3 font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Account aanmaken..." : "Account aanmaken"}
          {!loading && <ArrowRight className="h-4 w-4" />}
        </button>
      </form>

      <div className="mt-6 rounded-[1.5rem] border border-border/70 bg-card/35 p-4 text-sm opacity-70">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-accent" />
          Nieuwe accounts worden automatisch ingelogd na succesvolle registratie.
        </div>
      </div>

      <p className="mt-6 text-center text-sm opacity-60">
        Heb je al een account?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Inloggen
        </Link>
      </p>
    </AuthShell>
  );
}
