import React, { useState } from "react";
import { ThumbsUp, ThumbsDown, AlertTriangle, Heart, Package } from "lucide-react";
import { formatCurrency } from "@/utils";
import { useWished, toggleWish, keyOfProduct } from "@/lib/wishlist";
import RichText from "@/components/store/RichText";
import ChatProductCard from "@/components/store/ChatProductCard";
import ChatOffer from "@/components/store/ChatOffer";

// Stock-status tone -> palette (dot + badge). The bot picks a tone per row ('ok'/'warn');
// the frontend owns the colors here. Unknown tones degrade to neutral.
const STATUS_TONES = {
  ok: { dot: "#22C55E", badgeBg: "rgba(34,197,94,0.14)", badgeText: "var(--aria-success)" },
  warn: { dot: "#F59E0B", badgeBg: "rgba(245,158,11,0.14)", badgeText: "var(--aria-warning)" },
};
const statusTone = (t) =>
  STATUS_TONES[t] || { dot: "var(--aria-text-5)", badgeBg: "var(--aria-surface-2)", badgeText: "var(--aria-text-3)" };

// Renders ONE chat message (user or bot) from a normalized payload. Kept as a pure,
// presentational component — all behavior comes in via callbacks — so the contract
// fixtures can mount it in isolation, with no widget/transport/state around it.
//
// Shown bot message shape (every field optional, additive):
//   { role, content, products?, comparison?, suggestions?, offer? }

// Graceful fallback for a wholly empty bot reply (e.g. a silent human handoff): never
// an empty bubble, never a crash. Exported so tests assert on it without a magic string.
export const EMPTY_REPLY_FALLBACK = "Momentan nu am un răspuns. Încearcă să reformulezi, te rog.";

// Inline price for a comparison column: current price (bold) + optional struck list price.
function ComparisonPrice({ price, listPrice, currency }) {
  const hasDiscount = listPrice != null && listPrice > price;
  return (
    <span className="inline-flex items-baseline justify-center gap-1 flex-wrap">
      <span className="font-bold whitespace-nowrap text-[var(--aria-text)]">{formatCurrency(price, currency)}</span>
      {hasDiscount && (
        <span className="text-[10px] text-[var(--aria-text-5)] line-through whitespace-nowrap">
          {formatCurrency(listPrice, currency)}
        </span>
      )}
    </span>
  );
}

