"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { motion, type Variants } from "framer-motion";
import { ArrowRight, Shield, Zap, Lock, Cloud } from "lucide-react";

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

const containerVariants: Variants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const itemVariants: Variants = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
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
    <div className="min-h-screen bg-bg">
      <div className="flex min-h-screen">
        {/* ─── Left panel (brand) ──────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="relative hidden w-[480px] shrink-0 flex-col justify-between overflow-hidden bg-card p-10 lg:flex border-r border-border"
        >
          {/* Subtle background decoration */}
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-accent/5" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-accent/5" />

          {/* Logo */}
          <div className="relative">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-bg px-3 py-1 text-xs font-medium text-muted">
              <div className="h-1.5 w-1.5 rounded-full bg-success" />
              {badge}
            </div>
            <div className="mt-4">
              <img src="/Logo_tekst_CV.png" alt="ThoKan Cloud" className="h-9 w-auto" />
            </div>
          </div>

          {/* Main copy */}
          <div className="relative space-y-4">
            <h1 className="text-3xl font-semibold leading-tight tracking-tight">{title}</h1>
            <p className="text-base leading-relaxed text-muted">{description}</p>

            {/* Feature list */}
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="mt-6 space-y-3"
            >
              {features.map((feature) => (
                <motion.div
                  key={feature.title}
                  variants={itemVariants}
                  className="flex items-start gap-3 rounded-xl border border-border bg-bg p-3.5"
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    {feature.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{feature.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{feature.description}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* Footer info */}
          <div className="relative">
            <div className="flex items-center gap-2 text-xs text-muted">
              <Shield className="h-3.5 w-3.5" />
              <span>End-to-end versleuteld · Self-hosted · {asideLabel}: {asideValue}</span>
            </div>
          </div>
        </motion.div>

        {/* ─── Right panel (form) ──────────────────────────────── */}
        <div className="flex flex-1 items-center justify-center p-6 sm:p-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut", delay: 0.05 }}
            className="w-full max-w-md"
          >
            {/* Mobile logo (only shown on small screens) */}
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <img src="/Logo_tekst_CV.png" alt="ThoKan Cloud" className="h-7 w-auto" />
            </div>

            <div className="mb-8">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-widest text-muted">{eyebrow}</p>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{formTitle}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{formDescription}</p>
            </div>

            <div className="space-y-4">
              {children}
            </div>

            <div className="mt-6 border-t border-border pt-5">
              <Link
                href={secondaryHref}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-accent transition-colors hover:text-accent/80"
              >
                {secondaryLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="mt-1 text-xs text-muted">{secondaryText}</p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

