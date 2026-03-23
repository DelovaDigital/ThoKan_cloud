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
    <div className="page-shell">
      <div className="content-wrap py-4 sm:py-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(340px,460px)]">
          <section className="section-block">
            <div className="border-b border-border pb-4">
              <p className="text-xs uppercase tracking-[0.16em] opacity-60">{badge}</p>
              <img src="/Logo_tekst_CV.png" alt="ThoKan Cloud" className="mt-3 h-10 w-auto sm:h-12" />
              <h1 className="mt-4 text-2xl font-semibold leading-tight sm:text-3xl">{title}</h1>
              <p className="mt-2 text-sm opacity-70 sm:text-base">{description}</p>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {features.map((feature) => (
                <div key={feature.title} className="border border-border p-3">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 text-accent">{feature.icon}</div>
                    <div>
                      <p className="text-sm font-medium">{feature.title}</p>
                      <p className="mt-1 text-xs opacity-70">{feature.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="section-block">
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-border pb-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] opacity-60">{eyebrow}</p>
                <h2 className="mt-1 text-xl font-semibold sm:text-2xl">{formTitle}</h2>
                <p className="mt-1 text-sm opacity-70">{formDescription}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-[0.14em] opacity-55">{asideLabel}</p>
                <p className="text-sm font-medium">{asideValue}</p>
              </div>
            </div>

            {children}

            <div className="mt-5 border-t border-border pt-3 text-sm opacity-80">
              <Link href={secondaryHref} className="inline-flex items-center gap-2 font-medium text-accent hover:underline">
                {secondaryLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="mt-1.5 opacity-70">{secondaryText}</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}