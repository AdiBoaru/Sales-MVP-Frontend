// Transport for the "izi" chat bot (UI labels it "Aria").
//
// Flow (synchronous, see IMPLEMENTATION.md §7):
//   1. GET  /web/bootstrap?token=<PUBLIC_TOKEN> -> { token, visitor_id, sig, sse_url }
//      Opens an anonymous visitor session; cached in localStorage. The SERVER keeps
//      the conversation history (keyed on visitor_id) — the frontend never sends it.
//   2. POST /web/chat { token, visitor_id, sig, message, client_msg_id }
//      -> { content, products, suggestions, comparison? }
// New fields are ADDITIVE: missing -> simply not rendered (zero regression for old replies).
//   On 403 (expired session, e.g. server restart) -> re-bootstrap once automatically.
//
// CORS: the bot only allows https://shop.nativextech.com. In dev, Vite proxies /web/*
// and spoofs the Origin header (see vite.config.js). In prod the build hits the bot
// directly via VITE_CHAT_API_BASE (real origin = the shop).

const API_BASE = import.meta.env.VITE_CHAT_API_BASE || "";
const PUBLIC_TOKEN = import.meta.env.VITE_CHAT_PUBLIC_TOKEN || "";
const SESSION_KEY = "izi-web-session";

export const isChatConfigured =
  Boolean(PUBLIC_TOKEN) && (Boolean(API_BASE) || import.meta.env.DEV);

function url(path) {
  // Dev: API_BASE empty -> "/web/..." (proxied). Prod: "<API_BASE>/web/...".
  return `${API_BASE}${path}`;
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* ignore quota / private mode */
  }
}

export function resetChatSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

async function bootstrap() {
  const res = await fetch(url(`/web/bootstrap?token=${encodeURIComponent(PUBLIC_TOKEN)}`), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`bootstrap failed: ${res.status}`);
  const data = await res.json();
  const session = {
    token: data.token,
    visitor_id: data.visitor_id,
    sig: data.sig,
    sse_url: data.sse_url,
  };
  saveSession(session);
  return session;
}

async function ensureSession() {
  return loadSession() || (await bootstrap());
}

