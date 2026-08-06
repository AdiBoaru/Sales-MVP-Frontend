import React, { useState } from "react";
import {
  Star, ShoppingCart, Heart, ChevronRight, Package, Sparkles,
  Truck, Tag, Percent, ShieldCheck, Clock, Gift, Info,
} from "lucide-react";
import { addToCart } from "@/lib/cart";
import { useWished, toggleWish, keyOfProduct } from "@/lib/wishlist";
import { formatCurrency } from "@/utils";
import RichText from "@/components/store/RichText";

// ─────────────────────────────────────────────────────────────────────────────
// Chat product card — the izi layout: one uniform card for every product in a
// reply (no hero/grid split), image on the left, solid badge pills, star row,
// big red price with raised decimals, blue cart button, then the one-line
// reason and a full-width "Spune-mi mai multe" bar.
//
// NOTHING here is domain-specific: the card renders whatever optional fields the
// backend sends and skips the rest. The bot owns the CONTENT (labels, text, which
// `tone`/`icon` to use); the frontend owns the PALETTE and the LAYOUT. Anything
// unrecognized degrades safely (unknown tone -> neutral, unknown icon -> none).
//
// Consumed shape (every field past name/price is optional):
//   { name, price, list_price?, currency?, image_url?, url?, product_id?,
//     rating?, review_count?, reason?,
//     badges?:    [{ label, tone }]            // solid pills above the name
//     highlights?:[{ text, tone, icon }]       // promo/delivery/urgency rows
//     meta?:      [{ label, value }]            // key/value lines (e.g. delivery date)
//     details?:   "markdown"                    // "Spune-mi mai multe" body
//     score?: number, why?, best?, avoid?, pros?: [string], cons?: [string]
//   }
//
// The reasoning fields (why / pros / cons / best / avoid / changes) render BELOW
// the card box as izi-style sections ("De ce ți-l recomand", "Funcționalități
// principale"…), not inside it — same as the reference.
// ─────────────────────────────────────────────────────────────────────────────

// Solid badge tones, decoupled from meaning. The bot picks a tone per label; the
// frontend maps it to colors here. Add a tone in ONE place to roll it everywhere.
const TONES = {
  neutral: "bg-[#6c7180]",
  info: "bg-[#1c7ed6]",
  success: "bg-[#0ca678]",
  warning: "bg-[#f76707]",
  danger: "bg-[#e03131]",
  promo: "bg-[#7048e8]",
};
const toneClass = (tone) => TONES[tone] || TONES.neutral;

// Soft variants for the highlight rows (delivery / voucher / urgency) — the same
// tone vocabulary, but tinted instead of solid so they don't fight the badges.
const SOFT_TONES = {
  neutral: "bg-gray-100 text-gray-700",
  info: "bg-sky-50 text-sky-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-rose-50 text-rose-700",
  promo: "bg-violet-50 text-violet-700",
};
const softToneClass = (tone) => SOFT_TONES[tone] || SOFT_TONES.neutral;

// Soft fallback for badges that arrive WITHOUT an explicit tone (legacy `badge`
// string). Keeps "Super Preț"/"Top Favorit" colored instead of flat gray. An explicit
// tone from the bot always wins; this only fills the gap.
function inferBadgeTone(label) {
  const b = String(label).toLowerCase();
  if (/(preț|pret|price|reducere|discount|sale|super|promo|-\s*\d)/.test(b)) return "danger";
  if (/(favorit|favourite|top|popular|bestseller|nou|new|recomand)/.test(b)) return "info";
  return "neutral";
}
const badgeToneClass = (tone, label) => toneClass(tone && TONES[tone] ? tone : inferBadgeTone(label));

// Small icon allowlist (lucide). The bot sends a name; unknown -> no icon.
const ICONS = { truck: Truck, tag: Tag, percent: Percent, shield: ShieldCheck, clock: Clock, gift: Gift, info: Info };

const LOCALE = "ro-RO";
// Nicer display label per currency; falls back to the ISO code for anything else.
const CURRENCY_LABEL = { RON: "Lei" };

