"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Cloud, FolderOpen, Mail, MessageSquareText, Settings, ShieldCheck, Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { ensureSession } from "@/lib/api";

type SessionState = "loading" | "authenticated" | "guest";

const featureCards = [
  {
    title: "Bestanden",
    description: "Beheer cloudopslag, recente uploads en teamdocumenten vanuit één overzichtelijke werkruimte.",
    href: "/files",
    icon: FolderOpen,
  },
  {
    title: "E-mail",
    description: "Bekijk inbox en verzonden berichten in een gerichte interface met snellere navigatie.",
    href: "/mail",
    icon: Mail,
  },
  {
    title: "Shopify feed",
    description: "Volg Shopify orderevents in een centrale feed en zie sneller wanneer bestellingactiviteit verandert.",
    href: "/shopify",
    icon: MessageSquareText,
  },
  {
    title: "Admin",
    description: "Monitor gebruikers, opslag en platformstatus met een professioneel beheerpaneel.",
    href: "/admin",
    icon: ShieldCheck,
  },
  {
    title: "Instellingen",
    description: "Beheer updates, omgevingsopties en mailboxconfiguratie op één plek.",
    href: "/settings",
    icon: Settings,
  },
];

export default function HomePage() {
  const [sessionState, setSessionState] = useState<SessionState>("loading");

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      const authenticated = await ensureSession();
      if (cancelled) return;
      setSessionState(authenticated ? "authenticated" : "guest");
    }

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const primaryAction = useMemo(() => {
    if (sessionState === "authenticated") {
      return { href: "/dashboard", label: "Open overzicht" };
    }
    return { href: "/login", label: "Inloggen" };
  }, [sessionState]);

  return (
    <div className="min-h-screen overflow-hidden bg-bg">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="glass sticky top-3 z-20 rounded-3xl px-5 py-4 backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                <Cloud className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] opacity-50">ThoKan</p>
                <h1 className="text-2xl font-semibold">Cloud werkruimte</h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <ThemeToggle />
              <Link href={primaryAction.href} className="rounded-2xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90">
                {sessionState === "loading" ? "Sessie controleren..." : primaryAction.label}
              </Link>
              {sessionState !== "authenticated" && (
                <Link href="/register" className="rounded-2xl border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-card/70">
                  Account aanmaken
                </Link>
              )}
            </div>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-6 py-6">
          <section className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-gradient-to-br from-card via-card to-accent/10 p-6 shadow-glass sm:p-8 lg:p-10">
            <div className="absolute -right-20 top-0 h-64 w-64 rounded-full bg-accent/15 blur-3xl" />
            <div className="absolute -left-16 bottom-0 h-56 w-56 rounded-full bg-sky-400/10 blur-3xl" />
            <div className="relative grid gap-8 lg:grid-cols-[1.35fr_0.9fr] lg:items-center">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-xs font-medium opacity-80">
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                  Professioneel cloud controlecentrum
                </div>
                <div className="space-y-3">
                  <h2 className="max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">
                    Een snellere, duidelijkere start voor bestanden, e-mail en operaties.
                  </h2>
                  <p className="max-w-2xl text-base opacity-70 sm:text-lg">
                    ThoKan Cloud start nu met een moderne overzichtspagina die direct toegang geeft tot de tools die je team het meest gebruikt.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link href={primaryAction.href} className="rounded-2xl bg-accent px-5 py-3 text-sm font-medium text-white transition hover:opacity-90">
                    {sessionState === "authenticated" ? "Ga naar overzicht" : "Open cloud"}
                  </Link>
                  <Link href="/files" className="rounded-2xl border border-border px-5 py-3 text-sm font-medium transition hover:bg-card/70">
                    Open bestanden
                  </Link>
                  <Link href="/mail" className="rounded-2xl border border-border px-5 py-3 text-sm font-medium transition hover:bg-card/70">
                    Open postvak
                  </Link>
                  <Link href="/shopify" className="rounded-2xl border border-border px-5 py-3 text-sm font-medium transition hover:bg-card/70">
                    Open Shopify feed
                  </Link>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-border/70 bg-card/50 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] opacity-50">Opslag</p>
                    <p className="mt-2 text-lg font-semibold">Gecentraliseerde bestanden</p>
                    <p className="mt-1 text-sm opacity-65">Snelle toegang tot uploads, recente items en gedeeld werk.</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-card/50 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] opacity-50">E-mail</p>
                    <p className="mt-2 text-lg font-semibold">Postvak IN + Verzonden</p>
                    <p className="mt-1 text-sm opacity-65">Eén plek om gesprekken te beheren en sneller te reageren.</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-card/50 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] opacity-50">Shopify</p>
                    <p className="mt-2 text-lg font-semibold">Eventfeed</p>
                    <p className="mt-1 text-sm opacity-65">Recente Shopify-orderupdates en klantactiviteit in één doorlopende stroom.</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-card/50 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] opacity-50">Beheer</p>
                    <p className="mt-2 text-lg font-semibold">Platforminstellingen</p>
                    <p className="mt-1 text-sm opacity-65">Updates, omgevingsacties en systeemcontrole.</p>
                  </div>
                </div>
              </div>

              <div className="glass rounded-[2rem] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Werkruimtestatus</p>
                    <p className="text-xs opacity-55">Live-overzicht van de cloudomgeving</p>
                  </div>
                  <span className="rounded-full bg-green-500/15 px-3 py-1 text-xs font-medium text-green-500">
                    {sessionState === "loading" ? "Controleren" : sessionState === "authenticated" ? "Klaar" : "Gast"}
                  </span>
                </div>
                <div className="space-y-3">
                  <div className="rounded-2xl border border-border/70 bg-card/40 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Toegang overzicht</span>
                      <span className="text-xs opacity-55">Altijd beschikbaar</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-card/70">
                      <div className="h-full w-full rounded-full bg-accent" />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-card/40 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">E-mail werkruimte</span>
                      <span className="text-xs opacity-55">Vernieuwd</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-card/70">
                      <div className="h-full w-[88%] rounded-full bg-sky-400" />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-card/40 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Updatebeheer</span>
                      <span className="text-xs opacity-55">Stabiel + beta</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-card/70">
                      <div className="h-full w-[92%] rounded-full bg-violet-400" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-4">
            {featureCards.map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.title}
                  href={card.href}
                  className="glass group rounded-3xl p-5 transition hover:-translate-y-0.5 hover:bg-card/80"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent transition group-hover:bg-accent/20">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{card.title}</h3>
                  <p className="mt-2 text-sm opacity-65">{card.description}</p>
                  <div className="mt-4 text-sm font-medium text-accent">Open {card.title.toLowerCase()} →</div>
                </Link>
              );
            })}
          </section>
        </main>
      </div>
    </div>
  );
}

