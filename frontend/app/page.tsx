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
    <main className="page-shell">
      <div className="content-wrap py-4 sm:py-6">
        <header className="section-block flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <img src="/Logo_tekst_CV.png" alt="ThoKan Cloud" className="h-10 w-auto sm:h-12" />
          <div className="flex flex-wrap gap-2">
            <Link href="/login" className="btn-secondary">
              Inloggen
            </Link>
            <Link href="/register" className="btn-primary">
              Account aanmaken
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </header>

        <section className="section-block mt-4">
          <p className="inline-flex items-center gap-2 text-sm text-accent">
            <Sparkles className="h-4 w-4" />
            Duidelijke werkruimte
          </p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">
            Eén plek voor bestanden, mail, commerce en beheer.
          </h1>
          <p className="mt-3 max-w-3xl text-sm opacity-75 sm:text-base">
            ThoKan Cloud bundelt alle modules in een eenvoudige interface met vaste navigatie en consistente schermopbouw.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Link href="/workspace" className="btn-primary">
              Open werkruimte
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/register" className="btn-secondary">
              Registreer account
            </Link>
          </div>
        </section>

        <section className="mt-4 grid gap-3 sm:grid-cols-2">
          {modules.map((module) => (
            <div key={module.title} className="section-block">
              <div className="flex items-start gap-3">
                <div className="text-accent">{module.icon}</div>
                <div>
                  <p className="text-sm font-semibold">{module.title}</p>
                  <p className="mt-1 text-sm opacity-70">{module.description}</p>
                </div>
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

