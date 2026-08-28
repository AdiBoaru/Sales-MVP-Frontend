// Widgetul v1 — calea SINCRONĂ `/web/chat`, neatinsă până la cutoverul NX-249.
//
// NX-244 a scos de aici tot ce ținea de protocolul v2. Nu ca refactor cosmetic: cât timp ambele
// protocoale trăiau în același fișier, fiecare linie era un `v2Active ? … : …`, iar „frontendul
// pasiv" al v2 împrumuta inevitabil euristicile v1 de alături (greetingul local, thinkingul
// simulat, coșul din localStorage). Acum v2 are propriul arbore (`src/chat/**`), iar fișierul
// ăsta rămâne exact ce era înainte de NX-243: v1, cu comportamentul lui, până la NX-249.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  MessageCircle, X, Plus, Minus, Check, ShoppingCart, Trash2,
  ChevronDown, Bookmark, ArrowRight, ArrowUp, Camera, Sparkle, Mic,
  SquarePen, MoreHorizontal,
} from "lucide-react";
import {
  sendChatMessage,
  resetChatSession,
  isChatConfigured,
} from "@/api/chatClient";
import { addToCart, useCart, useCartCount, setQuantity, removeItem } from "@/lib/cart";
import { useWishlist, removeWish } from "@/lib/wishlist";
import { formatCurrency } from "@/utils";
import { BRAND } from "@/lib/brand";
import ChatMessage from "@/components/store/ChatMessage";
import AriaMark from "@/components/store/AriaMark";
import { demoMessages } from "@/components/store/chatDemo";
import { ARIA_OPEN_EVENT } from "@/components/store/ariaOpenEvent";
import {
  COMPOSER_COUNTER_VISIBLE_AT,
  COMPOSER_MAX_LENGTH,
  exceedsComposerLimit,
  messageLength,
} from "@/chat/composerLimits";


const INITIAL_SUGGESTIONS = [
  "Recomandă-mi un ser pentru ten gras",
  "Ce cremă hidratantă e bună pentru ten uscat?",
  "Caut un cadou sub 100 lei",
  "Ai protecție solară SPF 50?",
];

function greeting() {
  return {
    role: "assistant",
    content: `Bună! Sunt **${BRAND.assistant}**, asistenta ta de cumpărături. Spune-mi ce cauți și îți găsesc produsele potrivite.`,
    suggestions: INITIAL_SUGGESTIONS,
  };
}

// Conversation persists across close/reopen and page navigation (the widget is
// mounted per-page, so without this it would reset on every route change). The
// bot keeps its own history server-side on visitor_id; this mirrors it for the UI.
// Cleared only by "Chat nou" (handleReset), which also resets the server session.
const MESSAGES_KEY = "aria-chat-messages";

function loadMessages() {
  try {
    const raw = localStorage.getItem(MESSAGES_KEY);
    const list = raw ? JSON.parse(raw) : null;
    return Array.isArray(list) && list.length ? list : [greeting()];
  } catch {
    return [greeting()];
  }
}

function isInitialWelcomeMessage(message, index) {
  return (
    index === 0 &&
    message?.role === "assistant" &&
    !message.products &&
    !message.comparison &&
    !message.offer
  );
}

// Preview / demo seeding — opens the widget with a rich sample conversation so the
// full design (understanding, routine, no-results, status, confidence, delta…) can be
// reviewed against the spec without waiting on the Python bot. Both flags seed a
// CLIENT-SIDE thread only: they never call the backend and never overwrite the saved
// conversation. `?preview=1` works everywhere (incl. production, for live visual review
// on a phone); `?demo=1` stays dev-only.
//
// NX-244: era o CONSTANTĂ evaluată la import. Citirea lui `window.location` la nivel de modul e
// un efect secundar pe care bundlerul nu îl poate dovedi inofensiv, așa că păstra fișierul ăsta
// (și verificarea lui `?preview=1`) în buildul v2, unde v1 trebuie să dispară complet. Ca funcție
// apelată din componentă, modulul devine curat și se elimină întreg. Comportamentul v1 e identic:
// se evaluează tot o singură dată, la primul render.
function isDemoMode() {
  if (typeof window === "undefined") return false;
  const p = new URLSearchParams(window.location.search);
  return p.get("preview") === "1" || (import.meta.env.DEV && p.get("demo") === "1");
}

