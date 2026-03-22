import Link from "next/link";
import { ArrowRight, Boxes, Mail, ShieldCheck, ShoppingBag, Sparkles } from "lucide-react";

const modules = [
  {
    title: "Files workspace",
    description: "Beheer bestanden, previews en downloads in een vaste detailgestuurde omgeving.",
    icon: <Boxes className="h-5 w-5" />,
  },
  {
    title: "Mail en opvolging",
    description: "Inbox, verzonden berichten en antwoordflow blijven in dezelfde mailboxlaag.",
    icon: <Mail className="h-5 w-5" />,
  },
  {
    title: "Commerce cockpit",
    description: "Shopify-signalen, websitechat en fulfilment komen samen in één operationele workspace.",
    icon: <ShoppingBag className="h-5 w-5" />,
  },
  {
    title: "Control layer",
    description: "Admin, sync en systeeminstellingen zijn uitgelijnd in dezelfde shell en producttaal.",
    icon: <ShieldCheck className="h-5 w-5" />,
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-bg">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.16),_transparent_24%),radial-gradient(circle_at_78%_18%,_rgba(14,165,233,0.14),_transparent_18%),radial-gradient(circle_at_bottom_right,_rgba(249,115,22,0.12),_transparent_24%)]" />
      <div className="pointer-events-none fixed inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(148,163,184,0.35)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.35)_1px,transparent_1px)] [background-size:24px_24px]" />

      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-border/60 bg-card/35 p-5 shadow-glass backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-center gap-3">
            <img src="/Logo_tekst_CV.png" alt="ThoKan Cloud" className="h-10 w-auto sm:h-12" />
            <div className="rounded-full border border-border/70 bg-card/45 px-3 py-1 text-xs font-medium opacity-75">Control workspace</div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/login" className="rounded-2xl border border-border px-4 py-2.5 text-sm transition hover:bg-card/60">
              Inloggen
            </Link>
            <Link href="/register" className="inline-flex items-center gap-2 rounded-2xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90">
              Account aanmaken
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </header>

        <section className="mt-5 grid gap-5 overflow-hidden rounded-[2rem] border border-border/60 bg-card/35 p-6 shadow-glass lg:grid-cols-[1.12fr_0.88fr] lg:p-8 xl:p-10">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/45 px-3 py-1 text-xs font-medium opacity-80">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              Nieuwe productlaag
            </div>
            <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-tight sm:text-5xl xl:text-6xl">
              Eén ThoKan Cloud omgeving voor bestanden, mail, commerce en beheer.
            </h1>
            <p className="mt-4 max-w-2xl text-base opacity-72 sm:text-lg">
              De vernieuwde workspace brengt operationele modules samen in een vaste shell met duidelijke detailpanelen, accountcontext en snellere opvolging.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className="inline-flex items-center gap-2 rounded-2xl bg-accent px-5 py-3 text-sm font-medium text-white transition hover:opacity-90">
                Open je workspace
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/register" className="rounded-2xl border border-border px-5 py-3 text-sm transition hover:bg-card/60">
                Registreer nieuw account
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {modules.map((module) => (
              <div key={module.title} className="rounded-[1.5rem] border border-border/70 bg-card/45 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                    {module.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{module.title}</p>
                    <p className="mt-1 text-xs opacity-60">{module.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5 grid gap-4 lg:grid-cols-3">
          <div className="rounded-[2rem] border border-border/60 bg-card/35 p-5 shadow-glass">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Workspace-first</p>
            <p className="mt-3 text-lg font-semibold">Vaste detailkaarten</p>
            <p className="mt-2 text-sm opacity-68">Bestanden, orders, mail en admin gebruiken dezelfde inline detailstructuur in plaats van losse modals.</p>
          </div>
          <div className="rounded-[2rem] border border-border/60 bg-card/35 p-5 shadow-glass">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Sync foundation</p>
            <p className="mt-3 text-lg font-semibold">Accountoverstijgende basis</p>
            <p className="mt-2 text-sm opacity-68">Mail, Shopify en Gelato kunnen vanuit globale configuraties als gedeelde fundering voor teams werken.</p>
          </div>
          <div className="rounded-[2rem] border border-border/60 bg-card/35 p-5 shadow-glass">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-45">Commerce ready</p>
            <p className="mt-3 text-lg font-semibold">Shopify en Gelato samen</p>
            <p className="mt-2 text-sm opacity-68">Websitechat, orderobservatie en fulfilment zijn al uitgelijnd zodat extra modules zoals reviews/forms logisch kunnen volgen.</p>
          </div>
        </section>
      </div>
    </main>
  );
}

