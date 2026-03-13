"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, ShieldCheck, Sparkles, UserPlus } from "lucide-react";
import { api } from "@/lib/api";

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
    <div className="min-h-screen bg-bg p-4 sm:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-7xl overflow-hidden rounded-[2rem] border border-border/60 bg-card/35 shadow-glass lg:grid-cols-[0.95fr_1.05fr]">
        <section className="relative hidden overflow-hidden border-r border-border/60 bg-gradient-to-br from-card via-card to-accent/10 p-8 lg:block xl:p-10">
          <div className="absolute -right-20 top-0 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-64 w-64 rounded-full bg-sky-400/10 blur-3xl" />
          <div className="relative flex h-full flex-col justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/40 px-3 py-1 text-xs font-medium opacity-80">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                Start op één plek
              </div>
              <img src="/Logo_tekst_CV.png" alt="ThoKan Cloud" className="mt-6 h-16 w-auto" />
              <h1 className="mt-8 max-w-xl text-4xl font-semibold leading-tight xl:text-5xl">
                Maak je ThoKan Cloud account en ga meteen aan de slag.
              </h1>
              <p className="mt-4 max-w-xl text-base opacity-70">
                Registreer één keer en krijg toegang tot je overzicht, bestanden, mailbox en operationele tools.
              </p>
            </div>

            <div className="space-y-3">
              <div className="rounded-[1.5rem] border border-border/70 bg-card/45 p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-accent" />
                  <div>
                    <p className="text-sm font-medium">Quick onboarding</p>
                    <p className="text-xs opacity-60">Account aanmaken en inloggen gebeuren in één flow.</p>
                  </div>
                </div>
              </div>
              <div className="rounded-[1.5rem] border border-border/70 bg-card/45 p-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-accent" />
                  <div>
                    <p className="text-sm font-medium">Professional workspace</p>
                    <p className="text-xs opacity-60">Direct toegang tot de vernieuwde cloudomgeving na registratie.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center p-6 sm:p-8 xl:p-10">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-45">Account setup</p>
              <h2 className="mt-2 text-3xl font-semibold">Account aanmaken</h2>
              <p className="mt-2 text-sm opacity-70">Stel je account in en ga meteen de cloud in.</p>
            </div>

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
              <Link href="/" className="text-accent hover:underline">
                Inloggen
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
