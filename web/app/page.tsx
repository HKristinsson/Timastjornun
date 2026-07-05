import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata = {
  title: "Verkklukka — GPS-tímaskráning fyrir verkefni",
  description:
    "Réttur tími, réttur staður. Verkklukka staðfestir tímaskráningu starfsmanna með GPS — fyrir verktaka, þrif, viðhald og allar starfsstéttir á vettvangi.",
};

function Feature({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
      <div className="mb-3 text-2xl">{icon}</div>
      <h3 className="mb-1 text-lg font-semibold text-slate-900">{title}</h3>
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
              Verkklukka skráir vinnutíma starfsmanna og staðfestir með GPS að þeir séu á
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
              lager eða úti í mörkinni — Verkklukka hentar öllum sem þurfa að skrá tíma sinn
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
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-semibold">Allt sem þú þarft</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Feature icon="📍" title="GPS-staðfesting" text="Starfsmaður getur aðeins skráð sig inn þegar hann er innan svæðis verkefnisins." />
            <Feature icon="⏱️" title="Sjálfvirk útskráning" text="Fari starfsmaður af svæðinu skráir kerfið hann sjálfkrafa út — engin gleymd útskráning." />
            <Feature icon="📊" title="Rauntíma-yfirlit" text="Sjáðu hverjir eru við vinnu, á hvaða verkefni og hvort þeir séu innan svæðis." />
            <Feature icon="📁" title="Excel-útflutningur" text="Samþykktir tímar beint í Excel fyrir launavinnslu — með einum smelli." />
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
          <p>© 2026 Reir · verkklukka.is</p>
        </div>
      </footer>
    </div>
  );
}