// Product-comparison table — rendered only when the bot returns a `comparison`.
// Each column is one product; each row is one dimension, with values[i] under
// column i (null/empty -> "—"). Below 375px it stacks per product (no truncation).
// A row's `winner` (column index) and the table's `verdict`/`confidence` are
// optional — added by the bot when it has an actual opinion, never fabricated here.
function ComparisonTable({ comparison }) {
  const columns = comparison?.columns ?? [];
  const rows = comparison?.rows ?? [];
  if (columns.length === 0) return null;

  const cell = (v) => (v == null || v === "" ? "—" : v);

  const ProductHead = ({ col, i }) => {
    const head = (
      <>
        <div className="w-12 h-12 mx-auto rounded-lg bg-[var(--aria-surface-2)] overflow-hidden">
          {col.image_url ? (
            <img src={col.image_url} alt={col.name} className="w-full h-full object-cover" />
          ) : null}
        </div>
        <p className="text-[11px] font-semibold leading-snug mt-1 line-clamp-2">
          {String.fromCharCode(65 + i)} · {col.name}
        </p>
        <div className="mt-0.5 text-[11px]">
          <ComparisonPrice price={col.price} listPrice={col.list_price} currency={col.currency} />
        </div>
      </>
    );
    return col.url ? (
      <a
        href={col.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block hover:opacity-90 transition-opacity"
      >
        {head}
      </a>
    ) : (
      head
    );
  };

  return (
    <div className="bg-white border border-[var(--aria-border)] rounded-xl shadow-sm overflow-hidden">
      <div className="h-[3px] aria-gradient-bg" />
      <div className="px-3 pt-2.5 pb-1">
        <span className="text-[10px] font-bold uppercase tracking-wider aria-gradient-text">Comparație directă</span>
      </div>
      {/* Wide layout: comparison grid */}
      <div className="hidden min-[375px]:block overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr>
              <th className="w-14 p-2" />
              {columns.map((col, i) => (
                <th key={i} className="p-2 text-center align-bottom border-l border-[var(--aria-border-2)]">
                  <ProductHead col={col} i={i} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="border-t border-[var(--aria-border-2)]">
                <td className="p-2 align-top font-semibold text-[var(--aria-text-3)]">{row.label}</td>
                {columns.map((_, i) => (
                  <td
                    key={i}
                    className={`p-2 align-top text-center border-l border-[var(--aria-border-2)] ${
                      row.winner === i ? "font-bold text-[var(--aria-text)]" : "text-[var(--aria-text-3)]"
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {row.winner === i && <span className="w-1.5 h-1.5 rounded-full aria-gradient-bg shrink-0" />}
                      {cell(row.values?.[i])}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Narrow layout (<375px): one block per product, nothing truncated */}
      <div className="min-[375px]:hidden divide-y divide-[var(--aria-border-2)]">
        {columns.map((col, i) => (
          <div key={i} className="p-3">
            <div className="flex items-center gap-2.5">
              <div className="w-11 h-11 rounded-lg bg-[var(--aria-surface-2)] overflow-hidden flex-shrink-0">
                {col.image_url ? (
                  <img src={col.image_url} alt={col.name} className="w-full h-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0">
                {col.url ? (
                  <a
                    href={col.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold leading-snug line-clamp-2 hover:text-[var(--aria-purple)] text-[var(--aria-text)]"
                  >
                    {String.fromCharCode(65 + i)} · {col.name}
                  </a>
                ) : (
                  <p className="text-xs font-semibold leading-snug line-clamp-2 text-[var(--aria-text)]">
                    {String.fromCharCode(65 + i)} · {col.name}
                  </p>
                )}
                <div className="mt-0.5 text-[11px]">
                  <ComparisonPrice price={col.price} listPrice={col.list_price} currency={col.currency} />
                </div>
              </div>
            </div>
            <dl className="mt-2 space-y-1">
              {rows.map((row, r) => (
                <div key={r} className="flex items-start justify-between gap-3 text-[11px]">
                  <dt className="font-medium text-[var(--aria-text-3)] flex-shrink-0">{row.label}</dt>
                  <dd className={`text-right ${row.winner === i ? "font-bold text-[var(--aria-text)]" : "text-[var(--aria-text-2)]"}`}>
                    {cell(row.values?.[i])}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      {/* "Verdictul Ariei" — only when the bot sends an actual verdict; the
          confidence bar only accompanies a real number, never a guess. */}
      {comparison.verdict && (
        <div className="m-2.5 mt-1 flex flex-col gap-2 p-3 rounded-xl bg-[linear-gradient(160deg,rgba(124,58,237,0.07),rgba(56,189,248,0.05))] border border-[rgba(124,58,237,0.22)]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--aria-purple)]">Verdictul Ariei</span>
          <p className="text-xs leading-relaxed text-[var(--aria-text-2)]">{comparison.verdict}</p>
          {comparison.confidence != null && (
            <div className="flex items-center gap-2.5">
              <div className="flex-1 h-1.5 rounded-full bg-[rgba(124,58,237,0.12)] overflow-hidden">
                <div
                  className="aria-confidence-bar h-full rounded-full aria-gradient-bg"
                  style={{ width: `${comparison.confidence}%` }}
                />
              </div>
              <span className="text-xs font-bold text-[var(--aria-purple)] shrink-0">{comparison.confidence}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Lightweight 👍/👎 on a bot reply. Visual-only for now (no backend); a real handler
// would POST { client_msg_id, vote } to the bot. Resets on reload by design.
function MessageFeedback() {
  const [vote, setVote] = useState(/** @type {null | "up" | "down"} */ (null));
  return (
    <div className="flex items-center gap-0.5 pt-0.5 pl-1">
      <button
        onClick={() => setVote("up")}
        title="Răspuns util"
        className={`p-1 rounded-md transition-colors ${
          vote === "up" ? "text-[var(--aria-purple)]" : "text-[var(--aria-border-3)] hover:text-[var(--aria-text-5)]"
        }`}
      >
        <ThumbsUp className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => setVote("down")}
        title="Răspuns neutil"
        className={`p-1 rounded-md transition-colors ${
          vote === "down" ? "text-[var(--aria-purple)]" : "text-[var(--aria-border-3)] hover:text-[var(--aria-text-5)]"
        }`}
      >
        <ThumbsDown className="w-3.5 h-3.5" />
      </button>
      {vote && <span className="text-[10px] text-[var(--aria-text-4)] ml-0.5">Mulțumesc!</span>}
    </div>
  );
}

// Does this product carry enough hero-only data (score/why/best/avoid/pros/cons)
// to earn the rich hero layout on its own, even when it's the only product?
function isHeroWorthy(p) {
  return Boolean(p.score != null || p.why || p.best || p.avoid || p.pros?.length || p.cons?.length);
}

// One or more products from a single reply: the first is always the primary
// recommendation (hero card once there's more than one product, or on its own
// when it carries hero-only data); the rest render as a compact 2-up grid —
// "Alte potriviri bune" — using only real backend data (no fabricated alternatives).
function ProductStack({ products, onToast, onAsk }) {
  const [primary, ...rest] = products;
  const heroVariant = products.length > 1 || isHeroWorthy(primary) ? "hero" : "compact";
  const onAdd = () => onToast?.("Produsul a fost adăugat în coș");

  return (
    <div className="space-y-2.5">
      <ChatProductCard product={primary} variant={heroVariant} onAdd={onAdd} onAsk={onAsk} />
      {rest.length > 0 && (
        <div className="space-y-1.5">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--aria-text-3)] px-0.5">
            Alte potriviri bune
          </span>
          <div className="grid grid-cols-1 min-[390px]:grid-cols-2 gap-2">
            {rest.map((p, j) => (
              <ChatProductCard key={j} product={p} variant="grid" onAdd={onAdd} onAsk={onAsk} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// "Am înțeles ce cauți" — the extracted criteria as key/value chips + an optional
// note. A soft violet→cyan gradient card, matching the design's understanding block.
function UnderstandingCard({ data }) {
  return (
    <div
      className="flex flex-col gap-2.5 px-4 py-3.5 rounded-[14px] border border-[rgba(124,58,237,0.18)]"
      style={{ background: "linear-gradient(160deg,rgba(124,58,237,0.06),rgba(56,189,248,0.04) 70%),#fff" }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--aria-purple)]">
        {data.title || "Am înțeles ce cauți"}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {data.chips.map((c, i) => (
          <span
            key={i}
            className="inline-flex items-baseline gap-1.5 px-2.5 py-1 bg-[var(--aria-surface-2)] border border-[var(--aria-border)] rounded-full text-[11.5px]"
          >
            <span className="text-[var(--aria-text-3)]">{c.k}</span>
            <span className="font-medium text-[var(--aria-text)]">{c.v}</span>
          </span>
        ))}
      </div>
      {data.note && <p className="text-[11.5px] leading-relaxed text-[var(--aria-text-3)]">{data.note}</p>}
    </div>
  );
}

// In-text "stock status" rows — each product's live availability, with a colored dot
// and a status badge. Rendered inside the AI text card (a sub-block, per the design).
function StatusRows({ status }) {
  return (
    <div className="flex flex-col gap-2">
      {status.map((s, i) => {
        const t = statusTone(s.tone);
        return (
          <div
            key={i}
            className="flex items-center gap-2.5 px-3 py-2.5 bg-[var(--aria-surface-3)] border border-[var(--aria-border-2)] rounded-[11px]"
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.dot }} />
            <div className="flex-1 min-w-0 flex flex-col gap-px">
              <span className="text-[12.5px] font-semibold leading-snug text-[var(--aria-text)]">{s.name}</span>
              {s.sub && <span className="text-[11px] leading-snug text-[var(--aria-text-3)]">{s.sub}</span>}
            </div>
            {s.badge && (
              <span
                className="shrink-0 px-2.5 py-1 rounded-full text-[10.5px] font-semibold"
                style={{ background: t.badgeBg, color: t.badgeText }}
              >
                {s.badge}
              </span>
            )}
          </div>
        );
      })}
      <span className="text-[10.5px] text-[var(--aria-text-5)]">Stoc verificat în timp real, acum câteva secunde</span>
    </div>
  );
}

// "ÎNCREDERE ÎN RECOMANDARE" — a labeled, animated gradient confidence bar. Message-
// level (a comparison carries its own separate bar in ComparisonTable).
function ConfidenceBar({ value }) {
  return (
    <div className="flex flex-col gap-1.5 pt-0.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--aria-text-3)]">
          Încredere în recomandare
        </span>
        <span className="aria-heading text-sm text-[var(--aria-purple)]">{value}%</span>
      </div>
      <div className="h-[5px] rounded-full bg-[var(--aria-border-2)] overflow-hidden">
        <div className="aria-confidence-bar h-full rounded-full aria-gradient-bg" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// Honest "no results" refusal — the amber card Aria shows for an impossible request
// ("niciun ser nu șterge ridurile în 3 zile"). Never a fabricated product.
function NoResultsCard({ data }) {
  return (
    <div className="flex flex-col gap-2.5 px-4 py-3.5 rounded-2xl border border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.06)]">
      <div className="flex items-center gap-2.5">
        <AlertTriangle className="w-[15px] h-[15px] text-[var(--aria-warning)] shrink-0" />
        {data.title && <span className="aria-heading text-[14.5px] text-[var(--aria-text)]">{data.title}</span>}
      </div>
      {data.text && <p className="text-[13px] leading-relaxed text-[var(--aria-text-2)]">{data.text}</p>}
      <span className="text-[11px] text-[var(--aria-text-3)]">
        {data.note || "Prefer să-ți spun adevărul decât să-ți vând orice."}
      </span>
    </div>
  );
}

// One product inside a routine step — a compact horizontal mini-card (42px slot, name,
// price, AI score, save heart). Its own component so the wishlist hook stays per-card.
function RoutineStepCard({ product }) {
  const wished = useWished(keyOfProduct(product));
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 bg-[var(--aria-surface-3)] border border-[var(--aria-border-2)] rounded-[11px]">
      <div
        className="w-[42px] h-[42px] rounded-[9px] border border-[var(--aria-border-2)] overflow-hidden flex items-center justify-center shrink-0"
        style={
          product.image_url
            ? undefined
            : { background: "radial-gradient(closest-side at 50% 50%, rgba(124,58,237,0.1), rgba(246,244,251,0) 90%), var(--aria-surface-2)" }
        }
      >
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <Package className="w-4 h-4 text-[var(--aria-text-5)]" />
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-px">
        {product.brand && (
          <span className="text-[9px] uppercase tracking-[0.14em] text-[var(--aria-text-5)]">{product.brand}</span>
        )}
        <span className="aria-heading text-[12.5px] leading-snug line-clamp-2 text-[var(--aria-text)]">{product.name}</span>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-0.5">
        <span className="aria-heading text-[13.5px] text-[var(--aria-text)]">
          {formatCurrency(product.price, product.currency)}
        </span>
        {product.score != null && (
          <span className="px-1.5 py-px rounded-full bg-[rgba(56,189,248,0.1)] text-[9px] font-bold text-[var(--aria-blue)]">
            AI {product.score}
          </span>
        )}
      </div>
      <button
        onClick={() => toggleWish(product)}
        title={wished ? "Scoate de la favorite" : "Adaugă la favorite"}
        className="w-7 h-7 rounded-full flex items-center justify-center bg-white border border-[var(--aria-border-2)] hover:border-[var(--aria-purple)] transition-colors shrink-0"
      >
        <Heart className={`w-3 h-3 text-[var(--aria-purple)] ${wished ? "fill-current" : ""}`} />
      </button>
    </div>
  );
}

// A full "rutină" reply — numbered steps joined by a gradient connector line, each
// with a role/why and its recommended product. Total + footnote are optional.
function RoutineTimeline({ routine }) {
  return (
    <div className="flex flex-col gap-3.5 p-4 bg-white border border-[var(--aria-border)] rounded-[18px] shadow-[0_6px_24px_rgba(27,24,38,0.06)]">
      <div className="flex items-baseline justify-between gap-2.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] aria-gradient-text">
          {routine.title || "Rutina ta"}
        </span>
        {routine.total && (
          <span className="shrink-0 text-[11px] font-semibold text-[var(--aria-purple)]">Total {routine.total}</span>
        )}
      </div>
      <div className="flex flex-col">
        {routine.steps.map((st, i) => {
          const last = i === routine.steps.length - 1;
          return (
            <div key={i} className="flex gap-3">
              <div className="shrink-0 flex flex-col items-center w-[26px]">
                <span className="shrink-0 w-6 h-6 rounded-full aria-gradient-bg text-white aria-heading text-xs flex items-center justify-center">
                  {i + 1}
                </span>
                {!last && (
                  <span
                    className="flex-1 w-0.5 min-h-[14px] rounded-full my-[3px]"
                    style={{ background: "linear-gradient(180deg,rgba(124,58,237,0.35),rgba(56,189,248,0.25))" }}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1.5 pb-3.5">
                <div className="flex flex-col gap-px">
                  {st.role && (
                    <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-[var(--aria-purple)]">
                      {st.role}
                    </span>
                  )}
                  {st.why && <span className="text-[11px] leading-snug text-[var(--aria-text-3)]">{st.why}</span>}
                </div>
                <RoutineStepCard product={st.product} />
              </div>
            </div>
          );
        })}
      </div>
      {routine.note && <span className="text-[11px] leading-relaxed text-[var(--aria-text-3)]">{routine.note}</span>}
    </div>
  );
}

export default function ChatMessage({ message, isFirst, onSuggestion, onQuickReply, onToast }) {
  const m = message || {};
  const isUser = m.role === "user";
  const hasContent = typeof m.content === "string" && m.content.trim() !== "";
  const hasTitle = typeof m.title === "string" && m.title.trim() !== "";
  const hasProducts = Array.isArray(m.products) && m.products.length > 0;
  const hasSuggestions = Array.isArray(m.suggestions) && m.suggestions.length > 0;
  const hasStatus = Array.isArray(m.status) && m.status.length > 0;
  const hasConfidence = typeof m.confidence === "number";
  // The AI text card renders once there's a title, body, stock status or a confidence
  // bar — each an optional sub-block within the same white bubble (per the design).
  const hasTextCard = hasContent || hasTitle || hasStatus || hasConfidence;
  // Did anything renderable arrive? Drives the empty-reply fallback (bot only).
  const renderable =
    hasTextCard ||
    hasProducts ||
    Boolean(m.comparison) ||
    Boolean(m.offer) ||
    hasSuggestions ||
    Boolean(m.understanding) ||
    Boolean(m.routine) ||
    Boolean(m.noResults);

  return (
    <div className="space-y-2">
      {/* User bubble — right-aligned gradient. */}
      {isUser && hasContent && (
        <div className="flex justify-end">
          <div className="max-w-[80%] text-[13.5px] leading-relaxed px-4 py-2.5 rounded-2xl rounded-br-md aria-gradient-bg text-white shadow-[0_4px_14px_rgba(109,40,217,0.25)]">
            <RichText text={m.content} />
          </div>
        </div>
      )}

      {/* AI text card — optional title / body / stock status / confidence, one bubble. */}
      {!isUser && hasTextCard && (
        <div className="flex justify-start">
          <div className="max-w-[94%] flex flex-col gap-3 px-4 py-3.5 rounded-2xl rounded-bl-md bg-white border border-[var(--aria-border)] shadow-[0_2px_10px_rgba(27,24,38,0.05)]">
            {hasTitle && <div className="aria-heading text-[15px] text-[var(--aria-text)]">{m.title}</div>}
            {hasContent && (
              <div className="text-sm leading-relaxed text-[var(--aria-text-2)]">
                <RichText text={m.content} />
              </div>
            )}
            {hasStatus && <StatusRows status={m.status} />}
            {hasConfidence && <ConfidenceBar value={m.confidence} />}
          </div>
        </div>
      )}

      {/* "Am înțeles ce cauți" understanding card. */}
      {m.understanding && <UnderstandingCard data={m.understanding} />}

      {/* Honest "no results" refusal — replaces products for an impossible request. */}
      {m.noResults && <NoResultsCard data={m.noResults} />}

      {/* Wholly empty bot reply -> graceful fallback line (never a blank bubble / crash). */}
      {!isUser && !renderable && (
        <div className="flex justify-start">
          <p className="text-xs italic text-[var(--aria-text-4)] px-1">{EMPTY_REPLY_FALLBACK}</p>
        </div>
      )}

      {/* A comparison renders a TABLE (not the products re-listed as cards); the table
          header IS the compared products, so we don't duplicate them. */}
      {m.comparison ? (
        <ComparisonTable comparison={m.comparison} />
      ) : hasProducts ? (
        <ProductStack products={m.products} onToast={onToast} onAsk={onSuggestion} />
      ) : null}

      {/* Step-by-step routine timeline. */}
      {m.routine && <RoutineTimeline routine={m.routine} />}

      {/* Call-to-action button (open_url / checkout / quick_reply / book). */}
      {m.offer && <ChatOffer offer={m.offer} onQuickReply={onQuickReply} />}

      {/* Follow-up chips — wrapped pill buttons, matching the design's suggestion row. */}
      {hasSuggestions && (
        <div className="flex flex-wrap gap-2 pt-0.5">
          {m.suggestions.map((s, j) => (
            <button
              key={j}
              onClick={() => onSuggestion?.(s)}
              className="px-3.5 py-2 bg-white border border-[var(--aria-border-3)] rounded-full text-[12px] font-medium text-[var(--aria-purple)] shadow-sm hover:border-[var(--aria-purple)] hover:bg-[rgba(124,58,237,0.05)] transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* 👍/👎 under every bot reply except the opening greeting. */}
      {!isUser && !isFirst && <MessageFeedback />}
    </div>
  );
}
