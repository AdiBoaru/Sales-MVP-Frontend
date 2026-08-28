import React, { useState } from "react";
import { ThumbsUp, ThumbsDown, AlertTriangle, ArrowUpRight, Heart, Package, User } from "lucide-react";
import { useWished, toggleWish, keyOfProduct } from "@/lib/wishlist";
import RichText, { ReplyBody, ReplySummary, replySplit } from "@/components/store/RichText";
import ChatProductCard from "@/components/store/ChatProductCard";
import ChatOffer from "@/components/store/ChatOffer";

// Stock-status tone -> palette (dot + badge). The bot picks a tone per row ('ok'/'warn');
// the frontend owns the colors here. Unknown tones degrade to neutral.
const STATUS_TONES = {
  ok: { dot: "#16a34a", badgeBg: "rgba(22,163,74,0.12)", badgeText: "var(--aria-success)" },
  warn: { dot: "#d97706", badgeBg: "rgba(217,119,6,0.13)", badgeText: "var(--aria-warning)" },
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

// Product-comparison table — rendered only when the bot returns a `comparison`.
// The izi layout: product images are the column headers, and each dimension is a
// full-width label band followed by one value per column, so long values never get
// squeezed into a narrow cell. Three or more products scroll horizontally.
// A row's `winner` (column index) and the table's `verdict`/`confidence` are
// optional — added by the bot when it has an actual opinion, never fabricated here.
//
// `rows` are no longer catalog columns ("Finisaj: mat", "Brand: Velora") but decision axes the
// bot picked for THIS pair ("Senzația pe buze", "Cât rezistă"), with sentences for values. Two
// consequences here: `label` is free text, so nothing may switch on its value or map it to an
// icon; and the row count can legitimately be small — two near-identical products produce a
// short table, which is the answer, not missing data. Nothing gets padded to a fixed height.
function ComparisonTable({ comparison }) {
  const columns = comparison?.columns ?? [];
  const rows = comparison?.rows ?? [];
  if (columns.length === 0) return null;

  const n = columns.length;
  const cell = (v) => (v == null || v === "" ? "—" : v);

  const ProductHead = ({ col }) => {
    // The image alone identifies the column, exactly as in the reference: no name,
    // no price, no badge. Everything comparable belongs to the table's own rows —
    // repeating the price in the header would state it twice, differently.
    const head = (
      <>
        <div className="w-[46px] h-[46px] rounded-[10px] bg-[var(--aria-surface-2)] border border-[var(--aria-border-2)] overflow-hidden flex items-center justify-center p-1">
          {col.image_url ? (
            <img src={col.image_url} alt="" className="w-full h-full object-contain" />
          ) : (
            <Package className="w-5 h-5 text-[var(--aria-text-5)]" />
          )}
        </div>
        {/* The name stays in the DOM for screen readers, so the column is never anonymous. */}
        <span className="sr-only">{col.name}</span>
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
    <div className="flex flex-col gap-3">
      {/* The heading that names the table. Server-owned copy, localised there: a hardcoded
          "Diferențe principale" here would stay Romanian for a Hungarian tenant. */}
      {comparison.heading && <h4 className="aria-h text-[var(--aria-text)]">{comparison.heading}</h4>}
      <div className="aria-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={n > 2 ? { minWidth: `${n * 155}px` } : undefined}>
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th key={i} scope="col" className="px-3 pt-3.5 pb-3 align-top font-normal" style={{ width: `${100 / n}%` }}>
                  <ProductHead col={col} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <React.Fragment key={r}>
                {/* Each dimension is a tinted full-width label band, then one value per
                    column on white — banding is what keeps a long value readable
                    instead of squeezed into a narrow labelled cell.
                    Banda era #f8f7f8 cu text #9a8b80: un gri-cald cu tentă de nisip,
                    singura suprafață maro dintr-un panel violet. Acum e o treaptă din
                    aceeași familie ca restul widgetului, iar eticheta e eyebrow —
                    citește ca antet de secțiune, nu ca o valoare ștearsă. */}
                <tr>
                  <td
                    colSpan={n}
                    className="px-3 py-[7px] border-t border-[var(--aria-border-2)] bg-[var(--aria-surface-2)]"
                  >
                    <span className="aria-eyebrow text-[9.5px] text-[var(--aria-text-4)]">{row.label}</span>
                  </td>
                </tr>
                <tr>
                  {columns.map((_, i) => (
                    <td
                      key={i}
                      className={`px-3 pt-2.5 pb-3 align-top text-[13.5px] leading-[1.45] ${
                        row.winner === i
                          ? "font-bold text-[var(--aria-purple)]"
                          : "font-semibold text-[var(--aria-text-2)]"
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
        <div className="flex flex-col gap-2.5 px-3.5 py-3.5 border-t border-[var(--aria-border-2)] bg-[var(--aria-tint)]">
          <span className="aria-eyebrow text-[var(--aria-purple)]">Verdictul Ariei</span>
          <p className="text-[13.5px] leading-[1.55] text-[var(--aria-text-2)]">{comparison.verdict}</p>
          {comparison.confidence != null && (
            <div className="flex items-center gap-2.5">
              <div className="flex-1 h-1 rounded-full bg-[var(--aria-tint-2)] overflow-hidden">
                <div
                  className="aria-confidence-bar h-full rounded-full aria-gradient-bg"
                  style={{ width: `${comparison.confidence}%` }}
                />
              </div>
              <span className="aria-num text-[11.5px] font-bold text-[var(--aria-purple)] shrink-0">
                {comparison.confidence}%
              </span>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

// Lightweight 👍/👎 on a bot reply. Visual-only for now (no backend); a real handler
// would POST { client_msg_id, vote } to the bot. Resets on reload by design.
function MessageFeedback() {
  const [vote, setVote] = useState(/** @type {null | "up" | "down"} */ (null));
  const cls = (mine) =>
    `w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
      vote === mine
        ? "text-[var(--aria-purple)] bg-[var(--aria-tint)]"
        : "text-[var(--aria-text-5)] hover:text-[var(--aria-text-3)] hover:bg-[var(--aria-surface-2)]"
    }`;
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => setVote("up")} title="Răspuns util" className={cls("up")}>
        <ThumbsUp className="w-[15px] h-[15px]" strokeWidth={1.9} />
      </button>
      <button onClick={() => setVote("down")} title="Răspuns neutil" className={cls("down")}>
        <ThumbsDown className="w-[15px] h-[15px]" strokeWidth={1.9} />
      </button>
      {vote && <span className="aria-meta text-[var(--aria-text-4)] ml-1">Mulțumesc!</span>}
    </div>
  );
}

// Every product in a reply gets the same card, stacked — the reference makes no
// visual distinction between a "hero" and the alternatives.
function ProductStack({ products, onToast, onAsk }) {
  const onAdd = () => onToast?.("Produsul a fost adăugat în coș");
  return (
    <div className="aria-stagger flex flex-col gap-5">
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
    // Rail de accent + tentă plată, în locul gradientului lila→roz care intra pe toată
    // lățimea: cardul ăsta e o CONFIRMARE, nu o reclamă. Railul îl leagă vizual de
    // linia de sumar a răspunsului, deci se citește ca aceeași voce.
    <div className="flex flex-col gap-3 pl-3.5 pr-4 py-3.5 rounded-[var(--aria-r-md)] border border-[var(--aria-tint-line)] border-l-[3px] border-l-[var(--aria-purple)] bg-[var(--aria-tint)]">
      <span className="aria-eyebrow text-[var(--aria-purple)]">{data.title || "Am înțeles ce cauți"}</span>
      <div className="flex flex-wrap gap-1.5">
        {data.chips.map((c, i) => (
          <span
            key={i}
            className="inline-flex items-baseline gap-1.5 px-2.5 py-[5px] bg-[var(--aria-surface)] border border-[var(--aria-border)] rounded-full text-[11.5px] shadow-[var(--aria-shadow-1)]"
          >
            <span className="text-[var(--aria-text-4)]">{c.k}</span>
            <span className="font-semibold text-[var(--aria-text)]">{c.v}</span>
          </span>
        ))}
      </div>
      {data.note && <p className="text-[12.5px] leading-[1.55] text-[var(--aria-text-2)]">{data.note}</p>}
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
            className="flex items-center gap-3 px-3.5 py-3 bg-[var(--aria-surface)] border border-[var(--aria-border)] rounded-[var(--aria-r-sm)] shadow-[var(--aria-shadow-1)]"
          >
            {/* Bulina primește un halo din propriul ton: la 8px, un punct plin pe alb
                e o scamă, iar starea de stoc e exact ce se caută dintr-o privire. */}
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: t.dot, boxShadow: `0 0 0 3px ${t.badgeBg}` }}
            />
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className="text-[12.5px] font-semibold leading-[1.35] text-[var(--aria-text)]">{s.name}</span>
              {s.sub && <span className="aria-meta text-[var(--aria-text-3)]">{s.sub}</span>}
            </div>
            {s.badge && (
              <span
                className="shrink-0 px-2.5 py-1 rounded-full text-[10.5px] font-bold"
                style={{ background: t.badgeBg, color: t.badgeText }}
              >
                {s.badge}
              </span>
            )}
          </div>
        );
      })}
      <span className="aria-meta text-[var(--aria-text-5)] pl-0.5">
        Stoc verificat în timp real, acum câteva secunde
      </span>
    </div>
  );
}

// "ÎNCREDERE ÎN RECOMANDARE" — a labeled, animated gradient confidence bar. Message-
// level (a comparison carries its own separate bar in ComparisonTable).
function ConfidenceBar({ value }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="aria-eyebrow text-[var(--aria-text-4)]">Încredere în recomandare</span>
        <span className="aria-num text-[13px] font-bold text-[var(--aria-purple)]">{value}%</span>
      </div>
      {/* 4px, nu 5: bara e o notă de subsol a răspunsului, iar la 5px cu gradient
          concura vizual cu butonul principal de sub carduri. */}
      <div className="h-1 rounded-full bg-[var(--aria-border-2)] overflow-hidden">
        <div className="aria-confidence-bar h-full rounded-full aria-gradient-bg" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// Honest "no results" refusal — the amber card Aria shows for an impossible request
// ("niciun ser nu șterge ridurile în 3 zile"). Never a fabricated product.
function NoResultsCard({ data }) {
  return (
    <div className="flex flex-col gap-2.5 pl-3.5 pr-4 py-3.5 rounded-[var(--aria-r-md)] border border-[rgba(180,83,9,0.28)] border-l-[3px] border-l-[var(--aria-warning)] bg-[rgba(217,119,6,0.05)]">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-[var(--aria-warning)] shrink-0" strokeWidth={2.2} />
        {data.title && <span className="aria-h text-[15px] text-[var(--aria-text)]">{data.title}</span>}
      </div>
      {data.text && <p className="text-[13.5px] leading-[1.55] text-[var(--aria-text-2)]">{data.text}</p>}
      {/* Rândul ăsta e semnătura onestității asistentului — italic ca să se audă ca o
          remarcă a lui, nu ca încă o linie de interfață. */}
      <span className="aria-meta italic text-[var(--aria-text-4)]">
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
    <div className="flex items-center gap-3 px-3 py-2.5 bg-[var(--aria-surface)] border border-[var(--aria-border)] rounded-[var(--aria-r-sm)] shadow-[var(--aria-shadow-1)]">
      <div className="w-[44px] h-[44px] rounded-[9px] bg-[var(--aria-surface-2)] border border-[var(--aria-border-2)] overflow-hidden flex items-center justify-center shrink-0 p-1">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className="w-full h-full object-contain" loading="lazy" />
        ) : (
          <Package className="w-4 h-4 text-[var(--aria-text-5)]" />
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        {product.brand && <span className="aria-eyebrow text-[9px] text-[var(--aria-text-5)]">{product.brand}</span>}
        <span className="text-[12.5px] font-semibold leading-[1.35] line-clamp-2 text-[var(--aria-title)]">
          {product.name}
        </span>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        <span className="aria-num text-[13.5px] font-extrabold text-[var(--aria-price)]">
          {money(product.price, product.currency)}
        </span>
        {product.score != null && (
          <span className="aria-num px-1.5 py-px rounded-full bg-[var(--aria-tint)] text-[9.5px] font-bold text-[var(--aria-purple)]">
            AI {product.score}
          </span>
        )}
      </div>
      <button
        onClick={() => toggleWish(product)}
        title={wished ? "Scoate de la favorite" : "Adaugă la favorite"}
        className="shrink-0 p-1 rounded-full text-[var(--aria-text-5)] hover:text-[var(--aria-purple)] hover:bg-[var(--aria-tint)] transition-colors"
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
    <div className="aria-card flex flex-col gap-4 p-4">
      <div className="flex items-baseline justify-between gap-2.5 pb-3 border-b border-[var(--aria-border-2)]">
        <span className="aria-eyebrow aria-gradient-text">{routine.title || "Rutina ta"}</span>
        {routine.total && (
          <span className="aria-num shrink-0 text-[11.5px] font-bold text-[var(--aria-purple)]">
            Total {routine.total}
          </span>
        )}
      </div>
      <div className="flex flex-col">
        {routine.steps.map((st, i) => {
          const last = i === routine.steps.length - 1;
          return (
            <div key={i} className="flex gap-3">
              <div className="shrink-0 flex flex-col items-center w-[26px]">
                <span className="aria-num shrink-0 w-[26px] h-[26px] rounded-full aria-gradient-bg text-white text-[12px] font-bold flex items-center justify-center shadow-[0_2px_8px_-2px_rgba(109,40,217,0.6)]">
                  {i + 1}
                </span>
                {!last && (
                  <span
                    className="flex-1 w-0.5 min-h-[14px] rounded-full my-[3px]"
                    style={{ background: "linear-gradient(180deg,rgba(109,40,217,0.35),rgba(109,40,217,0.08))" }}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-2 pb-4">
                <div className="flex flex-col gap-1">
                  {st.role && <span className="aria-eyebrow text-[9.5px] text-[var(--aria-purple)]">{st.role}</span>}
                  {st.why && <span className="text-[12px] leading-[1.5] text-[var(--aria-text-2)]">{st.why}</span>}
                </div>
                <RoutineStepCard product={st.product} />
              </div>
            </div>
          );
        })}
      </div>
      {routine.note && (
        <p className="pt-3.5 border-t border-[var(--aria-border-2)] text-[12.5px] leading-[1.55] text-[var(--aria-text-2)]">
          {routine.note}
        </p>
      )}
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
      // Colțul din dreapta-jos e mai strâns decât celelalte trei: e „coada" bulei, iar
      // fără ea două bule consecutive citesc ca două casete, nu ca replici. Nu poate fi
      // `rounded-2xl` (suita de contract verifică absența clasei ăleia pe răspunsuri) și
      // nici nu trebuie să fie — forma e a bulei OMULUI, nu a răspunsului.
      <div className="flex justify-end items-end gap-2 aria-msg-in">
        <div className="max-w-[82%] text-[14.5px] leading-[1.5] tracking-[-0.008em] px-4 py-2.5 rounded-[18px] rounded-br-[6px] bg-[var(--aria-user-bubble)] text-[var(--aria-text)]">
          <RichText text={m.content} />
        </div>
        <span className="shrink-0 mb-0.5 w-7 h-7 rounded-full bg-[var(--aria-user-bubble)] border border-[var(--aria-border-2)] flex items-center justify-center">
          <User className="w-3.5 h-3.5 text-[var(--aria-text-4)]" />
        </span>
      </div>
    ) : null;
  }

  // The answer wraps the products the way the reference does: the lead paragraph and
  // its accent summary line introduce them, everything else ("De ce ți-l recomand",
  // "Funcționalități principale", the closing advice…) comes after. A comparison
  // additionally keeps the heading that names the table on the intro side.
  const wrapsProducts = hasContent && (hasProducts || Boolean(m.comparison));
  const split = wrapsProducts
    ? replySplit(m.content, { withHeading: Boolean(m.comparison) })
    : { index: 0, total: 0 };
  const hasTail = wrapsProducts && split.index < split.total;

  // A comparison sends its framing as STRUCTURED fields rather than as paragraph positions
  // inside `content`: `subtitle` is the accent line under the lead, `closing[]` the advice that
  // belongs under the table. Inferring them from position worked only while the bot happened to
  // write exactly two opening paragraphs — a three-paragraph lead silently pushed the advice
  // above the table. Both are optional: the bot omits them when it lacks the facts to be useful.
  const comparisonSubtitle = m.comparison?.subtitle;
  const comparisonClosing = m.comparison?.closing ?? [];

  return (
    <div className="flex flex-col gap-[18px] aria-msg-in">
      {hasTitle && <h3 className="aria-h text-[var(--aria-text)]">{m.title}</h3>}

      {/* The answer body — lead paragraph, accent summary line, sections, lists. */}
      {hasContent && (
        <RichText text={m.content} variant="reply" part={wrapsProducts ? "intro" : "all"} split={split.index} />
      )}

      {/* The comparison's accent summary line, in the same type scale as a parsed one. */}
      {comparisonSubtitle && <ReplySummary text={comparisonSubtitle} />}

      {hasStatus && <StatusRows status={m.status} />}
      {hasConfidence && <ConfidenceBar value={m.confidence} />}

      {/* "Am înțeles ce cauți" understanding card. */}
      {m.understanding && <UnderstandingCard data={m.understanding} />}

      {/* Honest "no results" refusal — replaces products for an impossible request. */}
      {m.noResults && <NoResultsCard data={m.noResults} />}

      {/* Wholly empty bot reply -> graceful fallback line (never a blank bubble / crash). */}
      {!renderable && <p className="aria-small italic text-[var(--aria-text-4)]">{EMPTY_REPLY_FALLBACK}</p>}

      {/* A comparison renders a TABLE (not the products re-listed as cards); the table
          header IS the compared products, so we don't duplicate them. */}
      {m.comparison ? (
        <ComparisonTable comparison={m.comparison} />
      ) : hasProducts ? (
        <ProductStack products={m.products} onToast={onToast} onAsk={onSuggestion} />
      ) : null}

      {/* The detail sections of the answer, below the products they describe. */}
      {hasTail && <RichText text={m.content} variant="reply" part="rest" split={split.index} />}

      {/* The guidance under a comparison table — "look first at X", then what to pick for the
          situation. This is the part that turns a table into a recommendation, so it sits right
          under the table and above the follow-up chips. */}
      <ReplyBody paragraphs={comparisonClosing} />

      {/* Step-by-step routine timeline. */}
      {m.routine && <RoutineTimeline routine={m.routine} />}

      {/* Call-to-action button (open_url / checkout / quick_reply / book). */}
      {m.offer && <ChatOffer offer={m.offer} onQuickReply={onQuickReply} />}

      {/* Follow-up chips — stacked left. Pastilele erau roz (#fce8ef): a treia culoare
          din răspuns, pentru controlul cel mai des apăsat. Acum sunt din familia
          accentului, cu o linie de păr care le dă margine pe canvasul tentat. */}
      {hasSuggestions && (
        <div className="flex flex-col items-start gap-2">
          {m.suggestions.map((s, j) => (
            <button
              key={j}
              onClick={() => onSuggestion?.(s)}
              className="group flex items-center gap-2 text-left pl-4 pr-3.5 py-[10px] bg-[var(--aria-chip)] hover:bg-[var(--aria-chip-hover)] border border-[var(--aria-tint-line)] rounded-full text-[13.5px] leading-[1.35] font-medium text-[var(--aria-chip-ink)] transition-colors"
            >
              <span>{s}</span>
              <ArrowUpRight className="w-3.5 h-3.5 shrink-0 opacity-45 group-hover:opacity-80 transition-opacity" />
            </button>
          ))}
        </div>
      )}

      {/* Disclaimer + 👍/👎 under every bot reply except the opening greeting.
          Linia de sus le desparte de răspuns: fără ea, avertismentul „pot greși"
          atârna de ultimul paragraf ca și cum ar fi făcut parte din el. */}
      {!isFirst && (
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--aria-border-2)]">
          <p className="aria-meta text-[var(--aria-text-5)] max-w-[70%]">{AI_DISCLAIMER}</p>
          <MessageFeedback />
        </div>
      )}
    </div>
  );
}
