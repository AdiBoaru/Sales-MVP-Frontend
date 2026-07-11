import React, { useState } from "react";
import {
  Star, ShoppingCart, Heart, ChevronDown, Package,
  Truck, Tag, Percent, ShieldCheck, Clock, Gift, Info,
} from "lucide-react";
import { addToCart } from "@/lib/cart";
import { useWished, toggleWish, keyOfProduct } from "@/lib/wishlist";
import { formatCurrency } from "@/utils";
import RichText from "@/components/store/RichText";

// ─────────────────────────────────────────────────────────────────────────────
// Generic visual layer for a chat product card.
//
// NOTHING here is domain-specific: the card renders whatever optional fields the
// backend sends and skips the rest. The bot owns the CONTENT (labels, text, which
// `tone`/`icon` to use); the frontend owns the PALETTE and the LAYOUT. Anything
// unrecognized degrades safely (unknown tone -> neutral, unknown icon -> none).
//
// Consumed shape (every field past name/price is optional):
//   { name, price, list_price?, currency?, image_url?, url?, product_id?,
//     rating?, review_count?, reason?,
//     badges?:    [{ label, tone }]            // pills at the top
//     highlights?:[{ text, tone, icon }]       // promo/delivery/urgency rows
//     meta?:      [{ label, value }]            // key/value lines (e.g. delivery date)
//     details?:   "markdown"                    // "Spune-mi mai multe" body
//     score?: number, why?, best?, avoid?, pros?: [string], cons?: [string]
//   }
//
// `variant` picks the layout — chosen by the caller (ChatMessage), never by the
// card itself:
//   "compact" (default) — small horizontal card; upgrades to the old full
//                          vertical layout automatically once `highlights` arrive.
//   "hero"    — the primary recommendation in a multi-product reply: adds the
//               AI-score pill, "why I chose this", ideal-for/avoid and an
//               expandable pros/cons block — every one of them only if the bot
//               actually sent the field.
//   "grid"    — compact tile for the secondary products, laid out 2-up.
// ─────────────────────────────────────────────────────────────────────────────

// Visual tones, decoupled from meaning. The bot picks a tone per label; the
// frontend maps it to colors here. Add a tone in ONE place to roll it everywhere.
const TONES = {
  neutral: "bg-gray-100 text-gray-700",
  info: "bg-sky-100 text-sky-700",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-rose-100 text-rose-700",
  promo: "bg-violet-100 text-violet-700",
};
const toneClass = (tone) => TONES[tone] || TONES.neutral;

// Soft fallback for badges that arrive WITHOUT an explicit tone (legacy `badge`
// string). Keeps "Super Preț"/"Top Favorit" colored instead of flat gray. An explicit
// tone from the bot always wins; this only fills the gap.
function inferBadgeTone(label) {
  const b = String(label).toLowerCase();
  if (/(preț|pret|price|reducere|discount|sale|super|promo|-\s*\d)/.test(b)) return "success";
  if (/(favorit|favourite|top|popular|bestseller|nou|new|recomand)/.test(b)) return "warning";
  return "neutral";
}
const badgeToneClass = (tone, label) => toneClass(tone && TONES[tone] ? tone : inferBadgeTone(label));

// Small icon allowlist (lucide). The bot sends a name; unknown -> no icon.
const ICONS = { truck: Truck, tag: Tag, percent: Percent, shield: ShieldCheck, clock: Clock, gift: Gift, info: Info };

const LOCALE = "ro-RO";
// Nicer display label per currency; falls back to the ISO code for anything else.
const CURRENCY_LABEL = { RON: "Lei" };

// Price with raised decimals ("82⁵⁰ Lei"). Locale-correct via Intl.formatToParts —
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
      {fracPart && <span className="text-[0.62em] font-bold mt-[0.1em]">{fracPart}</span>}
      <span className="ml-1 text-[0.7em] font-semibold self-center">{label}</span>
    </span>
  );
}

function Badge({ label, tone }) {
  if (!label) return null;
  return (
    <span className={`text-[10px] font-bold leading-none px-1.5 py-1 rounded ${badgeToneClass(tone, label)}`}>
      {label}
    </span>
  );
}

