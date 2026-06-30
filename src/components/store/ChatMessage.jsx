import React, { useState } from "react";
import { ArrowRight, ThumbsUp, ThumbsDown } from "lucide-react";
import { formatCurrency } from "@/utils";
import RichText from "@/components/store/RichText";
import ChatProductCard from "@/components/store/ChatProductCard";
import ChatOffer from "@/components/store/ChatOffer";

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
      <span className="font-bold whitespace-nowrap">{formatCurrency(price, currency)}</span>
      {hasDiscount && (
        <span className="text-[10px] text-muted-foreground line-through whitespace-nowrap">
          {formatCurrency(listPrice, currency)}
        </span>
      )}
    </span>
  );
}

// Product-comparison table — rendered only when the bot returns a `comparison`.
// Each column is one product; each row is one dimension, with values[i] under
// column i (null/empty -> "—"). Below 375px it stacks per product (no truncation).
function ComparisonTable({ comparison }) {
  const columns = comparison?.columns ?? [];
  const rows = comparison?.rows ?? [];
  if (columns.length === 0) return null;

  const cell = (v) => (v == null || v === "" ? "—" : v);

  const ProductHead = ({ col }) => {
    const head = (
      <>
        <div className="w-12 h-12 mx-auto rounded-lg bg-gray-50 overflow-hidden">
          {col.image_url ? (
            <img src={col.image_url} alt={col.name} className="w-full h-full object-cover" />
          ) : null}
        </div>
        <p className="text-[11px] font-semibold leading-snug mt-1 line-clamp-2">{col.name}</p>
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
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      {/* Wide layout: comparison grid */}
      <div className="hidden min-[375px]:block overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr>
              <th className="w-14 p-2" />
              {columns.map((col, i) => (
                <th key={i} className="p-2 text-center align-bottom border-l border-gray-100">
                  <ProductHead col={col} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="border-t border-gray-100">
                <td className="p-2 align-top font-semibold text-muted-foreground">{row.label}</td>
                {columns.map((_, i) => (
                  <td key={i} className="p-2 align-top text-center border-l border-gray-100">
                    {cell(row.values?.[i])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Narrow layout (<375px): one block per product, nothing truncated */}
      <div className="min-[375px]:hidden divide-y divide-gray-100">
        {columns.map((col, i) => (
          <div key={i} className="p-3">
            <div className="flex items-center gap-2.5">
              <div className="w-11 h-11 rounded-lg bg-gray-50 overflow-hidden flex-shrink-0">
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
                    className="text-xs font-semibold leading-snug line-clamp-2 hover:text-violet-700"
                  >
                    {col.name}
                  </a>
                ) : (
                  <p className="text-xs font-semibold leading-snug line-clamp-2">{col.name}</p>
                )}
                <div className="mt-0.5 text-[11px]">
                  <ComparisonPrice price={col.price} listPrice={col.list_price} currency={col.currency} />
                </div>
              </div>
            </div>
            <dl className="mt-2 space-y-1">
              {rows.map((row, r) => (
                <div key={r} className="flex items-start justify-between gap-3 text-[11px]">
                  <dt className="font-medium text-muted-foreground flex-shrink-0">{row.label}</dt>
                  <dd className="text-right">{cell(row.values?.[i])}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
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
          vote === "up" ? "text-violet-600" : "text-gray-300 hover:text-gray-500"
        }`}
      >
        <ThumbsUp className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => setVote("down")}
        title="Răspuns neutil"
        className={`p-1 rounded-md transition-colors ${
          vote === "down" ? "text-violet-600" : "text-gray-300 hover:text-gray-500"
        }`}
      >
        <ThumbsDown className="w-3.5 h-3.5" />
      </button>
      {vote && <span className="text-[10px] text-muted-foreground ml-0.5">Mulțumesc!</span>}
    </div>
  );
}

export default function ChatMessage({ message, isFirst, onSuggestion, onQuickReply, onToast }) {
  const m = message || {};
  const isUser = m.role === "user";
  const hasContent = typeof m.content === "string" && m.content.trim() !== "";
  const hasProducts = Array.isArray(m.products) && m.products.length > 0;
  const hasSuggestions = Array.isArray(m.suggestions) && m.suggestions.length > 0;
  // Did anything renderable arrive? Drives the empty-reply fallback (bot only).
  const renderable = hasContent || hasProducts || Boolean(m.comparison) || Boolean(m.offer) || hasSuggestions;

  return (
    <div className="space-y-2">
      {/* Content bubble — only when there's text, so empty content never shows a blank bubble. */}
      {hasContent && (
        <div className={isUser ? "flex justify-end" : "flex justify-start"}>
          <div
            className={`max-w-[85%] text-sm leading-relaxed px-3.5 py-2.5 rounded-2xl ${
              isUser ? "bg-violet-600 text-white rounded-br-md" : "bg-white border border-gray-100 rounded-bl-md"
            }`}
          >
            <RichText text={m.content} />
          </div>
        </div>
      )}

      {/* Wholly empty bot reply -> graceful fallback line (never a blank bubble / crash). */}
      {!isUser && !renderable && (
        <div className="flex justify-start">
          <p className="text-xs italic text-muted-foreground px-1">{EMPTY_REPLY_FALLBACK}</p>
        </div>
      )}

      {/* A comparison renders a TABLE (not the products re-listed as cards); the table
          header IS the compared products, so we don't duplicate them. */}
      {m.comparison ? (
        <ComparisonTable comparison={m.comparison} />
      ) : hasProducts ? (
        <div className="space-y-2">
          {m.products.map((p, j) => (
            <ChatProductCard
              key={j}
              product={p}
              onAdd={() => onToast?.("Produsul a fost adăugat în coș")}
            />
          ))}
        </div>
      ) : null}

      {/* Call-to-action button (open_url / checkout / quick_reply / book). */}
      {m.offer && <ChatOffer offer={m.offer} onQuickReply={onQuickReply} />}

      {/* Follow-up actions: left-aligned "→ ..." links (chat-thread style),
          distinct from the centered pill chips on the welcome screen. */}
      {hasSuggestions && (
        <div className="flex flex-col gap-0.5 pt-0.5">
          {m.suggestions.map((s, j) => (
            <button
              key={j}
              onClick={() => onSuggestion?.(s)}
              className="group flex items-center gap-1.5 text-left text-xs font-medium text-violet-700 hover:text-violet-900 hover:bg-violet-50 rounded-lg px-2 py-1.5 transition-colors"
            >
              <ArrowRight className="w-3.5 h-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" />
              <span>{s}</span>
            </button>
          ))}
        </div>
      )}

      {/* 👍/👎 under every bot reply except the opening greeting. */}
      {!isUser && !isFirst && <MessageFeedback />}
    </div>
  );
}