// Price with raised decimals ("7⁸⁷ Lei"). Locale-correct via Intl.formatToParts —
// the fraction is rendered small/superscript. Falls back to flat formatting if the
// parts come back oddly (very old engines / unusual currency).
function Price({ value, currency = "RON", className = "" }) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;

  let intPart = "";
  let fracPart = "";
  let label = CURRENCY_LABEL[currency] || currency;
  try {
    const parts = new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency: currency || "RON",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).formatToParts(n);
    for (const p of parts) {
      if (p.type === "integer" || p.type === "group") intPart += p.value;
      else if (p.type === "fraction") fracPart = p.value;
      else if (p.type === "currency") label = CURRENCY_LABEL[currency] || p.value;
    }
  } catch {
    return <span className={className}>{formatCurrency(n, currency)}</span>;
  }
  if (!intPart) return <span className={className}>{formatCurrency(n, currency)}</span>;

  return (
    <span className={`inline-flex items-start whitespace-nowrap leading-none ${className}`}>
      <span className="font-extrabold">{intPart}</span>
      {fracPart && <span className="text-[0.55em] font-extrabold mt-[0.08em]">{fracPart}</span>}
      <span className="ml-1 text-[0.6em] font-bold self-end mb-[0.08em]">{label}</span>
    </span>
  );
}

