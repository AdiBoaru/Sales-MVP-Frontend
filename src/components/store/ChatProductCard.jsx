import React, { useState } from "react";
import {
  Star, ShoppingCart, Heart, ChevronDown, Package,
  Truck, Tag, Percent, ShieldCheck, Clock, Gift, Info,
} from "lucide-react";
import { addToCart } from "@/lib/cart";
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
//   }
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
        <div key={i} className="flex gap-1 text-[10px] text-muted-foreground">
          {m.label ? <dt className="font-medium">{m.label}:</dt> : null}
          <dd className="truncate">{m.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// Wishlist is purely visual here (no backend): a localStorage set of product keys,
// toggled by the heart. Same spirit as the cart, minus the cross-tab sync.
const WISHLIST_KEY = "aria-wishlist";
function readWishlist() {
  try {
    const list = JSON.parse(localStorage.getItem(WISHLIST_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function useWishlist(key) {
  const [wished, setWished] = useState(() => Boolean(key) && readWishlist().includes(key));
  const toggle = () => {
    if (!key) return;
    const list = readWishlist();
    const next = list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
    try {
      localStorage.setItem(WISHLIST_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota / private mode */
    }
    setWished(next.includes(key));
  };
  return [wished, toggle];
}

export default function ChatProductCard({ product, onAdd }) {
  const [showDetails, setShowDetails] = useState(false);
  const wishKey = product.url || product.name || "";
  const [wished, toggleWish] = useWishlist(wishKey);

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

  // Image + title link to the product page (new tab keeps the chat open). We don't
  // wrap the whole card so the buttons / details toggle stay valid, isolated targets.
  const linkProps = product.url
    ? { href: product.url, target: "_blank", rel: "noopener noreferrer", title: `Vezi ${product.name}` }
    : null;

  return (
    <div className="relative bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
      {/* Top row: badges (left) + wishlist heart (right) */}
      <div className="flex items-start justify-between gap-2 mb-2 min-h-[20px]">
        <div className="flex flex-wrap gap-1">
          {badges.map((b, i) => (
            <Badge key={i} label={b.label} tone={b.tone} />
          ))}
        </div>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleWish();
          }}
          title={wished ? "Scoate de la favorite" : "Adaugă la favorite"}
          className="shrink-0 -mt-0.5 -mr-0.5 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-gray-50 transition-colors"
        >
          <Heart className={`w-4 h-4 ${wished ? "fill-rose-500 text-rose-500" : ""}`} />
        </button>
      </div>

      {/* Image */}
      {linkProps ? (
        <a {...linkProps} className="block">
          <CardImage product={product} />
        </a>
      ) : (
        <CardImage product={product} />
      )}

      {/* Rating */}
      {product.rating != null && (
        <div className="flex items-center gap-1 mt-2">
          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
          <span className="text-[11px] font-semibold">{product.rating}</span>
          {product.review_count > 0 && (
            <span className="text-[10px] text-muted-foreground">
              ({product.review_count.toLocaleString("ro-RO")})
            </span>
          )}
        </div>
      )}

      {/* Highlights (delivery / voucher / urgency …) */}
      {highlights.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {highlights.map((h, i) => (
            <Highlight key={i} text={h.text} tone={h.tone} icon={h.icon} />
          ))}
        </div>
      )}

      {/* Name */}
      {linkProps ? (
        <a {...linkProps} className="block mt-1.5">
          <p className="text-xs font-semibold leading-snug line-clamp-2 hover:text-violet-700 transition-colors">
            {product.name}
          </p>
        </a>
      ) : (
        <p className="text-xs font-semibold leading-snug line-clamp-2 mt-1.5">{product.name}</p>
      )}

      {/* Reason ("why it fits") */}
      {product.reason && (
        <p className="text-[10px] text-muted-foreground leading-snug mt-1 line-clamp-2">{product.reason}</p>
      )}

      {/* Price + add-to-cart */}
      <div className="flex items-end justify-between gap-2 mt-2">
        <div className="min-w-0">
          <Price value={product.price} currency={product.currency} className="text-lg" />
          {hasDiscount && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-muted-foreground line-through">
                {Number(product.list_price).toLocaleString(LOCALE, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                {CURRENCY_LABEL[product.currency] || product.currency}
              </span>
              {discountPct > 0 && (
                <span className="text-[9px] font-bold text-emerald-600">-{discountPct}%</span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={handleAdd}
          title="Adaugă în coș"
          className="shrink-0 w-10 h-10 rounded-xl bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center shadow-sm shadow-violet-200 transition-colors"
        >
          <ShoppingCart className="w-[18px] h-[18px]" />
        </button>
      </div>

      {/* Meta (key/value lines, e.g. delivery date) */}
      <MetaList items={meta} />

      {/* "Spune-mi mai multe" — expandable details, only when the bot provides them */}
      {product.details && (
        <div className="mt-2.5 border-t border-gray-100 pt-2">
          <button
            onClick={() => setShowDetails((s) => !s)}
            aria-expanded={showDetails}
            className="flex items-center gap-1 text-[11px] font-semibold text-violet-700 hover:text-violet-900 transition-colors"
          >
            Spune-mi mai multe
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDetails ? "rotate-180" : ""}`} />
          </button>
          {showDetails && (
            <div className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
              <RichText text={product.details} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Square-ish image with a graceful empty state (muted icon) so cards stay aligned
// whether or not the bot returns an image_url.
function CardImage({ product }) {
  return (
    <div className="w-full h-32 rounded-lg bg-gray-50 overflow-hidden flex items-center justify-center">
      {product.image_url ? (
        <img src={product.image_url} alt={product.name} className="w-full h-full object-contain" loading="lazy" />
      ) : (
        <Package className="w-8 h-8 text-gray-300" />
      )}
    </div>
  );
}
