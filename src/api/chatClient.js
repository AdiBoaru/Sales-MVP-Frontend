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

// Normalize a bot product into the shape the widget consumes. All fields beyond
// name/price are optional — read defensively, a missing one just isn't rendered.
export function mapProduct(p) {
  if (!p) return null;
  const reviewCount = Number(p.review_count);
  return {
    product_id: p.product_id ?? null,
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
  };
}

// Normalize an optional product-comparison table (parity with iZi/eMAG). Returns
// null when absent or malformed so the widget renders nothing. Column prices are
// coerced like product prices; row `values` arrive already localized and are passed
// through verbatim (a null/empty cell becomes "—" in the UI).
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
        .map((row) => ({
          label: row.label,
          values: Array.isArray(row.values) ? row.values : [],
        }))
    : [];
  return { columns, rows };
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

// Pure normalization of a /web/chat reply into the shape the widget renders. Shared
// by sendChatMessage AND the contract-conformance tests, so tests exercise the REAL
// mapping (not a hand-rolled copy). Every field is additive — missing => not rendered.
export function normalizeReply(data) {
  const d = data || {};
  return {
    content: typeof d.content === "string" ? d.content : "",
    products: Array.isArray(d.products) ? d.products.map(mapProduct).filter(Boolean) : [],
    suggestions: Array.isArray(d.suggestions) ? d.suggestions.filter((s) => typeof s === "string") : [],
    comparison: mapComparison(d.comparison),
    offer: mapOffer(d.offer),
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

// Send a message; returns { content, products, suggestions, comparison, offer }.
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
