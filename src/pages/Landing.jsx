import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { BRAND } from "@/lib/brand";

// Numbered rather than icon-tiled: three glyphs in rounded squares is the house
// style of every generated landing page, and a numbered list is what an actual
// "how this demo works" page uses.
const pasi = [
  {
    titlu: "Deschide catalogul",
    text: "Un magazin de test cu produse reale de cosmetice, organizate pe categorii.",
  },
  {
    titlu: "Caută sau filtrează",
    text: "Alege o categorie din stânga, caută după nume sau pornește de la o nevoie concretă.",
  },
  {
    titlu: `Întreabă-o pe ${BRAND.assistant}`,
    text: "Scrie-i cum i-ai scrie unei consultante din magazin. Îți recomandă, compară și adaugă în coș.",
  },
];

const intrebari = [
  "Caut un cadou sub 150 de lei.",
  "Ce produs mi se potrivește pentru ten uscat?",
  "Compară două creme și recomandă-mi una.",
  "Adaugă în coș ce mi-ai recomandat.",
];

const puncte = [
  "Fără cont și fără configurare",
  "Catalog și prețuri reale",
  "Comandă dusă până la final",
];

export default function Landing() {
  return (
    <main className="aria-lux is-light min-h-screen bg-[var(--color-void)]">
      <section className="px-4 pt-16 pb-12 md:pt-24 md:pb-16">
        <div className="mx-auto max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-ink-mute)]">
            Mediu de test — {BRAND.name}
          </p>

          <h1 className="mt-5 font-heading text-3xl font-bold leading-tight tracking-tight text-[var(--color-ink)] md:text-5xl">
            Magazinul demo pe care l-ai primit la înscriere
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--color-ink-soft)]">
            Poți parcurge catalogul, discuta cu asistentul și duce o comandă până la
            final. Nimic nu se facturează și nu ai nevoie de cont — datele introduse
            rămân în sesiunea ta.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              to="/store"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-7 py-3 text-[15px] font-semibold text-[var(--color-on-accent)] transition-colors hover:bg-[var(--color-accent-hover)]"
            >
              Intră în magazin <ArrowRight className="h-4 w-4" />
            </Link>
            <span className="text-sm text-[var(--color-ink-mute)]">
              Durează 2–3 minute
            </span>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-1.5">
            {puncte.map((p) => (
              <li key={p} className="text-sm text-[var(--color-ink-faint)]">
                {p}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-[var(--color-hair)] px-4 py-12 md:py-16">
        <div className="mx-auto max-w-3xl">
          <h2 className="font-heading text-xl font-bold text-[var(--color-ink)]">
            Cum parcurgi demo-ul
          </h2>
          <ol className="mt-7 space-y-7">
            {pasi.map((pas, i) => (
              <li key={pas.titlu} className="flex gap-5">
                <span className="w-6 flex-shrink-0 font-heading text-lg font-bold tabular-nums text-[var(--color-accent-ink)]">
                  {i + 1}.
                </span>
                <div>
                  <h3 className="font-heading text-base font-semibold text-[var(--color-ink)]">
                    {pas.titlu}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--color-ink-soft)]">
                    {pas.text}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t border-[var(--color-hair)] px-4 py-12 md:py-16">
        <div className="mx-auto max-w-3xl">
          <h2 className="font-heading text-xl font-bold text-[var(--color-ink)]">
            Idei de întrebări
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-soft)]">
            Cel mai bine se vede pe o nevoie concretă. Câteva începuturi de conversație:
          </p>
          <ul className="mt-6 space-y-3">
            {intrebari.map((intrebare) => (
              <li
                key={intrebare}
                className="border-l-2 border-[var(--color-hair)] pl-4 text-sm italic text-[var(--color-ink)]"
              >
                „{intrebare}”
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="border-t border-[var(--color-hair)] px-4 py-8">
        <div className="mx-auto max-w-3xl text-xs text-[var(--color-ink-faint)]">
          {BRAND.name} — {BRAND.tagline}. Mediu de demonstrație; comenzile nu se
          procesează.
        </div>
      </footer>
    </main>
  );
}