// Progressive "thinking" timeline shown while waiting for Aria's reply. Steps are
// generic process copy (not fabricated product facts — the bot doesn't stream real
// reasoning steps today), revealed in sequence; collapsible while running, like the
// design prototype's timeline card.
//
// ⚠️ Progres SIMULAT cu timere locale. Rămâne aici fiindcă v1 rămâne, dar e exact ce NX-244 a
// refuzat pe v2: o afirmație despre ce face serverul, făcută de browser.
const THINKING_STEPS = ["Analizez cerința ta", "Caut în catalogul magazinului", "Pregătesc răspunsul"];

function ThinkingIndicator() {
  const [stage, setStage] = useState(0);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    const toStep1 = setTimeout(() => setStage(1), 1500);
    const toStep2 = setTimeout(() => setStage(2), 4500);
    return () => {
      clearTimeout(toStep1);
      clearTimeout(toStep2);
    };
  }, []);

  return (
    <div className="flex justify-start">
      {/* Inelul spinnerului era `rgba(47,102,76,0.2)` — VERDELE magazinului — cu capul
          violet deasupra: două branduri într-un cerc de 13px. Ambele culori vin acum
          din accent. */}
      <div className="w-full max-w-[85%] min-[380px]:w-[256px] aria-card rounded-2xl rounded-bl-md overflow-hidden aria-msg-in">
        <button
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="flex items-center gap-2.5 w-full px-3.5 py-3 text-left"
        >
          <span className="w-[14px] h-[14px] rounded-full border-2 border-[var(--aria-tint-2)] border-t-[var(--aria-purple)] aria-think-spinner shrink-0" />
          <span className="flex-1 text-[12.5px] font-semibold truncate text-[var(--aria-purple)]">
            {THINKING_STEPS[stage]}…
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-[var(--aria-text-5)] shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
        {expanded && (
          <div className="px-3.5 pb-3.5 flex flex-col gap-2">
            {THINKING_STEPS.map((label, i) => (
              <div key={i} className="flex items-center gap-2.5">
                {i < stage ? (
                  <Check className="w-3 h-3 text-[var(--aria-purple)] shrink-0" strokeWidth={3} />
                ) : i === stage ? (
                  <span className="w-1.5 h-1.5 rounded-full aria-gradient-bg aria-think-dot shrink-0" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full border border-[var(--aria-border-3)] shrink-0" />
                )}
                <span
                  className={`text-[11.5px] ${
                    i === stage
                      ? "text-[var(--aria-text)] font-semibold"
                      : i < stage
                        ? "text-[var(--aria-text-4)]"
                        : "text-[var(--aria-text-5)]"
                  }`}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// In-chat shopping cart. Reads the shared cart live, so adding a product from a
// chat card updates this list immediately. Editing (qty / remove) writes back to
// the same localStorage cart used by the /Cart page and the header badges.
function CartView({ onBack }) {
  const items = useCart();
  const total = items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0);
  const currency = items[0]?.currency || "RON";

  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 bg-[var(--aria-bg)]">
        {/* Tenta era `rgba(47,102,76,0.1)` — verde de magazin sub o iconiță violet. */}
        <div className="w-16 h-16 rounded-2xl bg-[var(--aria-tint)] border border-[var(--aria-tint-line)] flex items-center justify-center mb-4">
          <ShoppingCart className="w-7 h-7 text-[var(--aria-purple)]" strokeWidth={1.8} />
        </div>
        <h3 className="aria-h text-[var(--aria-text)]">Coșul tău e gol</h3>
        <p className="aria-small text-[var(--aria-text-4)] max-w-[260px] mt-1.5 mb-5">
          Adaugă produse din recomandările lui {BRAND.assistant} și le vei vedea aici.
        </p>
        <button
          onClick={onBack}
          className="text-[13px] font-semibold text-[var(--aria-purple)] bg-[var(--aria-tint)] hover:bg-[var(--aria-tint-2)] border border-[var(--aria-tint-line)] px-4 py-2 rounded-full transition-colors"
        >
          Înapoi la chat
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5 bg-[var(--aria-bg)]">
        {items.map((it) => (
          <div key={it.key} className="aria-card flex gap-3 p-2.5">
            <div className="w-14 h-14 rounded-[10px] bg-[var(--aria-surface-2)] border border-[var(--aria-border-2)] overflow-hidden flex-shrink-0 p-1">
              {it.image_url ? (
                <img src={it.image_url} alt={it.product_name} className="w-full h-full object-contain" />
              ) : null}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] font-semibold leading-[1.35] line-clamp-2 text-[var(--aria-text)]">
                {it.product_name}
              </p>
              <p className="aria-num text-[13px] font-bold mt-1 text-[var(--aria-price)]">
                {formatCurrency(it.price, it.currency)}
              </p>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-1 p-0.5 rounded-full border border-[var(--aria-border)] bg-[var(--aria-surface-2)]">
                  <button
                    onClick={() => setQuantity(it.key, it.quantity - 1)}
                    disabled={it.quantity <= 1}
                    title="Scade cantitatea"
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[var(--aria-text-3)] hover:bg-[var(--aria-surface)] hover:text-[var(--aria-text)] disabled:opacity-35 disabled:hover:bg-transparent transition-colors"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="aria-num text-[12px] font-bold w-5 text-center text-[var(--aria-text)]">
                    {it.quantity}
                  </span>
                  <button
                    onClick={() => setQuantity(it.key, it.quantity + 1)}
                    title="Crește cantitatea"
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[var(--aria-text-3)] hover:bg-[var(--aria-surface)] hover:text-[var(--aria-text)] transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <button
                  onClick={() => removeItem(it.key)}
                  title="Elimină din coș"
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--aria-text-5)] hover:text-[var(--aria-danger)] hover:bg-rose-50 transition-colors"
                >
                  <Trash2 className="w-[15px] h-[15px]" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Total + checkout — checkout lives on the full /Cart page (delivery form, payment). */}
      <div className="border-t border-[var(--aria-border-2)] bg-[var(--aria-surface)] p-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] flex-shrink-0 space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="aria-eyebrow text-[var(--aria-text-4)]">Total</span>
          <span className="aria-num text-[19px] font-extrabold tracking-[-0.02em] text-[var(--aria-price)]">
            {formatCurrency(total, currency)}
          </span>
        </div>
        <Link
          to="/Cart"
          className="block w-full text-center aria-gradient-bg text-white text-[14px] font-semibold py-3 rounded-[var(--aria-r-md)] shadow-[0_6px_18px_-6px_rgba(109,40,217,0.65)] hover:shadow-[0_10px_24px_-6px_rgba(109,40,217,0.75)] transition-shadow"
        >
          Finalizează comanda
        </Link>
      </div>
    </>
  );
}

// Bottom-sheet drawer listing saved (wishlisted) products, with a running total.
// Slides up over the conversation; closes on backdrop click or the X.
function SavedDrawer({ onClose }) {
  const items = useWishlist();
  const total = items.reduce((s, it) => s + (Number(it.price) || 0), 0);
  const currency = items[0]?.currency || "RON";
  const addAllToCart = () => {
    for (const it of items) {
      addToCart({
        product_id: null,
        product_name: it.name,
        price: it.price,
        currency: it.currency,
        image_url: it.image_url,
        url: it.url,
      });
    }
    onClose();
  };

  return (
    <div
      onClick={onClose}
      className="absolute inset-0 z-20 flex flex-col justify-end bg-black/30 backdrop-blur-[2px] aria-msg-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--aria-surface)] rounded-t-[20px] shadow-[0_-16px_50px_-12px_rgba(23,18,46,0.35)] border-t border-[var(--aria-border)] max-h-[75%] flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--aria-border-2)] flex-shrink-0">
          <span className="aria-h text-[15px] text-[var(--aria-text)]">Lista ta salvată</span>
          <button
            onClick={onClose}
            title="Închide"
            className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--aria-text-4)] hover:bg-[var(--aria-surface-2)]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {items.length === 0 ? (
          <p className="text-xs text-[var(--aria-text-3)] px-4 py-6 text-center">
            Nimic salvat încă. Apasă pe inimă pe orice recomandare.
          </p>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {items.map((it) => (
                <div key={it.key} className="flex items-center gap-3 bg-[var(--aria-surface-3)] border border-[var(--aria-border-2)] rounded-[12px] p-2">
                  <div className="w-11 h-11 rounded-[9px] bg-[var(--aria-surface)] overflow-hidden flex-shrink-0 border border-[var(--aria-border-2)] p-1">
                    {it.image_url ? (
                      <img src={it.image_url} alt={it.name} className="w-full h-full object-contain" />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold leading-[1.35] line-clamp-2 text-[var(--aria-text)]">{it.name}</p>
                    <p className="aria-num text-[12.5px] font-bold mt-0.5 text-[var(--aria-price)]">
                      {formatCurrency(it.price, it.currency)}
                    </p>
                  </div>
                  <button
                    onClick={() => removeWish(it.key)}
                    title="Elimină din listă"
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--aria-text-5)] hover:bg-[var(--aria-border-2)] transition-colors shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="border-t border-[var(--aria-border-2)] p-3 flex-shrink-0 space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="aria-eyebrow text-[var(--aria-text-4)]">Total estimat</span>
                <span className="aria-num text-[16px] font-extrabold tracking-[-0.02em] text-[var(--aria-price)]">
                  {formatCurrency(total, currency)}
                </span>
              </div>
              {/* Umbra era `rgba(47,102,76,0.3)` — verde — sub un buton violet. */}
              <button
                type="button"
                onClick={addAllToCart}
                className="w-full py-3 rounded-[var(--aria-r-md)] aria-gradient-bg text-white text-[13.5px] font-semibold shadow-[0_6px_18px_-6px_rgba(109,40,217,0.65)] hover:shadow-[0_10px_24px_-6px_rgba(109,40,217,0.75)] transition-shadow"
              >
                Adaugă tot în coș
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Scroll `container` so the top of `node` sits near the top of the viewport (small
// pad above it). For the last, long bot reply this reads from the start; for a short
// reply the browser clamps scrollTop and it just stays fully visible.
function scrollNodeToTop(container, node, pad = 10) {
  const top = node.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
  container.scrollTop = Math.max(0, top - pad);
}

// Within a couple of pixels of the end. The slack absorbs sub-pixel layout rounding,
// which otherwise leaves the jump-to-end chevron showing on an already-ended thread.
function isScrolledToEnd(el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 24;
}

// Visual-search button in the composer — the camera-with-sparkle the reference puts
// at the composer's bottom-left. It opens a real picker, but /web/chat carries a
// single text `message` and nothing else, so an image has nowhere to go yet: the
// handler says so instead of silently discarding the file.
function CameraButton({ onPick, disabled }) {
  const fileRef = useRef(/** @type {HTMLInputElement | null} */ (null));

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) onPick();
          e.target.value = ""; // let the same file be picked again
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => fileRef.current?.click()}
        title="Caută după imagine"
        className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[var(--aria-accent-line)] hover:bg-[var(--aria-border-2)] disabled:opacity-40 transition-colors"
      >
        <span className="relative inline-flex">
          <Camera className="w-[21px] h-[21px]" strokeWidth={1.7} />
          <Sparkle className="absolute -top-[3px] -left-[5px] w-[11px] h-[11px] fill-current" strokeWidth={0} />
        </span>
      </button>
    </>
  );
}

// Microfonul din composer, alături de cameră și de butonul de trimitere.
// Feature-detectat: se randează DOAR unde dictarea chiar funcționează (Web Speech
// API), ca să nu existe un control mort pe Firefox. Textul dictat se adaugă în
// input, nu se trimite singur — utilizatorul îl vede înainte să apese trimite.
function MicButton({ onTranscript, disabled }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(/** @type {any} */ (null));
  const w = /** @type {any} */ (typeof window !== "undefined" ? window : {});
  const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!SR) return null;

  const toggle = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new SR();
    rec.lang = "ro-RO";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const t = e.results?.[0]?.[0]?.transcript;
      if (t) onTranscript(t.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      title={listening ? "Ascult… apasă pentru stop" : "Dictează"}
      className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-40 transition-colors ${
        listening
          ? "text-[var(--aria-purple)] bg-[var(--aria-tint-2)]"
          : "text-[var(--aria-text-4)] hover:bg-[var(--aria-border-2)] hover:text-[var(--aria-text-2)]"
      }`}
    >
      <Mic className="w-[18px] h-[18px]" strokeWidth={1.9} />
    </button>
  );
}

// The "⋯" header menu. The reference keeps its header to four controls — new chat,
// wordmark, overflow, close — so the saved list and the cart live in here rather
// than as their own buttons.
function HeaderMenu({ savedCount, cartCount, showCart, onSaved, onCart }) {
  const [open, setOpen] = useState(false);

  const Item = ({ icon: Icon, label, count, onClick }) => (
    <button
      type="button"
      onClick={() => {
        setOpen(false);
        onClick();
      }}
      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] font-medium text-[var(--aria-text)] hover:bg-[var(--aria-surface-2)] transition-colors"
    >
      <Icon className="w-4 h-4 shrink-0 text-[var(--aria-text-4)]" />
      <span className="flex-1">{label}</span>
      {count > 0 && (
        <span className="aria-num shrink-0 min-w-[19px] px-1.5 py-px rounded-full bg-[var(--aria-tint)] text-[10.5px] font-bold text-center text-[var(--aria-purple)]">
          {count}
        </span>
      )}
    </button>
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Mai multe"
        className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--aria-text-3)] hover:bg-[var(--aria-surface-2)] transition-colors"
      >
        <MoreHorizontal className="w-[18px] h-[18px]" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-40 w-52 py-1 rounded-[var(--aria-r-md)] border border-[var(--aria-border)] bg-[var(--aria-surface)] shadow-[var(--aria-shadow-2)] overflow-hidden">
            <Item icon={Bookmark} label="Lista salvată" count={savedCount} onClick={onSaved} />
            <Item
              icon={ShoppingCart}
              label={showCart ? "Înapoi la chat" : "Coșul tău"}
              count={cartCount}
              onClick={onCart}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default function ChatWidget() {
  // Evaluat o singură dată, la montare — ca înainte, când era constantă de modul.
  const [DEMO] = useState(isDemoMode);
  const [open, setOpen] = useState(DEMO);
  const [showCart, setShowCart] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [messages, setMessages] = useState(() => (DEMO ? demoMessages() : loadMessages()));
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  // Plafonul de lungime al mesajului, aceeași sursă ca pe calea v2. Se măsoară pe textul trimis
  // (deci trimmed), ca butonul să nu se închidă pentru spații de la coadă.
  const inputLength = messageLength(input.trim());
  const inputOverLimit = inputLength > COMPOSER_MAX_LENGTH;

  const busy = sending;
  const [toast, setToast] = useState(/** @type {string | null} */ (null));
  // Drives the floating "jump to the end" chevron above the composer. It appears
  // exactly when there is conversation below the fold — including right after a new
  // bot reply, which we align to its own top rather than to the bottom.
  const [atBottom, setAtBottom] = useState(true);
  const cartCount = useCartCount();
  const wishlist = useWishlist();
  const scrollRef = useRef(null);
  const lastMsgRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  // Message-count baseline: seeded from the initial thread so the first render never
  // "top-aligns" a pre-existing reply; updated on every change below.
  const prevLenRef = useRef(messages.length);
  const toastTimer = useRef(/** @type {any} */ (null));

  // "Rețin" memory bar: the accumulated, de-duplicated search criteria the bot has
  // extracted so far (e.g. "sub 600 lei", "ANC"). Derived from message history
  // (not separate state) so it survives reload/reset for free and never drifts.
  const criteria = useMemo(() => {
    const seen = [];
    for (const m of messages) {
      if (m.role !== "assistant" || !Array.isArray(m.criteria)) continue;
      for (const c of m.criteria) if (!seen.includes(c)) seen.push(c);
    }
    return seen;
  }, [messages]);

  // Briefly show a confirmation toast (e.g. after adding a product to the cart).
  const showToast = (msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  // Clear any pending toast timer on unmount.
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Open via event or ?chat=1, then clean the URL param.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(ARIA_OPEN_EVENT, onOpen);
    const params = new URLSearchParams(window.location.search);
    if (params.get("chat") === "1") {
      setOpen(true);
      params.delete("chat");
      const qs = params.toString();
      window.history.replaceState({}, document.title, window.location.pathname + (qs ? `?${qs}` : ""));
    }
    return () => window.removeEventListener(ARIA_OPEN_EVENT, onOpen);
  }, []);

  // On open, jump to the latest (bottom) — the panel remounts each time, so scrollTop
  // starts at 0 otherwise.
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setAtBottom(true);
    }
  }, [open]);

  // Scroll behavior on new messages:
  //   • a NEW bot reply -> align the TOP of that message to the top of the viewport, so
  //     the reader starts at its beginning (long hero/routine replies used to jump to
  //     the very bottom, hiding the start).
  //   • your own message, the thinking indicator, or anything else -> the conventional
  //     jump-to-bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const grew = messages.length > prevLenRef.current;
    prevLenRef.current = messages.length; // keep the baseline current (incl. reset/shrink)
    const lastIsAssistant = messages[messages.length - 1]?.role === "assistant";
    if (grew && lastIsAssistant && lastMsgRef.current) {
      // A new bot reply: align its top so the reader starts at the beginning (long
      // hero/routine replies used to jump to the very bottom). One frame's delay lets
      // the freshly-rendered reply settle to its final height first.
      requestAnimationFrame(() => {
        if (scrollRef.current && lastMsgRef.current) {
          scrollNodeToTop(scrollRef.current, lastMsgRef.current);
          setAtBottom(isScrolledToEnd(scrollRef.current));
        }
      });
    } else {
      // Your own message, the thinking indicator, or a reset: conventional bottom.
      el.scrollTop = el.scrollHeight;
      setAtBottom(true);
    }
  }, [messages, busy]);

  // Mirror the conversation to localStorage so closing (X) or navigating keeps it.
  // Skipped in demo mode so the sample thread never overwrites a real conversation.
  useEffect(() => {
    if (DEMO) return;
    try {
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
    } catch {
      /* ignore quota / private mode */
    }
  }, [messages]);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message) return;
    // Același plafon ca pe calea v2 — altfel flagul `VITE_CHAT_PROTOCOL_V2` ar schimba nu doar
    // protocolul, ci și ce are voie clientul să scrie. Se refuză, nu se trunchiază.
    if (exceedsComposerLimit(message)) return;

    if (sending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: message }]);
    setSending(true);

    try {
      if (!isChatConfigured) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              "Asistentul nu este configurat momentan (lipsește `VITE_CHAT_PUBLIC_TOKEN`). Între timp, poți căuta produse direct în magazin.",
          },
        ]);
        return;
      }
      const reply = await sendChatMessage(message);
      // reply already normalized: { content, products, suggestions, comparison, offer }.
      setMessages((m) => [...m, { role: "assistant", ...reply }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "A apărut o eroare. Mai încearcă o dată în câteva momente." },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleReset = () => {
    resetChatSession();
    try {
      localStorage.removeItem(MESSAGES_KEY);
    } catch {
      /* ignore */
    }
    setMessages([greeting()]);
  };

  // Before the first user message we show a centered welcome screen instead of the thread.
  const hasConversation = messages.some((m) => m.role === "user");
  const visibleMessages = hasConversation
    ? messages.filter((msg, i) => !isInitialWelcomeMessage(msg, i))
    : messages;

  return (
    <>
      {/* Floating button */}
      {!open && (
        // `nx-chat-launcher` NU e decorativ: launcherul stă în afara lui `.aria-widget`,
        // deci fără clasa asta `aria-gradient-bg` se rezolva la gradientul VERDE al
        // magazinului — butonul verde deschidea un panel violet. Vezi index.css.
        // `shadow-brand-300/60` era aceeași greșeală, în umbră.
        <button
          onClick={() => setOpen(true)}
          className="nx-chat-launcher fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 aria-gradient-bg text-white text-[14px] font-semibold pl-4 pr-5 py-3 rounded-full min-h-[44px]"
        >
          <MessageCircle className="w-4 h-4" strokeWidth={2.2} />
          <span className="hidden sm:inline">{BRAND.assistant}</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="aria-widget nx-chat-panel fixed inset-y-0 right-0 z-50 w-full max-w-full sm:w-[452px] bg-[var(--aria-surface)] border-l border-[var(--aria-border-2)] flex flex-col">
          {/* Linia de accent de sus — aceeași semnătură ca pe calea v2. Două pixeli de
              gradient sunt tot ce trebuie ca panoul să înceapă cu brandul, în locul unei
              margini gri. */}
          <div className="h-[2px] aria-gradient-bg flex-shrink-0" />
          {/* Header — the reference's four slots: "new chat" left, the wordmark dead
              centre, then overflow and close. The wordmark is positioned absolutely so
              it stays centred on the panel regardless of how wide the two sides get. */}
          <div className="relative flex items-center justify-between gap-2 px-3 py-3 border-b border-[var(--aria-border-2)] flex-shrink-0 bg-[var(--aria-surface)]">
            <button
              onClick={handleReset}
              title="Începe un chat nou"
              className="relative z-10 inline-flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 rounded-full border border-[var(--aria-border-3)] bg-[var(--aria-surface)] text-[12px] font-semibold text-[var(--aria-text-2)] hover:text-[var(--aria-purple)] hover:border-[var(--aria-tint-line)] hover:bg-[var(--aria-tint)] transition-colors"
            >
              <SquarePen className="w-[14px] h-[14px]" strokeWidth={2} />
              <span>Chat nou</span>
            </button>

            <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
              <AriaMark size={24} />
              <span className="relative">
                {/* „BETA" ca superscript peste numele mărcii: la 7px era o pată, iar
                    tracking-ul îl face să se citească ca etichetă, nu ca zgomot. */}
                <span className="absolute -top-[7px] left-0 text-[7.5px] font-bold leading-none tracking-[0.14em] text-[var(--aria-text-5)]">
                  BETA
                </span>
                <span className="aria-heading text-[20px] leading-none tracking-[-0.022em] text-[var(--aria-text)]">
                  {BRAND.assistant}
                </span>
              </span>
            </div>

            <div className="relative z-10 flex items-center gap-0.5 shrink-0">
              <HeaderMenu
                savedCount={wishlist.length}
                cartCount={cartCount}
                showCart={showCart}
                onSaved={() => setSavedOpen((s) => !s)}
                onCart={() => setShowCart((s) => !s)}
              />
              <button
                onClick={() => setOpen(false)}
                title="Închide"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--aria-text-4)] hover:bg-[var(--aria-surface-2)] hover:text-[var(--aria-text-2)] transition-colors"
              >
                <X className="w-[18px] h-[18px]" />
              </button>
            </div>
          </div>

          {/* "Rețin" memory bar — the criteria Aria has extracted so far. Hidden
              until the bot actually sends `criteria` on a reply. */}
          {criteria.length > 0 && !showCart && (
            // Pastilele erau tentate cu VERDELE magazinului (`rgba(47,102,76,…)`) și
            // scriau cu violet peste el, iar bulina era cyan (#38BDF8) — trei culori
            // străine într-o bară de 28px. Totul vine acum din accent.
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--aria-border-2)] bg-[var(--aria-surface-3)] overflow-x-auto flex-shrink-0">
              <span className="aria-eyebrow text-[9px] text-[var(--aria-text-4)] shrink-0">Rețin</span>
              {criteria.map((c, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[var(--aria-tint)] border border-[var(--aria-tint-line)] rounded-full text-[11px] font-medium text-[var(--aria-purple)] whitespace-nowrap shrink-0"
                >
                  <span className="w-1 h-1 rounded-full bg-[var(--aria-purple)] shrink-0" />
                  {c}
                </span>
              ))}
            </div>
          )}

          {/* Cart view takes over the body when toggled from the header. */}
          {showCart ? (
            <CartView onBack={() => setShowCart(false)} />
          ) : /* Welcome state — shown until the first user message, matching the design's
                 left-aligned intro + vertical list of suggested prompts (not centered pills). */
          !hasConversation ? (
            <div className="flex-1 overflow-y-auto flex flex-col justify-center gap-6 min-[380px]:gap-7 px-4 min-[380px]:px-6 py-6 min-[380px]:py-8 bg-[var(--aria-bg)]">
              <AriaMark size={56} innerSize={40} className="mx-auto" />
              <div className="flex flex-col items-center gap-2.5 text-center">
                <h3 className="aria-display text-[var(--aria-text)]">Bună! Sunt {BRAND.assistant}.</h3>
                <p className="aria-small text-[var(--aria-text-4)] max-w-[310px]">
                  Spune-mi ce cauți. Analizez catalogul, compar opțiunile și îți explic exact de ce recomand ceva,
                  nu doar ce.
                </p>
              </div>
              {/* Sugestiile intră decalat, ca o listă care se așază, nu ca patru
                  dreptunghiuri apărute deodată. */}
              <div className="aria-stagger flex flex-col gap-2">
                {INITIAL_SUGGESTIONS.map((s, j) => (
                  <button
                    key={j}
                    onClick={() => send(s)}
                    className="group flex items-center gap-3 text-left px-3.5 min-[380px]:px-4 py-3 min-[380px]:py-3.5 aria-card aria-card-interactive text-[13.5px] leading-snug text-[var(--aria-text-2)] hover:text-[var(--aria-text)]"
                  >
                    <span className="w-1.5 h-1.5 rounded-full aria-gradient-bg shrink-0" />
                    <span className="flex-1">{s}</span>
                    <ArrowRight className="w-4 h-4 text-[var(--aria-text-5)] shrink-0 transition-all group-hover:translate-x-0.5 group-hover:text-[var(--aria-purple)]" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
          <div
            ref={scrollRef}
            onScroll={(e) => setAtBottom(isScrolledToEnd(e.currentTarget))}
            className="flex-1 overflow-y-auto px-3 min-[380px]:px-4 py-5 min-[380px]:py-6 space-y-7 bg-[var(--aria-bg)]"
          >
            {visibleMessages.map((msg, i) => (
              <div key={i} ref={i === visibleMessages.length - 1 ? lastMsgRef : null}>
                <ChatMessage
                  message={msg}
                  isFirst={i === 0}
                  onSuggestion={send}
                  onQuickReply={send}
                  onToast={showToast}
                />
              </div>
            ))}

            {sending && <ThinkingIndicator />}
          </div>
          )}

          {/* The input belongs to the chat; the cart view has its own footer. The AI
              disclaimer is no longer pinned here — it sits under each bot answer
              (ChatMessage), the way the reference design shows it. */}
          {!showCart && (
            <div className="relative flex-shrink-0 bg-[var(--aria-surface)] border-t border-[var(--aria-border-2)] px-3 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              {/* Jump to the end — floats over the conversation just above the composer,
                  and only while there is something below the fold. */}
              {hasConversation && !atBottom && (
                <button
                  type="button"
                  onClick={() => {
                    const el = scrollRef.current;
                    if (!el) return;
                    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
                  }}
                  title="Mergi la sfârșitul conversației"
                  className="absolute -top-5 left-1/2 -translate-x-1/2 z-10 w-9 h-9 rounded-full bg-[var(--aria-surface)] border border-[var(--aria-border)] shadow-[var(--aria-shadow-2)] flex items-center justify-center text-[var(--aria-text-4)] hover:text-[var(--aria-purple)] transition-colors"
                >
                  <ChevronDown className="w-[18px] h-[18px]" />
                </button>
              )}

              {/* Composer — pilula din referință: câmpul și TOATE controalele pe același
                  rând. Camera pe rândul de dedesubt împingea composerul la două etaje
                  degeaba și rupea forma rotundă din design.
                  Fără `focus-within:border` aici: la click nu se schimbă nimic vizual
                  (indicatorul de tastatură e în index.css, pe `[data-nav="kbd"]`). */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="nx-composer-pill flex items-center gap-0.5 pl-4 pr-1.5 py-1 bg-[var(--aria-surface-2)] border border-[var(--aria-border)] rounded-full"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Caută produse sau inspirație"
                  aria-invalid={inputOverLimit}
                  className="flex-1 min-w-0 bg-transparent border-none outline-none text-[15px] tracking-[-0.008em] text-[var(--aria-text)] placeholder:text-[var(--aria-text-5)] py-2.5 disabled:opacity-60"
                />
                {inputLength > COMPOSER_COUNTER_VISIBLE_AT ? (
                  <span
                    aria-hidden="true"
                    className={`aria-num text-[11px] shrink-0 ${
                      inputOverLimit ? "text-[var(--aria-danger)] font-semibold" : "text-[var(--aria-text-5)]"
                    }`}
                  >
                    {inputLength}/{COMPOSER_MAX_LENGTH}
                  </span>
                ) : null}
                <CameraButton
                  disabled={busy}
                  onPick={() => showToast("Căutarea după imagine ajunge în curând.")}
                />
                <MicButton
                  disabled={busy}
                  onTranscript={(t) => setInput((v) => (v.trim() ? `${v.trim()} ${t}` : t))}
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim() || inputOverLimit}
                  title="Trimite"
                  className="ml-1 w-9 h-9 rounded-full aria-gradient-bg text-white flex items-center justify-center shrink-0 shadow-[0_3px_10px_-2px_rgba(109,40,217,0.55)] disabled:shadow-none disabled:opacity-40 transition-all"
                >
                  <ArrowUp className="w-[18px] h-[18px]" strokeWidth={2.5} />
                </button>
              </form>
            </div>
          )}

          {/* Add-to-cart confirmation toast */}
          {toast && (
            <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 z-10 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center gap-2 bg-[var(--aria-text)] text-white text-[13px] font-medium pl-3 pr-4 py-2.5 rounded-full shadow-[0_10px_30px_-8px_rgba(23,18,46,0.6)] whitespace-nowrap">
                <span className="w-4 h-4 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                  <Check className="w-2.5 h-2.5" strokeWidth={3.5} />
                </span>
                {toast}
              </div>
            </div>
          )}

          {/* Saved-products bottom sheet — overlays the conversation, never the cart view. */}
          {savedOpen && !showCart && <SavedDrawer onClose={() => setSavedOpen(false)} />}
        </div>
      )}
    </>
  );
}