function Highlight({ text, tone, icon }) {
  if (!text) return null;
  const Icon = icon ? ICONS[icon] : null;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${toneClass(tone)}`}>
      {Icon && <Icon className="w-3 h-3 shrink-0" />}
      <span>{text}</span>
    </span>
  );
}

function MetaList({ items }) {
  if (!items?.length) return null;
  return (
    <dl className="mt-1.5 space-y-0.5">
      {items.map((m, i) => (
        <div key={i} className="flex gap-1 text-[10px] text-[var(--aria-text-4)]">
          {m.label ? <dt className="font-medium">{m.label}:</dt> : null}
          <dd className="truncate">{m.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// "AI 9.2" pill — only when the bot sends a score. Never computed client-side.
function ScorePill({ score }) {
  if (score == null) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[rgba(56,189,248,0.1)] border border-[rgba(2,132,199,0.25)] shrink-0">
      <span className="text-[8.5px] font-bold tracking-wide text-[var(--aria-text-3)]">SCOR AI</span>
      <span className="text-xs font-extrabold text-[var(--aria-blue)]">{score}</span>
    </span>
  );
}

// "De ce am ales-o pentru tine" — the longer reasoning block (separate from the
// one-line `reason` shown next to the name). Hidden unless the bot sends `why`.
function WhyBlock({ why }) {
  if (!why) return null;
  return (
    <div className="flex flex-col gap-1 p-3 bg-[var(--aria-surface-3)] border border-[var(--aria-border-2)] rounded-xl">
      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--aria-purple)]">De ce am ales-o pentru tine</span>
      <p className="text-xs leading-relaxed text-[var(--aria-text-2)]">
        <RichText text={why} />
      </p>
    </div>
  );
}

// "Ce s-a schimbat față de recomandarea anterioară" — the delta rows on a re-recommendation
// (cheaper alternative, etc.). Cyan card; `tone` colors just the delta ('good'/'warn').
const CHANGE_TONES = { good: "var(--aria-success)", warn: "var(--aria-warning)" };
function ChangesBlock({ changes }) {
  if (!changes?.length) return null;
  return (
    <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-[rgba(56,189,248,0.06)] border border-[rgba(2,132,199,0.18)]">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--aria-blue)]">
        Ce s-a schimbat față de recomandarea anterioară
      </span>
      {changes.map((c, i) => (
        <div key={i} className="flex items-baseline gap-2">
          <span className="shrink-0 text-[11px] font-bold" style={{ color: CHANGE_TONES[c.tone] || "var(--aria-text-4)" }}>
            {c.delta}
          </span>
          <span className="text-xs text-[var(--aria-text-4)]">{c.label}</span>
        </div>
      ))}
    </div>
  );
}

// "Ideală pentru / Evită dacă" two-column block — renders only the sides the bot
// actually provided.
function IdealAvoidBlock({ best, avoid }) {
  if (!best && !avoid) return null;
  return (
    <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2">
      {best && (
        <div className="flex flex-col gap-0.5 p-2.5 bg-[var(--aria-surface-3)] border border-[var(--aria-border-2)] rounded-lg">
          <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--aria-success)]">Ideală pentru</span>
          <span className="text-[11px] leading-snug text-[var(--aria-text-2)]">{best}</span>
        </div>
      )}
      {avoid && (
        <div className="flex flex-col gap-0.5 p-2.5 bg-[var(--aria-surface-3)] border border-[var(--aria-border-2)] rounded-lg">
          <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--aria-warning)]">Evită dacă</span>
          <span className="text-[11px] leading-snug text-[var(--aria-text-2)]">{avoid}</span>
        </div>
      )}
    </div>
  );
}

// Expandable pros/cons — independent from the legacy `details` expander below it.
function ProsConsBlock({ pros, cons }) {
  const [open, setOpen] = useState(false);
  if (!pros?.length && !cons?.length) return null;
  return (
    <div className="border border-[var(--aria-border-2)] rounded-[11px] overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center justify-between w-full px-3 py-2.5 bg-[var(--aria-surface-3)] hover:bg-[var(--aria-surface-2)] text-[11.5px] font-medium text-[var(--aria-text-4)] transition-colors"
      >
        <span>Pentru cine e · argumente pro și contra</span>
        <ChevronDown className={`w-3.5 h-3.5 text-[var(--aria-text-5)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3 p-3 bg-white border-t border-[var(--aria-border-2)]">
          <div className="space-y-1.5">
            {pros.map((p, i) => (
              <div key={i} className="flex gap-1.5 text-[11px] leading-snug text-[var(--aria-text-2)]">
                <span className="text-[var(--aria-success)] font-bold shrink-0">+</span>
                <span>{p}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            {cons.map((c, i) => (
              <div key={i} className="flex gap-1.5 text-[11px] leading-snug text-[var(--aria-text-4)]">
                <span className="text-[var(--aria-warning)] font-bold shrink-0">–</span>
                <span>{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChatProductCard({ product, variant = "compact", onAdd, onAsk }) {
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

  // Optional discount: strike the original price, show the saved percentage.
  const hasDiscount = product.list_price != null && product.list_price > product.price;
  const discountPct = hasDiscount
    ? Math.round(((product.list_price - product.price) / product.list_price) * 100)
    : 0;

  const badges = product.badges || [];
  const highlights = product.highlights || [];
  const meta = product.meta || [];
  const pros = product.pros || [];
  const cons = product.cons || [];

  // Image + title link to the product page (new tab keeps the chat open). We don't
  // wrap the whole card so the buttons / details toggle stay valid, isolated targets.
  const linkProps = product.url
    ? { href: product.url, target: "_blank", rel: "noopener noreferrer", title: `Vezi ${product.name}` }
    : null;

  // The tall vertical layout only looks balanced when the bot sends `highlights`
  // (delivery / voucher / urgency rows) to fill it. With today's sparse replies it
  // reads as a half-empty image block, so a plain "compact" reply stays compact
  // unless it's explicitly the hero of a multi-product reply.
  const rich = variant === "hero" || highlights.length > 0;

  const heartBtn = (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleWish(product);
      }}
      title={wished ? "Scoate de la favorite" : "Adaugă la favorite"}
      className="w-7 h-7 rounded-full flex items-center justify-center bg-white border border-[var(--aria-border-2)] hover:border-[var(--aria-purple)] transition-colors shrink-0"
    >
      <Heart className={`w-3.5 h-3.5 text-[var(--aria-purple)] ${wished ? "fill-current" : ""}`} />
    </button>
  );

  // Labeled save toggle for the hero action row (matches the design's "Salvează"/"Salvat" pill).
  const saveLabel = wished ? "Salvat" : "Salvează";
  const savePillBtn = (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleWish(product);
      }}
      className={`flex-1 min-[420px]:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-[11px] border text-xs font-semibold transition-colors ${
        wished
          ? "bg-[rgba(124,58,237,0.1)] border-[rgba(124,58,237,0.45)] text-[var(--aria-purple)]"
          : "bg-white border-[var(--aria-border-3)] text-[var(--aria-text-2)] hover:border-[var(--aria-purple)]"
      }`}
    >
      <Heart className={`w-3.5 h-3.5 ${wished ? "fill-current" : ""}`} />
      {saveLabel}
    </button>
  );

  const ratingRow = product.rating != null && (
    <div className="flex items-center gap-1">
      <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
      <span className="text-[10px] font-semibold text-[var(--aria-text)]">{product.rating}</span>
      {product.review_count > 0 && (
        <span className="text-[10px] text-[var(--aria-text-5)]">({product.review_count.toLocaleString("ro-RO")})</span>
      )}
    </div>
  );

  const priceBlock = (
    <div className="min-w-0">
      <Price value={product.price} currency={product.currency} className="text-base text-[var(--aria-text)]" />
      {hasDiscount && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[var(--aria-text-5)] line-through">
            {Number(product.list_price).toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
            {CURRENCY_LABEL[product.currency] || product.currency}
          </span>
          {discountPct > 0 && <span className="text-[9px] font-bold text-[var(--aria-success)]">-{discountPct}%</span>}
        </div>
      )}
    </div>
  );

  const addBtn = (
    <button
      onClick={handleAdd}
      title="Adaugă în coș"
      className="shrink-0 w-9 h-9 rounded-lg aria-gradient-bg text-white flex items-center justify-center shadow-sm transition-opacity hover:opacity-90"
    >
      <ShoppingCart className="w-4 h-4" />
    </button>
  );

  const heroAddBtn = (
    <button
      onClick={handleAdd}
      title="Adaugă în coș"
      className="flex-1 min-w-[130px] flex items-center justify-center gap-2 aria-gradient-bg text-white text-[12.5px] font-semibold py-2.5 rounded-[11px] shadow-sm transition-opacity hover:opacity-90"
    >
      <ShoppingCart className="w-3.5 h-3.5" /> Adaugă în coș
    </button>
  );

  const askAriaBtn = (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onAsk?.(`Spune-mi mai multe despre ${product.name}`);
      }}
      className="flex-1 min-[420px]:flex-none px-3.5 py-2.5 rounded-[11px] border border-[var(--aria-border-3)] text-xs font-medium text-[var(--aria-text-2)] hover:border-[var(--aria-purple)] hover:text-[var(--aria-purple)] transition-colors"
    >
      Întreabă Aria
    </button>
  );

  const detailsBlock = product.details && (
    <div className="border-t border-[var(--aria-border-2)] pt-1.5">
      <button
        onClick={() => setShowDetails((s) => !s)}
        aria-expanded={showDetails}
        className="flex items-center gap-1 text-[11px] font-semibold text-[var(--aria-purple)] hover:opacity-80 transition-opacity"
      >
        Spune-mi mai multe
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDetails ? "rotate-180" : ""}`} />
      </button>
      {showDetails && (
        <div className="mt-1.5 text-[11px] text-[var(--aria-text-4)] leading-relaxed">
          <RichText text={product.details} />
        </div>
      )}
    </div>
  );

  const badgesRow = badges.length > 0 && (
    <div className="flex flex-wrap gap-1">
      {badges.map((b, i) => (
        <Badge key={i} label={b.label} tone={b.tone} />
      ))}
    </div>
  );

  // `extra` reserves right padding so text clears the floating heart. `size` lets the
  // hero variant use the design's larger 16px name vs 13.5px on grid/compact/rich.
  const nameEl = (extra, size = "text-[13.5px]") =>
    linkProps ? (
      <a {...linkProps} className="block">
        <p
          className={`aria-heading ${size} leading-snug line-clamp-2 text-[var(--aria-text)] hover:text-[var(--aria-purple)] transition-colors ${extra}`}
        >
          {product.name}
        </p>
      </a>
    ) : (
      <p className={`aria-heading ${size} leading-snug line-clamp-2 text-[var(--aria-text)] ${extra}`}>{product.name}</p>
    );

  // ── Grid tile — secondary products in a multi-product reply, 2-up ──
  if (variant === "grid") {
    return (
      <div className="relative flex flex-col gap-1.5 p-2.5 bg-white border border-[var(--aria-border)] rounded-[14px] shadow-[0_2px_8px_rgba(27,24,38,0.04)]">
        <div className="absolute top-2 right-2 z-10">{heartBtn}</div>
        {linkProps ? (
          <a {...linkProps}>
            <CardImage product={product} variant="grid" />
          </a>
        ) : (
          <CardImage product={product} variant="grid" />
        )}
        {badgesRow && <div className="pr-6">{badgesRow}</div>}
        {product.brand && (
          <span className="block text-[9px] uppercase tracking-[0.14em] text-[var(--aria-text-5)] pr-6">{product.brand}</span>
        )}
        {nameEl("pr-6 min-h-[2.2em]")}
        {ratingRow}
        <div className="flex items-center justify-between gap-2">
          <Price value={product.price} currency={product.currency} className="text-sm text-[var(--aria-text)]" />
          <ScorePill score={product.score} />
        </div>
        {product.reason && (
          <p className="text-[10px] text-[var(--aria-text-4)] leading-snug line-clamp-2">{product.reason}</p>
        )}
        <div className="flex items-center justify-end">{addBtn}</div>
      </div>
    );
  }

  // ── Hero card — the primary recommendation ──
  if (variant === "hero") {
    return (
      <div className="relative bg-white border border-[var(--aria-border)] rounded-[18px] p-3 min-[380px]:p-3.5 shadow-[0_12px_36px_rgba(109,40,217,0.1)] space-y-2.5">
        <div className="flex items-start justify-between gap-2 min-h-[20px]">
          <div className="flex flex-wrap items-center gap-1.5">{badgesRow}</div>
          <ScorePill score={product.score} />
        </div>

        {linkProps ? (
          <a {...linkProps} className="block">
            <CardImage product={product} variant="hero" />
          </a>
        ) : (
          <CardImage product={product} variant="hero" />
        )}

        {ratingRow}

        {highlights.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {highlights.map((h, i) => (
              <Highlight key={i} text={h.text} tone={h.tone} icon={h.icon} />
            ))}
          </div>
        )}

        {product.brand && (
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.16em] text-[var(--aria-text-3)]">
            {product.brand}
          </span>
        )}
        {nameEl("", "text-[16px]")}

        {product.reason && <p className="text-[11px] text-[var(--aria-text-4)] leading-snug">{product.reason}</p>}

        <WhyBlock why={product.why} />
        <ChangesBlock changes={product.changes} />
        <IdealAvoidBlock best={product.best} avoid={product.avoid} />

        <div className="flex items-end justify-between gap-2">{priceBlock}</div>

        <MetaList items={meta} />

        <div className="flex flex-wrap gap-2">
          {savePillBtn}
          {askAriaBtn}
          {linkProps && (
            <a
              {...linkProps}
              className="flex-1 min-w-[150px] flex items-center justify-center px-3.5 py-2.5 rounded-[11px] aria-gradient-bg text-white text-[12.5px] font-semibold shadow-[0_6px_20px_rgba(109,40,217,0.3)] hover:opacity-90 transition-opacity"
            >
              Vezi produsul ↗
            </a>
          )}
          {heroAddBtn}
        </div>

        <ProsConsBlock pros={pros} cons={cons} />
        {detailsBlock}
      </div>
    );
  }

  // ── Compact card — default for today's sparse data (small filled image, dense info) ──
  if (!rich) {
    return (
      <div className="relative bg-white border border-[var(--aria-border)] rounded-xl p-2.5 shadow-sm">
        <div className="absolute top-1.5 right-1.5 z-10">{heartBtn}</div>
        <div className="flex gap-3">
          {linkProps ? (
            <a {...linkProps} className="shrink-0">
              <CardImage product={product} variant="compact" />
            </a>
          ) : (
            <CardImage product={product} variant="compact" />
          )}
          <div className="flex-1 min-w-0">
            {badgesRow && <div className="mb-1 pr-7">{badgesRow}</div>}
            {nameEl(badges.length ? "" : "pr-7")}
            {ratingRow && <div className="mt-0.5">{ratingRow}</div>}
            {product.reason && (
              <p className="text-[10px] text-[var(--aria-text-4)] leading-snug mt-0.5 line-clamp-2">{product.reason}</p>
            )}
            <div className="flex items-end justify-between gap-2 mt-1.5">
              {priceBlock}
              {addBtn}
            </div>
            <MetaList items={meta} />
          </div>
        </div>
        {detailsBlock}
      </div>
    );
  }

  // ── Full vertical eMAG card — once the bot sends highlights (matches the target) ──
  return (
    <div className="relative bg-white border border-[var(--aria-border)] rounded-xl p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-2 min-h-[20px]">
        {badgesRow || <span />}
        {heartBtn}
      </div>

      {linkProps ? (
        <a {...linkProps} className="block">
          <CardImage product={product} variant="rich" />
        </a>
      ) : (
        <CardImage product={product} variant="rich" />
      )}

      {ratingRow && <div className="mt-2">{ratingRow}</div>}

      <div className="flex flex-wrap gap-1 mt-1.5">
        {highlights.map((h, i) => (
          <Highlight key={i} text={h.text} tone={h.tone} icon={h.icon} />
        ))}
      </div>

      <div className="mt-1.5">{nameEl("")}</div>

      {product.reason && (
        <p className="text-[10px] text-[var(--aria-text-4)] leading-snug mt-1 line-clamp-2">{product.reason}</p>
      )}

      <div className="flex items-end justify-between gap-2 mt-2">
        {priceBlock}
        {addBtn}
      </div>

      <MetaList items={meta} />
      {detailsBlock}
    </div>
  );
}

// Product image — small square in compact mode, full-width banner in rich/hero
// mode, medium square in grid mode. Muted icon when the bot returns no image_url.
function CardImage({ product, variant }) {
  const box =
    variant === "compact"
      ? "w-20 h-20 shrink-0"
      : variant === "grid"
        ? "w-full h-28 min-[390px]:h-24"
        : "w-full h-32 min-[420px]:h-36";
  return (
    <div
      className={`${box} rounded-[10px] border border-[var(--aria-border-2)] overflow-hidden flex items-center justify-center`}
      style={
        product.image_url
          ? undefined
          : { background: "radial-gradient(closest-side at 50% 45%, rgba(124,58,237,0.1), rgba(246,244,251,0) 90%), var(--aria-surface-2)" }
      }
    >
      {product.image_url ? (
        <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <Package className={`${variant === "compact" ? "w-6 h-6" : "w-8 h-8"} text-[var(--aria-text-5)]`} />
      )}
    </div>
  );
}
