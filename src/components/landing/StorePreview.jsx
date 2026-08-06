import React from "react";
import { MessageCircle, Search, ShoppingCart, Sparkles } from "lucide-react";
import { BRAND } from "@/lib/brand";

/**
 * Static, non-interactive miniature of the storefront, shown next to the hero
 * copy. It is a drawing of the shop — not a live render and not a screenshot:
 * a screenshot goes stale on every catalogue change, and mounting the real
 * Store here would fetch products just to be decoration.
 *
 * Product imagery is deliberately abstract (soft washes rather than photos) so
 * nothing in the preview can be mistaken for a real listing.
 */

const categorii = [
  { nume: "Toate produsele", n: 300, activ: true },
  { nume: "Îngrijirea tenului", n: 104 },
  { nume: "Machiaj", n: 101 },
  { nume: "Îngrijirea părului", n: 48 },
  { nume: "Îngrijire corp", n: 34 },
  { nume: "Îngrijirea buzelor", n: 7 },
  { nume: "Protecție solară", n: 6 },
];

const produse = [
  {
    nume: "Nova Botanics Calm",
    tip: "Exfoliant pentru ten",
    nota: "4,9",
    voturi: 72,
    pret: "77,39",
    vechi: "85,99",
    reducere: "-10%",
    wash: "linear-gradient(150deg,#e9dfd2,#cbb9a4)",
  },
  {
    nume: "Iris & Co Revive",
    tip: "Exfoliant pentru ten",
    nota: "4,9",
    voturi: 195,
    pret: "62,49",
    wash: "linear-gradient(150deg,#d9d3cb,#a89a8c)",
  },
  {
    nume: "Mira Atelier Silk",
    tip: "Loțiune tonică",
    nota: "4,9",
    voturi: 125,
    pret: "36,99",
    wash: "linear-gradient(150deg,#dce6e8,#a9c3c8)",
  },
  {
    nume: "Velvet Root Pure",
    tip: "Cremă de mâini",
    nota: "4,9",
    voturi: 220,
    pret: "45,49",
    wash: "linear-gradient(150deg,#efe8dc,#d3c3a6)",
  },
];

// Second row is cropped by the card, so it needs only the washes.
const randDoi = [
  "linear-gradient(150deg,#efe4d8,#d8c4b0)",
  "linear-gradient(150deg,#dbe7ee,#b3ccdc)",
  "linear-gradient(150deg,#dfe2d6,#b0b79f)",
  "linear-gradient(150deg,#e7dcd2,#c7ad95)",
];

export default function StorePreview() {
  return (
    <div
      aria-hidden="true"
      className="relative select-none overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-[0_24px_60px_-24px_rgba(28,28,26,0.28)]"
    >
      {/* header */}
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2.5">
        <span className="flex flex-col leading-none">
          <span className="font-display text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-900">
            {BRAND.name}
          </span>
          <span className="mt-0.5 text-[4.5px] font-medium uppercase tracking-[0.2em] text-gray-400">
            {BRAND.tagline}
          </span>
        </span>

        <div className="ml-2 flex flex-1 items-center gap-1 rounded-md border border-gray-200 px-2 py-1">
          <Search className="h-2 w-2 text-gray-400" />
          <span className="text-[6px] text-gray-400">Caută produse și categorii</span>
        </div>

        <span className="flex items-center gap-1 rounded-md bg-brand-600 px-2 py-1 text-[6px] font-semibold text-white">
          <MessageCircle className="h-2 w-2" /> Consultanță
        </span>
        <span className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[6px] text-gray-600">
          <ShoppingCart className="h-2 w-2" /> Coș
        </span>
      </div>

      {/* title block */}
      <div className="px-3 pt-3">
        <p className="text-[5.5px] font-semibold uppercase tracking-[0.2em] text-gray-400">
          Catalogul {BRAND.name}
        </p>
        <h3 className="mt-1 font-display text-[13px] font-semibold text-gray-900">
          Toate categoriile
        </h3>
        <p className="mt-0.5 text-[6px] leading-relaxed text-gray-500">
          Alege o categorie din stânga, caută sau întreab-o pe {BRAND.assistant}. Adaugă în
          coș și finalizează comanda în câțiva pași.
        </p>
      </div>

      {/* catalogue */}
      {/* the bottom row is deliberately cut off by the card — a catalogue that
          continues past the frame reads as a real page, a tidy last row does not */}
      <div className="mt-2.5 flex gap-2.5 px-3 pb-0">
        <ul className="w-[27%] shrink-0 space-y-[3px]">
          {categorii.map((c) => (
            <li
              key={c.nume}
              className={`flex items-center justify-between rounded px-1.5 py-1 text-[6px] ${
                c.activ ? "bg-brand-600 text-white" : "text-gray-600"
              }`}
            >
              <span className="truncate">{c.nume}</span>
              <span className={c.activ ? "text-white/80" : "text-gray-400"}>{c.n}</span>
            </li>
          ))}
        </ul>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span className="text-[6px] text-gray-500">300 produse</span>
            <span className="flex items-center gap-1 text-[6px] text-gray-500">
              Sortează
              <span className="rounded border border-gray-200 px-1.5 py-0.5">Recomandate</span>
            </span>
          </div>

          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {produse.map((p) => (
              <div key={p.nume} className="overflow-hidden">
                <div
                  className="relative aspect-square rounded"
                  style={{ background: p.wash }}
                >
                  {p.reducere && (
                    <span className="absolute left-1 top-1 rounded bg-brand-600 px-1 py-[1px] text-[5px] font-bold text-white">
                      {p.reducere}
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-[6px] font-semibold text-gray-900">{p.nume}</p>
                <p className="truncate text-[5.5px] text-gray-500">{p.tip}</p>
                <p className="mt-0.5 text-[5.5px] text-amber-500">
                  ★ <span className="font-semibold text-gray-700">{p.nota}</span>{" "}
                  <span className="text-gray-400">({p.voturi})</span>
                </p>
                <div className="mt-0.5 flex items-end justify-between gap-1">
                  <span className="flex flex-col leading-tight">
                    <span className="text-[7px] font-bold text-gray-900">{p.pret} RON</span>
                    {/* the struck-through line is always rendered so all four cards
                        keep the same height whether or not they are on promo */}
                    <span className="h-[7px] text-[5px] text-gray-400 line-through">
                      {p.vechi ? `${p.vechi} RON` : ""}
                    </span>
                  </span>
                  <span className="mb-[5px] rounded bg-brand-600 px-1 py-[1px] text-[5px] font-semibold text-white">
                    + Adaugă
                  </span>
                </div>
              </div>
            ))}

            {randDoi.map((wash, i) => (
              <div
                key={i}
                className="relative h-14 rounded-t"
                style={{ background: wash }}
              >
                {i === 3 && (
                  <span className="absolute left-1 top-1 rounded bg-brand-600 px-1 py-[1px] text-[5px] font-bold text-white">
                    -30%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* the chat launcher the annotation points at */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1.5 text-[8px] font-semibold text-white shadow-lg ring-4 ring-[#f3e6d0]">
        <Sparkles className="h-2.5 w-2.5" />
        {BRAND.assistant}
      </div>
    </div>
  );
}