// Struck original price, shown above the current one when it's a real markdown.
function ListPrice({ value, currency }) {
  return (
    <span className="text-[11px] text-[var(--aria-text-5)] line-through whitespace-nowrap">
      {Number(value).toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
      {CURRENCY_LABEL[currency] || currency}
    </span>
  );
}

function Badge({ label, tone }) {
  if (!label) return null;
  return (
    <span
      className={`text-[10px] font-bold leading-none text-white px-1.5 py-[3px] rounded-[3px] ${badgeToneClass(tone, label)}`}
    >
      {label}
    </span>
  );
}

function Highlight({ text, tone, icon }) {
  if (!text) return null;
  const Icon = icon ? ICONS[icon] : null;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${softToneClass(tone)}`}>
      {Icon && <Icon className="w-3 h-3 shrink-0" />}
      <span>{text}</span>
    </span>
  );
}

function MetaList({ items }) {
  if (!items?.length) return null;
  return (
    <dl className="space-y-0.5">
      {items.map((m, i) => (
        <div key={i} className="flex gap-1 text-[10.5px] text-[var(--aria-text-4)]">
          {m.label ? <dt className="font-medium">{m.label}:</dt> : null}
          <dd className="truncate">{m.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// Five stars with a partial fill clipped to the rating, then the numeric value —
// the izi rating row. Purely decorative: the number carries the meaning.
function Stars({ rating }) {
  const pct = Math.max(0, Math.min(100, (Number(rating) / 5) * 100));
  const row = (color) => (
    <span className={`absolute inset-y-0 left-0 flex gap-px w-16 ${color}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} className="w-3 h-3 shrink-0 fill-current" strokeWidth={0} />
      ))}
    </span>
  );
  return (
    <span className="relative inline-block w-16 h-3 shrink-0" aria-hidden="true">
      {row("text-[var(--aria-star-empty)]")}
      <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${pct}%` }}>
        {row("text-[var(--aria-star)]")}
      </span>
    </span>
  );
}

// "POTRIVIRE 9.2" pill — only when the bot sends a score. Never computed client-side.
function ScorePill({ score }) {
  if (score == null) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[rgba(124,58,237,0.08)] shrink-0">
      <span className="text-[8.5px] font-bold tracking-wide text-[var(--aria-text-3)]">POTRIVIRE</span>
      <span className="text-[11px] font-extrabold text-[var(--aria-purple)]">{score}</span>
    </span>
  );
}

// One izi answer section below the card: navy heading + whatever the caller renders.
function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="aria-heading text-[16.5px] leading-snug text-[var(--aria-text)]">{title}</h4>
      {children}
    </section>
  );
}

// "Ce s-a schimbat față de recomandarea anterioară" — the delta rows on a
// re-recommendation (cheaper alternative, etc.). `tone` colors just the delta.
const CHANGE_TONES = { good: "var(--aria-success)", warn: "var(--aria-warning)" };
function ChangesBlock({ changes }) {
  if (!changes?.length) return null;
  return (
    <Section title="Ce s-a schimbat față de recomandarea anterioară">
      <div className="flex flex-col gap-1.5">
        {changes.map((c, i) => (
          <div key={i} className="flex items-baseline gap-2">
            <span className="shrink-0 text-[12px] font-bold" style={{ color: CHANGE_TONES[c.tone] || "var(--aria-text-4)" }}>
              {c.delta}
            </span>
            <span className="text-[13px] text-[var(--aria-text-2)]">{c.label}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

// "Ideală pentru / Evită dacă" — renders only the sides the bot actually provided.
function IdealAvoidBlock({ best, avoid }) {
  if (!best && !avoid) return null;
  return (
    <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2">
      {best && (
        <div className="flex flex-col gap-0.5 p-2.5 bg-[var(--aria-surface-3)] border border-[var(--aria-border-2)] rounded-[10px]">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-[var(--aria-success)]">Ideală pentru</span>
          <span className="text-[12px] leading-snug text-[var(--aria-text-2)]">{best}</span>
        </div>
      )}
      {avoid && (
        <div className="flex flex-col gap-0.5 p-2.5 bg-[var(--aria-surface-3)] border border-[var(--aria-border-2)] rounded-[10px]">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-[var(--aria-warning)]">Evită dacă</span>
          <span className="text-[12px] leading-snug text-[var(--aria-text-2)]">{avoid}</span>
        </div>
      )}
    </div>
  );
}

export default function ChatProductCard({ product, onAdd, onAsk }) {
  const [showDetails, setShowDetails] = useState(false);
  const wishKey = keyOfProduct(product);
  const wished = useWished(wishKey);

  const handleAdd = (e) => {
    e.preventDefault();
    e.stopPropagation();
    addToCart({
      product_id: product.product_id ?? null,
      product_name: product.name,
      price: product.price,
      currency: product.currency,
      image_url: product.image_url,
      url: product.url,
    });
    onAdd?.();
  };

  // Optional discount: strike the original price, show the saved percentage as a badge.
  const hasDiscount = product.list_price != null && product.list_price > product.price;
  const discountPct = hasDiscount
    ? Math.round(((product.list_price - product.price) / product.list_price) * 100)
    : 0;

  const badges = product.badges || [];
  const highlights = product.highlights || [];
  const meta = product.meta || [];
  const pros = product.pros || [];
  const cons = product.cons || [];

  // Image + name link to the product page (new tab keeps the chat open). We don't
  // wrap the whole card so the buttons stay valid, isolated targets.
  const linkProps = product.url
    ? { href: product.url, target: "_blank", rel: "noopener noreferrer", title: `Vezi ${product.name}` }
    : null;

  const nameEl = linkProps ? (
    <a {...linkProps} className="block">
      <p className="text-[12.5px] font-bold leading-[1.35] line-clamp-3 text-[var(--aria-title)] hover:underline">
        {product.name}
      </p>
    </a>
  ) : (
    <p className="text-[12.5px] font-bold leading-[1.35] line-clamp-3 text-[var(--aria-title)]">{product.name}</p>
  );

  // The bottom bar either expands the bot's own `details` markdown in place, or —
  // when there is none — asks Aria for more about this product. With neither
  // available it isn't rendered at all, so it's never a dead control.
  const canExpand = Boolean(product.details);
  const canAsk = !canExpand && Boolean(onAsk);
  const moreBar = (canExpand || canAsk) && (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (canExpand) setShowDetails((s) => !s);
        else onAsk?.(`Spune-mi mai multe despre ${product.name}`);
      }}
      aria-expanded={canExpand ? showDetails : undefined}
      className="flex items-center gap-2 w-full px-3.5 py-3 border-t border-[var(--aria-border-2)] bg-[linear-gradient(90deg,#f6effe,#fdf0f7)] hover:brightness-[0.98] transition-[filter]"
    >
      <Sparkles className="w-4 h-4 shrink-0 text-[var(--aria-purple)]" />
      <span className="flex-1 text-left text-[13px] font-semibold text-[var(--aria-purple)]">Spune-mi mai multe</span>
      {/* Always the reference's "›". When the bar expands in place it rotates a
          quarter turn, so it reads as a disclosure rather than a dead arrow. */}
      <ChevronRight
        className={`w-4 h-4 shrink-0 text-[var(--aria-text-5)] transition-transform ${
          canExpand && showDetails ? "rotate-90" : ""
        }`}
      />
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* ── The card box ── */}
      <div className="bg-white border border-[var(--aria-border)] rounded-[12px] overflow-hidden shadow-[0_1px_3px_rgba(22,33,62,0.06)]">
        <div className="flex gap-3 p-3">
          {linkProps ? (
            <a {...linkProps} className="shrink-0">
              <CardImage product={product} />
            </a>
          ) : (
            <CardImage product={product} />
          )}

          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            {/* Badges + save heart share the top line, so a long badge row never
                pushes the heart off the card. */}
            <div className="flex items-start gap-2">
              <div className="flex-1 flex flex-wrap items-center gap-1">
                {badges.map((b, i) => (
                  <Badge key={i} label={b.label} tone={b.tone} />
                ))}
                {discountPct > 0 && <Badge label={`-${discountPct}%`} tone="warning" />}
              </div>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleWish(product);
                }}
                title={wished ? "Scoate de la favorite" : "Adaugă la favorite"}
                className="shrink-0 -mt-0.5 -mr-0.5 p-0.5 text-[var(--aria-text-5)] hover:text-[var(--aria-purple)] transition-colors"
              >
                <Heart className={`w-[18px] h-[18px] ${wished ? "fill-current text-[var(--aria-purple)]" : ""}`} />
              </button>
            </div>

            {product.brand && (
              <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--aria-text-5)]">
                {product.brand}
              </span>
            )}
            {nameEl}

            {product.rating != null && (
              <div className="flex items-center gap-1.5">
                <Stars rating={product.rating} />
                <span className="text-[11px] font-semibold text-[var(--aria-text)]">{product.rating}</span>
                {product.review_count > 0 && (
                  <span className="text-[11px] text-[var(--aria-text-5)]">
                    ({product.review_count.toLocaleString(LOCALE)})
                  </span>
                )}
              </div>
            )}

            {highlights.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {highlights.map((h, i) => (
                  <Highlight key={i} text={h.text} tone={h.tone} icon={h.icon} />
                ))}
              </div>
            )}

            {/* Price block and the cart button sit on the card's baseline. */}
            <div className="mt-auto pt-1 flex items-end justify-between gap-2">
              <div className="min-w-0 flex flex-col gap-0.5">
                {hasDiscount && <ListPrice value={product.list_price} currency={product.currency} />}
                <div className="flex items-center gap-2 flex-wrap">
                  <Price value={product.price} currency={product.currency} className="text-[21px] text-[var(--aria-price)]" />
                  <ScorePill score={product.score} />
                </div>
              </div>
              <button
                onClick={handleAdd}
                title="Adaugă în coș"
                className="shrink-0 w-11 h-9 rounded-[9px] bg-[var(--aria-cart)] hover:bg-[var(--aria-cart-hover)] text-white flex items-center justify-center transition-colors"
              >
                <ShoppingCart className="w-[18px] h-[18px]" />
              </button>
            </div>

            <MetaList items={meta} />
          </div>
        </div>

        {/* One-line "why it fits", separated from the product data above it. */}
        {product.reason && (
          <p className="px-3.5 py-2.5 border-t border-[var(--aria-border-2)] text-[12px] leading-snug text-[var(--aria-text-2)]">
            {product.reason}
          </p>
        )}

        {moreBar}

        {canExpand && showDetails && (
          <div className="px-3.5 py-3 border-t border-[var(--aria-border-2)]">
            <RichText text={product.details} variant="reply" />
          </div>
        )}
      </div>

      {/* ── izi answer sections, below the card box ── */}
      {product.why && (
        <Section title="De ce ți-l recomand">
          <p className="text-[13.5px] leading-[1.65] text-[var(--aria-text-2)]">
            <RichText text={product.why} />
          </p>
        </Section>
      )}

      {pros.length > 0 && (
        <Section title="Funcționalități principale">
          <RichText text={pros.map((p) => `- ${p}`).join("\n")} variant="reply" />
        </Section>
      )}

      {cons.length > 0 && (
        <Section title="De luat în calcul">
          <ul className="flex flex-col gap-1.5">
            {cons.map((c, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-snug text-[var(--aria-text-2)]">
                <span className="shrink-0 font-bold text-[var(--aria-warning)]">–</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <IdealAvoidBlock best={product.best} avoid={product.avoid} />
      <ChangesBlock changes={product.changes} />
    </div>
  );
}

// Product image — a square slot on the left of the card. `object-contain` on white
// so packshots read the way they do on the shop. Muted icon when there's no image.
function CardImage({ product }) {
  return (
    <div className="w-[86px] h-[86px] rounded-[8px] bg-white overflow-hidden flex items-center justify-center">
      {product.image_url ? (
        <img src={product.image_url} alt={product.name} className="w-full h-full object-contain" loading="lazy" />
      ) : (
        <Package className="w-7 h-7 text-[var(--aria-text-5)]" />
      )}
    </div>
  );
}
