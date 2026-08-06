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

const categories = [
  { name: "All products", n: 300, active: true },
  { name: "Skincare", n: 104 },
  { name: "Makeup", n: 101 },
  { name: "Hair care", n: 48 },
  { name: "Body care", n: 34 },
  { name: "Lip care", n: 7 },
  { name: "Sun protection", n: 6 },
];

const products = [
  {
    name: "Nova Botanics Calm",
    kind: "Face exfoliant",
    rating: "4.9",
    votes: 72,
    price: "77.39",
    was: "85.99",
    off: "-10%",
    wash: "linear-gradient(150deg,#e9dfd2,#cbb9a4)",
  },
  {
    name: "Iris & Co Revive",
    kind: "Face exfoliant",
    rating: "4.9",
    votes: 195,
    price: "62.49",
    wash: "linear-gradient(150deg,#d9d3cb,#a89a8c)",
  },
  {
    name: "Mira Atelier Silk",
    kind: "Toner",
    rating: "4.9",
    votes: 125,
    price: "36.99",
    wash: "linear-gradient(150deg,#dce6e8,#a9c3c8)",
  },
  {
    name: "Velvet Root Pure",
    kind: "Hand cream",
    rating: "4.9",
    votes: 220,
    price: "45.49",
    wash: "linear-gradient(150deg,#efe8dc,#d3c3a6)",
  },
];

// Second row is cropped by the card, so it needs only the washes.
const secondRow = [
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
          <span className="font-brand-serif text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-900">
            {BRAND.name}
          </span>
          {/* Written out rather than read from BRAND.tagline: the landing page is
              English while the storefront itself is still Romanian, and the brand
              string belongs to the storefront. */}
          <span className="mt-0.5 text-[4.5px] font-medium uppercase tracking-[0.2em] text-gray-400">
            Cosmetics &amp; skincare
          </span>
        </span>

        <div className="ml-2 flex flex-1 items-center gap-1 rounded-md border border-gray-200 px-2 py-1">
          <Search className="h-2 w-2 text-gray-400" />
          <span className="text-[6px] text-gray-400">Search products and categories</span>
        </div>

        <span className="flex items-center gap-1 rounded-md bg-brand-600 px-2 py-1 text-[6px] font-semibold text-white">
          <MessageCircle className="h-2 w-2" /> Advice
        </span>
        <span className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[6px] text-gray-600">
          <ShoppingCart className="h-2 w-2" /> Cart
        </span>
      </div>

      {/* title block */}
      <div className="px-3 pt-3">
        <p className="font-brand-eyebrow text-[5.5px] font-extrabold uppercase tracking-[0.2em] text-gray-400">
          {BRAND.name} catalog
        </p>
        <h3 className="mt-1 font-brand-serif text-[13px] font-semibold text-gray-900">
          All categories
        </h3>
        <p className="mt-0.5 text-[6px] leading-relaxed text-gray-500">
          Pick a category on the left, search, or ask {BRAND.assistant}. Add to the cart and
          finish the order in a few steps.
        </p>
      </div>

      {/* catalogue */}
      {/* the bottom row is deliberately cut off by the card — a catalogue that
          continues past the frame reads as a real page, a tidy last row does not */}
      <div className="mt-2.5 flex gap-2.5 px-3 pb-0">
        <ul className="w-[27%] shrink-0 space-y-[3px]">
          {categories.map((c) => (
            <li
              key={c.name}
              className={`flex items-center justify-between rounded px-1.5 py-1 text-[6px] ${
                c.active ? "bg-brand-600 text-white" : "text-gray-600"
              }`}
            >
              <span className="truncate">{c.name}</span>
              <span className={c.active ? "text-white/80" : "text-gray-400"}>{c.n}</span>
            </li>
          ))}
        </ul>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span className="text-[6px] text-gray-500">300 products</span>
            <span className="flex items-center gap-1 text-[6px] text-gray-500">
              Sort by
              <span className="rounded border border-gray-200 px-1.5 py-0.5">Recommended</span>
            </span>
          </div>

          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {products.map((p) => (
              <div key={p.name} className="overflow-hidden">
                <div
                  className="relative aspect-square rounded"
                  style={{ background: p.wash }}
                >
                  {p.off && (
                    <span className="absolute left-1 top-1 rounded bg-brand-600 px-1 py-[1px] text-[5px] font-bold text-white">
                      {p.off}
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-[6px] font-semibold text-gray-900">{p.name}</p>
                <p className="truncate text-[5.5px] text-gray-500">{p.kind}</p>
                <p className="mt-0.5 text-[5.5px] text-amber-500">
                  ★ <span className="font-semibold text-gray-700">{p.rating}</span>{" "}
                  <span className="text-gray-400">({p.votes})</span>
                </p>
                <div className="mt-0.5 flex items-end justify-between gap-1">
                  <span className="flex flex-col leading-tight">
                    <span className="text-[7px] font-bold text-gray-900">{p.price} RON</span>
                    {/* the struck-through line is always rendered so all four cards
                        keep the same height whether or not they are on promo */}
                    <span className="h-[7px] text-[5px] text-gray-400 line-through">
                      {p.was ? `${p.was} RON` : ""}
                    </span>
                  </span>
                  <span className="mb-[5px] rounded bg-brand-600 px-1 py-[1px] text-[5px] font-semibold text-white">
                    + Add
                  </span>
                </div>
              </div>
            ))}

            {secondRow.map((wash, i) => (
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