function newClientMsgId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `m_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

// The bot may send price as a number or a localized string ("49,90", "49.90 RON").
// Coerce to a Number so the cart subtotal/total stay correct.
function parsePrice(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value == null) return 0;
  let s = String(value).replace(/[^\d.,]/g, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", "."); // "1.234,56" -> "1234.56"
  } else if (s.includes(",")) {
    s = s.replace(",", "."); // "49,90" -> "49.90"
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// Visual extras are GENERIC and additive: the bot owns the content (and picks a
// `tone`/`icon`), the frontend owns the palette/layout. Unknown tones/icons degrade
// safely in the UI, so nothing here needs to know the shop's domain.

// [{ label, tone }] — colored pills at the top of a card. Accepts bare strings too,
// and falls back to the legacy single `badge` string for old bot replies.
function normalizeBadges(badges, legacyBadge) {
  const out = [];
  if (Array.isArray(badges)) {
    for (const b of badges) {
      if (typeof b === "string" && b.trim()) out.push({ label: b.trim() });
      else if (b && typeof b.label === "string" && b.label.trim())
        out.push({ label: b.label.trim(), tone: typeof b.tone === "string" ? b.tone : undefined });
    }
  }
  if (out.length === 0 && typeof legacyBadge === "string" && legacyBadge.trim())
    out.push({ label: legacyBadge.trim() });
  return out;
}

// [{ text, tone, icon }] — promo / delivery / urgency rows. Accepts bare strings.
function normalizeHighlights(highlights) {
  if (!Array.isArray(highlights)) return [];
  const out = [];
  for (const h of highlights) {
    if (typeof h === "string" && h.trim()) out.push({ text: h.trim() });
    else if (h && typeof h.text === "string" && h.text.trim())
      out.push({
        text: h.text.trim(),
        tone: typeof h.tone === "string" ? h.tone : undefined,
        icon: typeof h.icon === "string" ? h.icon : undefined,
      });
  }
  return out;
}

// [{ label, value }] — key/value lines (e.g. delivery date). Label optional.
function normalizeMeta(meta) {
  if (!Array.isArray(meta)) return [];
  const out = [];
  for (const m of meta) {
    if (m && m.value != null && String(m.value).trim())
      out.push({ label: typeof m.label === "string" ? m.label : "", value: String(m.value).trim() });
  }
  return out;
}

// [string] — short bullet list (pros/cons). Bare strings only; non-string / blank
// entries are dropped so the UI never renders an empty bullet.
function normalizeList(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim());
}

// [{ delta, label, tone }] — the "Ce s-a schimbat" delta rows on a re-recommendation
// (e.g. "−20 lei" / "+SPF 20"). `tone` ('good'|'warn') only colors the delta; unknown
// tones degrade to neutral in the UI. Dropped unless both delta and label are present.
function normalizeChanges(changes) {
  if (!Array.isArray(changes)) return [];
  const out = [];
  for (const c of changes) {
    if (c && typeof c.delta === "string" && c.delta.trim() && typeof c.label === "string" && c.label.trim())
      out.push({
        delta: c.delta.trim(),
        label: c.label.trim(),
        tone: typeof c.tone === "string" ? c.tone : undefined,
      });
  }
  return out;
}

// Normalize a bot product into the shape the widget consumes. All fields beyond
// name/price are optional — read defensively, a missing one just isn't rendered.
export function mapProduct(p) {
  if (!p) return null;
  const reviewCount = Number(p.review_count);
  const score = Number(p.score);
  return {
    product_id: p.product_id ?? null,
    // Optional brand line (uppercase, above the name). Folded into `name` today, so
    // it renders only when the bot sends it explicitly — zero regression otherwise.
    brand: typeof p.brand === "string" ? p.brand.trim() : "",
    name: p.name,
    price: parsePrice(p.price), // current price
    // Original (pre-discount) price. Coerced like price; the UI strikes it through
    // next to `price` only when it's a real markdown (list_price > price).
    list_price: p.list_price != null ? parsePrice(p.list_price) : null,
    currency: p.currency || "RON",
    image_url: p.image_url || p.image || "",
    rating: p.rating ?? null,
    // Shown next to the rating as "(120)"; kept only when there are real reviews.
    review_count: Number.isFinite(reviewCount) && reviewCount > 0 ? reviewCount : null,
    url: p.url || p.product_url || "",
    reason: p.reason || "", // one-line "why it fits", rendered under the name
    // Generic visual extras (see helpers above). Empty arrays / "" render nothing.
    badges: normalizeBadges(p.badges, p.badge),
    highlights: normalizeHighlights(p.highlights),
    meta: normalizeMeta(p.meta),
    details: typeof p.details === "string" ? p.details : "", // "Spune-mi mai multe" body
    // Hero-card extras — every field optional; the card only renders a section once
    // the bot actually sends it (never fabricated client-side).
    score: Number.isFinite(score) ? score : null, // e.g. 9.2 -> "AI 9.2" pill
    why: typeof p.why === "string" ? p.why : "", // longer "why I chose this" (separate from reason's one-liner)
    best: typeof p.best === "string" ? p.best : "", // "Ideală pentru"
    avoid: typeof p.avoid === "string" ? p.avoid : "", // "Evită dacă"
    pros: normalizeList(p.pros),
    cons: normalizeList(p.cons),
    // "Ce s-a schimbat față de recomandarea anterioară" — only on a re-recommendation.
    changes: normalizeChanges(p.changes),
  };
}

// Normalize an optional product-comparison table (parity with iZi/eMAG). Returns
// null when absent or malformed so the widget renders nothing. Column prices are
// coerced like product prices; row `values` arrive already localized and are passed
// through verbatim (a null/empty cell becomes "—" in the UI). `winner` (0-based
// column index) and the verdict/confidence block are optional — the table renders
// exactly as before when the bot doesn't send them.
export function mapComparison(c) {
  if (!c || !Array.isArray(c.columns) || c.columns.length < 2) return null;
  const columns = c.columns.map((col) => ({
    product_id: col?.product_id ?? null,
    name: col?.name || "",
    price: parsePrice(col?.price),
    list_price: col?.list_price != null ? parsePrice(col.list_price) : null,
    currency: col?.currency || "RON",
    image_url: col?.image_url || col?.image || "",
    url: col?.url || col?.product_url || "",
    rating: col?.rating ?? null,
  }));
  const rows = Array.isArray(c.rows)
    ? c.rows
        .filter((row) => row && typeof row.label === "string")
        .map((row) => {
          const winner = Number(row.winner);
          return {
            label: row.label,
            values: Array.isArray(row.values) ? row.values : [],
            winner: Number.isInteger(winner) && winner >= 0 && winner < columns.length ? winner : null,
          };
        })
    : [];
  const confidence = Number(c.confidence);
  return {
    columns,
    rows,
    verdict: typeof c.verdict === "string" ? c.verdict : "", // "Verdictul Ariei" reasoning block
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : null,
  };
}

// Normalize an optional call-to-action button. Returns null when absent/invalid so
// the UI renders nothing. `kind` drives behavior; unknown kinds are dropped. URL-
// bearing kinds need a url, quick_reply needs a payload — otherwise we drop the offer
// rather than render a dead button.
const OFFER_KINDS = new Set(["open_url", "checkout", "quick_reply", "book"]);
export function mapOffer(o) {
  if (!o || typeof o.kind !== "string" || !OFFER_KINDS.has(o.kind)) return null;
  const label = typeof o.label === "string" ? o.label.trim() : "";
  if (!label) return null;
  const offer = { kind: o.kind, label };
  if (o.kind === "open_url" || o.kind === "book") {
    const url = o.url || o.product_url || "";
    if (!url) return null;
    offer.url = url;
  } else if (o.kind === "quick_reply") {
    const payload = typeof o.payload === "string" ? o.payload.trim() : "";
    if (!payload) return null;
    offer.payload = payload;
  } else if (o.kind === "checkout") {
    if (o.url) offer.url = o.url; // optional; UI defaults to the internal /Cart route
  }
  return offer;
}

// "Am înțeles ce cauți" card — the extracted criteria as key/value chips, plus an
// optional note. Returns null unless at least one valid chip arrives. `title` is
// optional (the UI defaults to the design's label).
function normalizeUnderstanding(u) {
  if (!u || typeof u !== "object") return null;
  const chips = Array.isArray(u.chips)
    ? u.chips
        .filter((c) => c && String(c.k ?? "").trim() && String(c.v ?? "").trim())
        .map((c) => ({ k: String(c.k).trim(), v: String(c.v).trim() }))
    : [];
  if (chips.length === 0) return null;
  return {
    title: typeof u.title === "string" && u.title.trim() ? u.title.trim() : "",
    chips,
    note: typeof u.note === "string" ? u.note.trim() : "",
  };
}

// [{ name, sub, badge, tone }] — the in-text "stock status" rows. `tone` ('ok'|'warn')
// picks the dot/badge color; unknown tones degrade to neutral. Dropped unless `name`
// is present.
function normalizeStatus(status) {
  if (!Array.isArray(status)) return [];
  const out = [];
  for (const s of status) {
    if (s && typeof s.name === "string" && s.name.trim())
      out.push({
        name: s.name.trim(),
        sub: typeof s.sub === "string" ? s.sub.trim() : "",
        badge: typeof s.badge === "string" ? s.badge.trim() : "",
        tone: typeof s.tone === "string" ? s.tone : undefined,
      });
  }
  return out;
}

// A full routine ("timeline") reply: ordered steps, each with a role, a why line and
// a product (mapped like any other). Returns null unless at least one step carries a
// product, so a malformed routine renders nothing rather than an empty card.
function normalizeRoutine(r) {
  if (!r || typeof r !== "object") return null;
  const steps = Array.isArray(r.steps)
    ? r.steps
        .map((st) => {
          const product = mapProduct(st?.product);
          if (!product) return null;
          return {
            role: typeof st.role === "string" ? st.role.trim() : "",
            why: typeof st.why === "string" ? st.why.trim() : "",
            product,
          };
        })
        .filter(Boolean)
    : [];
  if (steps.length === 0) return null;
  return {
    title: typeof r.title === "string" ? r.title.trim() : "",
    total: typeof r.total === "string" ? r.total.trim() : "",
    note: typeof r.note === "string" ? r.note.trim() : "",
    steps,
  };
}

// Honest-refusal card ("niciun produs nu susține asta"). Returns null unless there's
// at least a title or a body, so it never renders an empty amber box.
function normalizeNoResults(n) {
  if (!n || typeof n !== "object") return null;
  const title = typeof n.title === "string" ? n.title.trim() : "";
  const text = typeof n.text === "string" ? n.text.trim() : "";
  if (!title && !text) return null;
  return { title, text, note: typeof n.note === "string" ? n.note.trim() : "" };
}

// Pure normalization of a /web/chat reply into the shape the widget renders. Shared
// by sendChatMessage AND the contract-conformance tests, so tests exercise the REAL
// mapping (not a hand-rolled copy). Every field is additive — missing => not rendered.
export function normalizeReply(data) {
  const d = data || {};
  const confidence = Number(d.confidence);
  return {
    content: typeof d.content === "string" ? d.content : "",
    // Optional Barlow heading above the text (e.g. "O întrebare înainte să aleg").
    title: typeof d.title === "string" ? d.title.trim() : "",
    products: Array.isArray(d.products) ? d.products.map(mapProduct).filter(Boolean) : [],
    suggestions: Array.isArray(d.suggestions) ? d.suggestions.filter((s) => typeof s === "string") : [],
    comparison: mapComparison(d.comparison),
    offer: mapOffer(d.offer),
    // "Am înțeles ce cauți" understanding card (key/value chips + note).
    understanding: normalizeUnderstanding(d.understanding),
    // In-text real-time stock status rows.
    status: normalizeStatus(d.status),
    // Message-level "ÎNCREDERE ÎN RECOMANDARE" bar (separate from a comparison's own).
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : null,
    // Full step-by-step routine timeline.
    routine: normalizeRoutine(d.routine),
    // Honest "no results" refusal card.
    noResults: normalizeNoResults(d.no_results ?? d.noResults),
    // Extracted search criteria (e.g. "sub 600 lei", "ANC") for the "Rețin" memory
    // bar. Optional — the bar stays hidden until the bot actually sends these.
    criteria: normalizeList(d.criteria),
  };
}

async function postChat(session, message, clientMsgId) {
  return fetch(url("/web/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      token: session.token,
      visitor_id: session.visitor_id,
      sig: session.sig,
      message,
      client_msg_id: clientMsgId,
    }),
  });
}

// Send a message; returns the fully normalized reply (content/title, products,
// suggestions, comparison, offer, understanding, status, confidence, routine,
// noResults, criteria) — every field additive, missing => not rendered.
export async function sendChatMessage(message) {
  let session = await ensureSession();
  const clientMsgId = newClientMsgId();

  let res = await postChat(session, message, clientMsgId);

  // Expired session -> re-bootstrap once, then retry.
  if (res.status === 403) {
    resetChatSession();
    session = await bootstrap();
    res = await postChat(session, message, clientMsgId);
  }

  if (!res.ok) throw new Error(`chat failed: ${res.status}`);

  return normalizeReply(await res.json());
}
