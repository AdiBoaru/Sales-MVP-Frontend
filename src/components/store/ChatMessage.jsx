import React, { useState } from "react";
import { ThumbsUp, ThumbsDown, AlertTriangle, Heart, Package, User } from "lucide-react";
import { useWished, toggleWish, keyOfProduct } from "@/lib/wishlist";
import RichText, { hasReplyPart } from "@/components/store/RichText";
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
// The bot's answer is NOT bubbled: like the izi reference it flows at full width on
// the chat background — lead paragraph, accent summary line, sections, cards — and
// only the visitor's own message keeps a bubble.
//
// Shown bot message shape (every field optional, additive):
//   { role, content, products?, comparison?, suggestions?, offer? }

// Graceful fallback for a wholly empty bot reply (e.g. a silent human handoff): never
// an empty bubble, never a crash. Exported so tests assert on it without a magic string.
export const EMPTY_REPLY_FALLBACK = "Momentan nu am un răspuns. Încearcă să reformulezi, te rog.";

// Shown under every bot answer, per the reference — the model can be wrong and says so.
const AI_DISCLAIMER = "Funcționez cu inteligență artificială, așa că pot greși uneori.";

// Prices inside the widget read "82,50 Lei", not the ISO code the rest of the store
// uses — the same label the product cards show.
const LOCALE = "ro-RO";
const CURRENCY_LABEL = { RON: "Lei" };
function money(value, currency) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const amount = n.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${amount} ${CURRENCY_LABEL[currency] || currency || "RON"}`;
}

// Inline price for a comparison column: current price (bold) + optional struck list price.
function ComparisonPrice({ price, listPrice, currency }) {
  const hasDiscount = listPrice != null && listPrice > price;
  return (
    <span className="inline-flex items-baseline justify-center gap-1 flex-wrap">
      <span className="font-bold whitespace-nowrap text-[var(--aria-price)]">{money(price, currency)}</span>
      {hasDiscount && (
        <span className="text-[10px] text-[var(--aria-text-5)] line-through whitespace-nowrap">
          {money(listPrice, currency)}
        </span>
      )}
    </span>
  );
}

// Product-comparison table — rendered only when the bot returns a `comparison`.
// The izi layout: product images are the column headers, and each dimension is a
// full-width label band followed by one value per column, so long values never get
// squeezed into a narrow cell. Three or more products scroll horizontally.
// A row's `winner` (column index) and the table's `verdict`/`confidence` are
// optional — added by the bot when it has an actual opinion, never fabricated here.
function ComparisonTable({ comparison }) {
  const columns = comparison?.columns ?? [];
  const rows = comparison?.rows ?? [];
  if (columns.length === 0) return null;

  const n = columns.length;
  const cell = (v) => (v == null || v === "" ? "—" : v);

  const ProductHead = ({ col }) => {
    const head = (
      <>
        <div className="w-14 h-14 mx-auto bg-white overflow-hidden flex items-center justify-center">
          {col.image_url ? (
            <img src={col.image_url} alt="" className="w-full h-full object-contain" />
          ) : (
            <Package className="w-6 h-6 text-[var(--aria-text-5)]" />
          )}
        </div>
        {/* The image identifies the product visually; the name stays in the DOM for
            screen readers (and so the column is never anonymous). */}
        <span className="sr-only">{col.name}</span>
        <div className="mt-1.5 text-[11px] text-center">
          <ComparisonPrice price={col.price} listPrice={col.list_price} currency={col.currency} />
        </div>
      </>
    );
    return col.url ? (
      <a href={col.url} target="_blank" rel="noopener noreferrer" className="block hover:opacity-90 transition-opacity">
        {head}
      </a>
    ) : (
      head
    );
  };

  return (
    <div className="bg-white border border-[var(--aria-border)] rounded-[12px] overflow-hidden shadow-[0_1px_3px_rgba(22,33,62,0.06)]">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={n > 2 ? { minWidth: `${n * 155}px` } : undefined}>
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th key={i} scope="col" className="p-3 align-top font-normal" style={{ width: `${100 / n}%` }}>
                  <ProductHead col={col} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <React.Fragment key={r}>
                <tr>
                  <td
                    colSpan={n}
                    className="px-3 pt-2.5 pb-1 border-t border-[var(--aria-border-2)] text-[11px] text-[#9a8b80]"
                  >
                    {row.label}
                  </td>
                </tr>
                <tr>
                  {columns.map((_, i) => (
                    <td
                      key={i}
                      className={`px-3 pb-3 align-top text-[13px] leading-snug font-bold ${
                        row.winner === i ? "text-[var(--aria-purple)]" : "text-[var(--aria-text)]"
                      }`}
                    >
                      {cell(row.values?.[i])}
                    </td>
                  ))}
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* "Verdictul Ariei" — only when the bot sends an actual verdict; the
          confidence bar only accompanies a real number, never a guess. */}
      {comparison.verdict && (
        <div className="flex flex-col gap-2 px-3.5 py-3 border-t border-[var(--aria-border-2)] bg-[linear-gradient(90deg,#f6effe,#fdf0f7)]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--aria-purple)]">Verdictul Ariei</span>
          <p className="text-[13px] leading-relaxed text-[var(--aria-text-2)]">{comparison.verdict}</p>
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
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => setVote("up")}
        title="Răspuns util"
        className={`p-1.5 rounded-md transition-colors ${
          vote === "up" ? "text-[var(--aria-purple)]" : "text-[var(--aria-text-5)] hover:text-[var(--aria-text-3)]"
        }`}
      >
        <ThumbsUp className="w-[18px] h-[18px]" />
      </button>
      <button
        onClick={() => setVote("down")}
        title="Răspuns neutil"
        className={`p-1.5 rounded-md transition-colors ${
          vote === "down" ? "text-[var(--aria-purple)]" : "text-[var(--aria-text-5)] hover:text-[var(--aria-text-3)]"
        }`}
      >
        <ThumbsDown className="w-[18px] h-[18px]" />
      </button>
      {vote && <span className="text-[11px] text-[var(--aria-text-4)]">Mulțumesc!</span>}
    </div>
  );
}

// Every product in a reply gets the same card, stacked — the reference makes no
// visual distinction between a "hero" and the alternatives.
function ProductStack({ products, onToast, onAsk }) {
  const onAdd = () => onToast?.("Produsul a fost adăugat în coș");
  return (
    <div className="flex flex-col gap-4">
      {products.map((p, i) => (
        <ChatProductCard key={i} product={p} onAdd={onAdd} onAsk={onAsk} />
      ))}
    </div>
  );
}

// "Am înțeles ce cauți" — the extracted criteria as key/value chips + an optional
// note. A soft accent-tinted card, matching the design's understanding block.
function UnderstandingCard({ data }) {
  return (
    <div className="flex flex-col gap-2.5 px-4 py-3.5 rounded-[12px] border border-[rgba(124,58,237,0.18)] bg-[linear-gradient(90deg,#f8f2ff,#fdf2f8)]">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--aria-purple)]">
        {data.title || "Am înțeles ce cauți"}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {data.chips.map((c, i) => (
          <span
            key={i}
            className="inline-flex items-baseline gap-1.5 px-2.5 py-1 bg-white border border-[var(--aria-border)] rounded-full text-[11.5px]"
          >
            <span className="text-[var(--aria-text-3)]">{c.k}</span>
            <span className="font-semibold text-[var(--aria-text)]">{c.v}</span>
          </span>
        ))}
      </div>
      {data.note && <p className="text-[12px] leading-relaxed text-[var(--aria-text-2)]">{data.note}</p>}
    </div>
  );
}

// In-text "stock status" rows — each product's live availability, with a colored dot
// and a status badge.
function StatusRows({ status }) {
  return (
    <div className="flex flex-col gap-2">
      {status.map((s, i) => {
        const t = statusTone(s.tone);
        return (
          <div
            key={i}
            className="flex items-center gap-2.5 px-3 py-2.5 bg-[var(--aria-surface-3)] border border-[var(--aria-border-2)] rounded-[10px]"
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.dot }} />
            <div className="flex-1 min-w-0 flex flex-col gap-px">
              <span className="text-[12.5px] font-semibold leading-snug text-[var(--aria-text)]">{s.name}</span>
              {s.sub && <span className="text-[11px] leading-snug text-[var(--aria-text-2)]">{s.sub}</span>}
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
    <div className="flex flex-col gap-1.5">
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
    <div className="flex flex-col gap-2.5 px-4 py-3.5 rounded-[12px] border border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.06)]">
      <div className="flex items-center gap-2.5">
        <AlertTriangle className="w-[15px] h-[15px] text-[var(--aria-warning)] shrink-0" />
        {data.title && <span className="aria-heading text-[15px] text-[var(--aria-text)]">{data.title}</span>}
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
    <div className="flex items-center gap-2.5 px-3 py-2.5 bg-[var(--aria-surface-3)] border border-[var(--aria-border-2)] rounded-[10px]">
      <div className="w-[42px] h-[42px] rounded-[8px] bg-white border border-[var(--aria-border-2)] overflow-hidden flex items-center justify-center shrink-0">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className="w-full h-full object-contain" loading="lazy" />
        ) : (
          <Package className="w-4 h-4 text-[var(--aria-text-5)]" />
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-px">
        {product.brand && (
          <span className="text-[9px] uppercase tracking-[0.14em] text-[var(--aria-text-5)]">{product.brand}</span>
        )}
        <span className="text-[12.5px] font-bold leading-snug line-clamp-2 text-[var(--aria-title)]">{product.name}</span>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-0.5">
        <span className="text-[13.5px] font-extrabold text-[var(--aria-price)]">
          {money(product.price, product.currency)}
        </span>
        {product.score != null && (
          <span className="px-1.5 py-px rounded-full bg-[rgba(124,58,237,0.1)] text-[9px] font-bold text-[var(--aria-purple)]">
            AI {product.score}
          </span>
        )}
      </div>
      <button
        onClick={() => toggleWish(product)}
        title={wished ? "Scoate de la favorite" : "Adaugă la favorite"}
        className="shrink-0 p-0.5 text-[var(--aria-text-5)] hover:text-[var(--aria-purple)] transition-colors"
      >
        <Heart className={`w-4 h-4 ${wished ? "fill-current text-[var(--aria-purple)]" : ""}`} />
      </button>
    </div>
  );
}

// A full "rutină" reply — numbered steps joined by a gradient connector line, each
// with a role/why and its recommended product. Total + footnote are optional.
function RoutineTimeline({ routine }) {
  return (
    <div className="flex flex-col gap-3.5 p-4 bg-white border border-[var(--aria-border)] rounded-[12px] shadow-[0_1px_3px_rgba(22,33,62,0.06)]">
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
                    style={{ background: "linear-gradient(180deg,rgba(155,92,246,0.4),rgba(232,121,199,0.3))" }}
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
                  {st.why && <span className="text-[11.5px] leading-snug text-[var(--aria-text-2)]">{st.why}</span>}
                </div>
                <RoutineStepCard product={st.product} />
              </div>
            </div>
          );
        })}
      </div>
      {routine.note && <span className="text-[12px] leading-relaxed text-[var(--aria-text-2)]">{routine.note}</span>}
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
  // Did anything renderable arrive? Drives the empty-reply fallback (bot only).
  const renderable =
    hasContent ||
    hasTitle ||
    hasStatus ||
    hasConfidence ||
    hasProducts ||
    Boolean(m.comparison) ||
    Boolean(m.offer) ||
    hasSuggestions ||
    Boolean(m.understanding) ||
    Boolean(m.routine) ||
    Boolean(m.noResults);

  // The visitor's own message keeps a bubble; the bot's answer does not.
  if (isUser) {
    return hasContent ? (
      <div className="flex justify-end items-start gap-2">
        <div className="max-w-[82%] text-[13.5px] leading-relaxed px-4 py-2.5 rounded-[18px] bg-[var(--aria-user-bubble)] text-[var(--aria-text)]">
          <RichText text={m.content} />
        </div>
        <span className="shrink-0 w-7 h-7 rounded-full bg-[var(--aria-user-bubble)] flex items-center justify-center">
          <User className="w-3.5 h-3.5 text-[var(--aria-purple)]" />
        </span>
      </div>
    ) : null;
  }

  // The answer wraps the products the way the reference does: the lead paragraph and
  // its accent summary line introduce the cards, and the detail sections ("De ce ți-l
  // recomand", "Funcționalități principale"…) come after them. With nothing to show
  // between the two halves the whole body simply renders in one run.
  const wrapsProducts = hasContent && (hasProducts || Boolean(m.comparison));
  const hasTail = wrapsProducts && hasReplyPart(m.content, "rest");

  return (
    <div className="flex flex-col gap-4">
      {hasTitle && <h3 className="aria-heading text-[17px] leading-snug text-[var(--aria-text)]">{m.title}</h3>}

      {/* The answer body — lead paragraph, accent summary line, sections, lists. */}
      {hasContent && <RichText text={m.content} variant="reply" part={wrapsProducts ? "intro" : "all"} />}

      {hasStatus && <StatusRows status={m.status} />}
      {hasConfidence && <ConfidenceBar value={m.confidence} />}

      {/* "Am înțeles ce cauți" understanding card. */}
      {m.understanding && <UnderstandingCard data={m.understanding} />}

      {/* Honest "no results" refusal — replaces products for an impossible request. */}
      {m.noResults && <NoResultsCard data={m.noResults} />}

      {/* Wholly empty bot reply -> graceful fallback line (never a blank bubble / crash). */}
      {!renderable && <p className="text-xs italic text-[var(--aria-text-4)]">{EMPTY_REPLY_FALLBACK}</p>}

      {/* A comparison renders a TABLE (not the products re-listed as cards); the table
          header IS the compared products, so we don't duplicate them. */}
      {m.comparison ? (
        <ComparisonTable comparison={m.comparison} />
      ) : hasProducts ? (
        <ProductStack products={m.products} onToast={onToast} onAsk={onSuggestion} />
      ) : null}

      {/* The detail sections of the answer, below the products they describe. */}
      {hasTail && <RichText text={m.content} variant="reply" part="rest" />}

      {/* Step-by-step routine timeline. */}
      {m.routine && <RoutineTimeline routine={m.routine} />}

      {/* Call-to-action button (open_url / checkout / quick_reply / book). */}
      {m.offer && <ChatOffer offer={m.offer} onQuickReply={onQuickReply} />}

      {/* Follow-up chips — soft pink pills, stacked left, matching the reference. */}
      {hasSuggestions && (
        <div className="flex flex-col items-start gap-2">
          {m.suggestions.map((s, j) => (
            <button
              key={j}
              onClick={() => onSuggestion?.(s)}
              className="text-left px-4 py-2.5 bg-[var(--aria-chip)] hover:bg-[var(--aria-chip-hover)] rounded-full text-[13px] text-[var(--aria-chip-ink)] transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Disclaimer + 👍/👎 under every bot reply except the opening greeting. */}
      {!isFirst && (
        <div className="flex flex-col gap-1">
          <p className="text-[11px] text-[var(--aria-text-5)]">{AI_DISCLAIMER}</p>
          <MessageFeedback />
        </div>
      )}
    </div>
  );
}
