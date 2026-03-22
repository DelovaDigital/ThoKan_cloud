"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

type AuthShellFeature = {
  title: string;
  description: string;
  icon: ReactNode;
};

type AuthShellProps = {
  badge: string;
  title: string;
  description: string;
  eyebrow: string;
  formTitle: string;
  formDescription: string;
  features: AuthShellFeature[];
  asideLabel: string;
  asideValue: string;
  secondaryHref: string;
  secondaryLabel: string;
  secondaryText: string;
  children: ReactNode;
};

export function AuthShell({
  badge,
  title,
  description,
  eyebrow,
  formTitle,
  formDescription,
  features,
  asideLabel,
  asideValue,
  secondaryHref,
  secondaryLabel,
  secondaryText,
  children,
}: AuthShellProps) {
  return (
    <div className="min-h-screen overflow-hidden bg-bg p-4 sm:p-6">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.16),_transparent_22%),radial-gradient(circle_at_78%_18%,_rgba(14,165,233,0.14),_transparent_18%),radial-gradient(circle_at_bottom_right,_rgba(249,115,22,0.12),_transparent_24%)]" />
      <div className="pointer-events-none fixed inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(148,163,184,0.35)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.35)_1px,transparent_1px)] [background-size:24px_24px]" />

      <div className="relative mx-auto grid min-h-[calc(100vh-2rem)] max-w-7xl overflow-hidden rounded-[2rem] border border-border/60 bg-card/35 shadow-glass lg:grid-cols-[1.02fr_0.98fr]">
        <section className="relative overflow-hidden border-b border-border/60 p-6 sm:p-8 lg:border-b-0 lg:border-r xl:p-10">
          <div className="absolute -left-16 top-12 h-56 w-56 rounded-full bg-accent/15 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-sky-400/10 blur-3xl" />
          <div className="relative flex h-full flex-col justify-between gap-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/45 px-3 py-1 text-xs font-medium opacity-80">
                {badge}
              </div>
              <img src="/Logo_tekst_CV.png" alt="ThoKan Cloud" className="mt-6 h-14 w-auto sm:h-16" />
              <h1 className="mt-8 max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl xl:text-6xl">{title}</h1>
              <p className="mt-4 max-w-xl text-base opacity-72 sm:text-lg">{description}</p>

              <div className="mt-6 flex flex-wrap gap-3">
                <div className="rounded-full border border-border/70 bg-card/35 px-4 py-2 text-sm opacity-75">Workspace-first UX</div>
                <div className="rounded-full border border-border/70 bg-card/35 px-4 py-2 text-sm opacity-75">Files, mail, commerce, admin</div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {features.map((feature) => (
                <div key={feature.title} className="rounded-[1.5rem] border border-border/70 bg-card/45 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                      {feature.icon}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{feature.title}</p>
                      <p className="mt-1 text-xs opacity-60">{feature.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center p-6 sm:p-8 xl:p-10">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-45">{eyebrow}</p>
                <h2 className="mt-2 text-3xl font-semibold">{formTitle}</h2>
                <p className="mt-2 text-sm opacity-70">{formDescription}</p>
              </div>
              <div className="rounded-[1.25rem] border border-border/70 bg-card/35 px-4 py-3 text-right">
                <p className="text-[11px] uppercase tracking-[0.16em] opacity-45">{asideLabel}</p>
                <p className="mt-1 text-sm font-medium">{asideValue}</p>
              </div>
            </div>

            {children}

            <div className="mt-6 rounded-[1.5rem] border border-border/70 bg-card/35 p-4 text-sm opacity-72">
              <Link href={secondaryHref} className="inline-flex items-center gap-2 font-medium text-accent hover:underline">
                {secondaryLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="mt-2">{secondaryText}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}