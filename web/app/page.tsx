import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata = {
  title: "Tímaverk — GPS-tímaskráning fyrir verkefni",
  description:
    "Réttur tími, réttur staður. Tímaverk staðfestir tímaskráningu starfsmanna með GPS — fyrir verktaka, þrif, viðhald og allar starfsstéttir á vettvangi.",
};

const iconProps = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const IconPin = () => (
  <svg {...iconProps}>
    <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);
const IconTimer = () => (
  <svg {...iconProps}>
    <path d="M10 2h4" />
    <path d="M12 14V9" />
    <circle cx="12" cy="14" r="8" />
    <path d="m19 7 1.4-1.4" />
  </svg>
);
const IconActivity = () => (
  <svg {...iconProps}>
    <path d="M3 12h4l2.5 7 5-16 2.5 9H21" />
  </svg>
);
const IconExport = () => (
  <svg {...iconProps}>
    <path d="M12 3v12" />
    <path d="m7 12 5 5 5-5" />
    <path d="M5 21h14" />
  </svg>
);

function Feature({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="group rounded-2xl border border-slate-100 bg-white p-7 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-blue-100 hover:shadow-lg">
      <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-brand transition duration-200 group-hover:bg-brand group-hover:text-white">
        {icon}
      </div>
      <h3 className="mb-2 text-lg font-semibold text-slate-900">{title}</h3>
      <p className="text-sm leading-relaxed text-slate-600">{text}</p>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="bg-white text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Logo />
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-brand">
              Innskrá
            </Link>
            <Link
              href="/login"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
            >
              Prófa frítt
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section
        className="relative flex min-h-[560px] items-center"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(15,23,42,0.85) 0%, rgba(15,23,42,0.55) 45%, rgba(15,23,42,0.15) 100%), url('/marketing/hero-construction.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="max-w-xl">
            <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/25">
              GPS-staðfest tímaskráning
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-tight text-white sm:text-5xl">
              Réttur tími.<br />Réttur staður.
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-slate-200">
              Tímaverk skráir vinnutíma starfsmanna og staðfestir með GPS að þeir séu á
              réttum vinnustað — sjálfkrafa, án pappírs og ágiskana.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="rounded-xl bg-brand px-6 py-3 font-medium text-white hover:bg-brand-dark"
              >
                Prófa frítt
              </Link>
              <a
                href="#hvernig"
                className="rounded-xl bg-white/10 px-6 py-3 font-medium text-white ring-1 ring-white/30 hover:bg-white/20"
              >
                Sjá hvernig það virkar
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Fyrir allar starfsstéttir */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold">Fyrir allar starfsstéttir á vettvangi</h2>
            <p className="mt-4 text-slate-600">
              Hvort sem þínir starfsmenn vinna á byggingarsvæði, við þrif, í garðyrkju, á
              lager eða úti í mörkinni — Tímaverk hentar öllum sem þurfa að skrá tíma sinn
              og staðsetningu.
            </p>
            <ul className="mt-6 space-y-2 text-slate-700">
              <li>✅ Verktakar og byggingafyrirtæki</li>
              <li>✅ Þrif, viðhald og garðyrkja</li>
              <li>✅ Lager, flutningar og þjónusta á vettvangi</li>
            </ul>
          </div>
          <img
            src="/marketing/workers-grid.jpg"
            alt="Ólíkar starfsstéttir að skrá tíma sinn"
            className="w-full rounded-2xl shadow-sm ring-1 ring-slate-100"
          />
        </div>
      </section>

      {/* Eiginleikar */}
      <section className="bg-gradient-to-b from-slate-50 to-white py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand">
              Eiginleikar
            </p>
            <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">Allt sem þú þarft</h2>
            <p className="mt-4 text-slate-600">
              Frá innskráningu á vettvangi til launavinnslu — Tímaverk sér um alla keðjuna.
            </p>
          </div>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Feature
              icon={<IconPin />}
              title="GPS-staðfesting"
              text="Starfsmaður getur aðeins skráð sig inn þegar hann er innan svæðis verkefnisins."
            />
            <Feature
              icon={<IconTimer />}
              title="Sjálfvirk útskráning"
              text="Fari starfsmaður af svæðinu skráir kerfið hann sjálfkrafa út — engin gleymd útskráning."
            />
            <Feature
              icon={<IconActivity />}
              title="Rauntíma-yfirlit"
              text="Sjáðu hverjir eru við vinnu, á hvaða verkefni og hvort þeir séu innan svæðis."
            />
            <Feature
              icon={<IconExport />}
              title="Excel-útflutningur"
              text="Samþykktir tímar beint í Excel fyrir launavinnslu — með einum smelli."
            />
          </div>
        </div>
      </section>

      {/* Hvernig það virkar */}
      <section id="hvernig" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-semibold">Þrjú skref</h2>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {[
            ["1", "Veldu verkefni", "Starfsmaður opnar appið og velur verkefnið sem hann er að vinna á."],
            ["2", "Skráðu inn á staðnum", "Appið staðfestir með GPS að hann sé innan svæðis og skráir inn-tímann."],
            ["3", "Kerfið sér um afganginn", "Fylgist með staðsetningu, skráir út, og sendir tímana til samþykktar."],
          ].map(([n, t, d]) => (
            <div key={n} className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand text-lg font-semibold text-white">
                {n}
              </div>
              <h3 className="mt-4 text-lg font-semibold">{t}</h3>
              <p className="mt-2 text-sm text-slate-600">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand py-16">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-semibold text-white">Tilbúin/n að einfalda tímaskráninguna?</h2>
          <p className="mt-3 text-blue-100">Prófaðu Verkklukku í dag — engin skuldbinding.</p>
          <Link
            href="/login"
            className="mt-8 inline-block rounded-xl bg-white px-8 py-3 font-medium text-brand hover:bg-blue-50"
          >
            Byrja núna
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 bg-white py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-slate-500 sm:flex-row">
          <Logo />
          <p>© 2026 Reir · timaverk.is</p>
        </div>
      </footer>
    </div>
  );
}
