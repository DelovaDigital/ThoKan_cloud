"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
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
          <label htmlFor="fullName" className="field-label">
            Volledige naam
          </label>
          <input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="field-input"
            placeholder="John Doe"
            required
            autoFocus
          />
        </div>

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
            minLength={8}
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="field-label">
            Bevestig wachtwoord
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="field-input"
            placeholder="••••••••"
            required
            minLength={8}
          />
        </div>

        {error && (
          <div className="border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-500">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full"
        >
          {loading ? "Account aanmaken..." : "Account aanmaken"}
          {!loading && <ArrowRight className="h-4 w-4" />}
        </button>
      </form>
    </AuthShell>
  );
}
