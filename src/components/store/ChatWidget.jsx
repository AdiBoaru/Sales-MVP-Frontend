import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles, X, Send, Plus, Minus, Check, ShoppingCart, Trash2,
  ChevronDown, Bookmark, ArrowRight, Mic,
} from "lucide-react";
import { sendChatMessage, resetChatSession, isChatConfigured } from "@/api/chatClient";
import { addToCart, useCart, useCartCount, setQuantity, removeItem } from "@/lib/cart";
import { useWishlist, removeWish } from "@/lib/wishlist";
import { formatCurrency } from "@/utils";
import { BRAND } from "@/lib/brand";
import ChatMessage from "@/components/store/ChatMessage";
import AriaMark from "@/components/store/AriaMark";
import { demoMessages } from "@/components/store/chatDemo";

const ARIA_OPEN_EVENT = "aria:open";

// Programmatic open from anywhere (e.g. the store header "Ask Aria" button).
export function openAria() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(ARIA_OPEN_EVENT));
}

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

// Demo mode: open the store with `?demo=1` (dev only) to seed the chat with a rich
// sample conversation, so the card's visual layer can be reviewed against the design
// without waiting on the Python bot. Never active in a production build.
const DEMO =
  typeof window !== "undefined" &&
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get("demo") === "1";

// Progressive "thinking" timeline shown while waiting for Aria's reply. Steps are
// generic process copy (not fabricated product facts — the bot doesn't stream real
// reasoning steps today), revealed in sequence; collapsible while running, like the
// design prototype's timeline card.
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
      <div className="w-full max-w-[85%] min-[380px]:w-[248px] bg-white border border-[var(--aria-border)] rounded-2xl rounded-bl-md shadow-sm overflow-hidden aria-msg-in">
        <button
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-left"
        >
          <span className="w-[13px] h-[13px] rounded-full border-2 border-[rgba(124,58,237,0.2)] border-t-[#7C3AED] aria-think-spinner shrink-0" />
          <span className="flex-1 text-xs font-medium truncate text-[var(--aria-purple)]">
            {THINKING_STEPS[stage]}…
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-[var(--aria-text-5)] shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
        {expanded && (
          <div className="px-3.5 pb-3 flex flex-col gap-1.5">
            {THINKING_STEPS.map((label, i) => (
              <div key={i} className="flex items-center gap-2">
                {i < stage ? (
                  <Check className="w-3 h-3 text-[var(--aria-purple)] shrink-0" strokeWidth={3} />
                ) : i === stage ? (
                  <span className="w-1.5 h-1.5 rounded-full aria-gradient-bg aria-think-dot shrink-0" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full border border-[#C9C4D8] shrink-0" />
                )}
                <span
                  className={`text-[11px] ${
                    i === stage
                      ? "text-[var(--aria-text)] font-medium"
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
        <div className="w-16 h-16 rounded-2xl bg-[rgba(124,58,237,0.1)] flex items-center justify-center mb-4">
          <ShoppingCart className="w-8 h-8 text-[var(--aria-purple)]" />
        </div>
        <h3 className="aria-heading text-lg text-[var(--aria-text)]">Coșul tău e gol</h3>
        <p className="text-sm text-[var(--aria-text-4)] max-w-[260px] mt-1 mb-5">
          Adaugă produse din recomandările lui {BRAND.assistant} și le vei vedea aici.
        </p>
        <button
          onClick={onBack}
          className="text-sm font-semibold text-[var(--aria-purple)] bg-[rgba(124,58,237,0.07)] hover:bg-[rgba(124,58,237,0.12)] px-4 py-2 rounded-full transition-colors"
        >
          Înapoi la chat
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 bg-[var(--aria-bg)]">
        {items.map((it) => (
          <div key={it.key} className="flex gap-3 bg-white border border-[var(--aria-border)] rounded-xl p-2.5 shadow-sm">
            <div className="w-14 h-14 rounded-lg bg-[var(--aria-surface-2)] overflow-hidden flex-shrink-0">
              {it.image_url ? (
                <img src={it.image_url} alt={it.product_name} className="w-full h-full object-cover" />
              ) : null}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold leading-snug line-clamp-2">{it.product_name}</p>
              <p className="text-xs font-bold mt-0.5">{formatCurrency(it.price, it.currency)}</p>
              <div className="flex items-center justify-between mt-1.5">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setQuantity(it.key, it.quantity - 1)}
                    disabled={it.quantity <= 1}
                    title="Scade cantitatea"
                    className="w-6 h-6 rounded-md border border-[var(--aria-border)] flex items-center justify-center hover:bg-[var(--aria-surface-2)] disabled:opacity-40 transition-colors"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="text-xs font-semibold w-5 text-center">{it.quantity}</span>
                  <button
                    onClick={() => setQuantity(it.key, it.quantity + 1)}
                    title="Crește cantitatea"
                    className="w-6 h-6 rounded-md border border-[var(--aria-border)] flex items-center justify-center hover:bg-[var(--aria-surface-2)] transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <button
                  onClick={() => removeItem(it.key)}
                  title="Elimină din coș"
                  className="text-muted-foreground hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Total + checkout — checkout lives on the full /Cart page (delivery form, payment). */}
      <div className="border-t border-[var(--aria-border-2)] bg-white p-3 flex-shrink-0 space-y-2.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--aria-text-4)]">Total</span>
          <span className="aria-heading text-[var(--aria-text)]">{formatCurrency(total, currency)}</span>
        </div>
        <Link
          to="/Cart"
          className="block w-full text-center aria-gradient-bg hover:opacity-90 text-white text-sm font-semibold py-2.5 rounded-xl transition-opacity"
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
        className="bg-white rounded-t-2xl shadow-2xl border-t border-[var(--aria-border)] max-h-[75%] flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--aria-border-2)] flex-shrink-0">
          <span className="aria-heading text-sm text-[var(--aria-text)]">Lista ta salvată</span>
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
                <div key={it.key} className="flex items-center gap-3 bg-[var(--aria-surface-3)] border border-[var(--aria-border-2)] rounded-xl p-2">
                  <div className="w-11 h-11 rounded-lg bg-white overflow-hidden flex-shrink-0 border border-[var(--aria-border-2)]">
                    {it.image_url ? (
                      <img src={it.image_url} alt={it.name} className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold leading-snug line-clamp-2 text-[var(--aria-text)]">{it.name}</p>
                    <p className="aria-heading text-xs mt-0.5 text-[var(--aria-text)]">{formatCurrency(it.price, it.currency)}</p>
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
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--aria-text-4)]">Total estimat</span>
                <span className="aria-heading text-sm text-[var(--aria-text)]">{formatCurrency(total, currency)}</span>
              </div>
              <button
                type="button"
                onClick={addAllToCart}
                className="w-full py-3 rounded-xl aria-gradient-bg text-white text-[13px] font-semibold shadow-[0_6px_20px_rgba(109,40,217,0.3)] hover:opacity-90 transition-opacity"
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

// Ghost microphone button in the composer (matches the design's mic + send pair).
// Wired to the browser Web Speech API and feature-detected: it renders ONLY where
// dictation actually works, so there's never a dead control. Dictated text is
// appended to the input for the user to review before sending.
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
      className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
        listening
          ? "text-[var(--aria-purple)] bg-[rgba(124,58,237,0.1)]"
          : "text-[var(--aria-text-3)] hover:bg-[var(--aria-border-2)]"
      }`}
    >
      <Mic className="w-4 h-4" />
    </button>
  );
}

export default function ChatWidget() {
  const [open, setOpen] = useState(DEMO);
  const [showCart, setShowCart] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [messages, setMessages] = useState(() => (DEMO ? demoMessages() : loadMessages()));
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState(/** @type {string | null} */ (null));
  const cartCount = useCartCount();
  const wishlist = useWishlist();
  const scrollRef = useRef(null);
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

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, sending]);

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
    if (!message || sending) return;
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
    } catch (err) {
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
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 aria-gradient-bg hover:opacity-90 text-white font-semibold pl-4 pr-5 py-3 rounded-full shadow-lg shadow-violet-300/60 transition-opacity"
        >
          <Sparkles className="w-4 h-4" />
          <span className="hidden sm:inline">{BRAND.assistant}</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="aria-widget fixed inset-y-0 right-0 z-50 w-full max-w-full sm:w-[452px] bg-white border-l border-[var(--aria-border-2)] shadow-2xl flex flex-col">
          {/* Brand accent bar */}
          <div className="h-[2px] aria-gradient-bg flex-shrink-0" />

          {/* Header */}
          <div className="flex items-center justify-between gap-2 min-[380px]:gap-3 px-3 min-[380px]:px-[18px] py-3 min-[380px]:py-3.5 border-b border-[var(--aria-border-2)] flex-shrink-0">
            {/* Left: "new chat" — only once the user has sent a message */}
            <div className="flex items-center gap-2 min-[380px]:gap-3 min-w-0 flex-1">
              <AriaMark size={30} className="min-[380px]:hidden" />
              <AriaMark size={34} className="hidden min-[380px]:grid" />
              <div className="min-w-0">
                <div className="aria-heading text-base leading-tight text-[var(--aria-text)]">{BRAND.assistant}</div>
                <div className="hidden min-[360px]:block text-[10.5px] leading-tight tracking-[0.04em] text-[var(--aria-text-3)] truncate">
                  Consultant de cumpărături · {BRAND.name}
                </div>
              </div>
              {hasConversation && (
                <button
                  onClick={handleReset}
                  title="Începe un chat nou"
                  className="hidden min-[430px]:inline-flex items-center gap-1 text-xs font-medium text-[var(--aria-purple)] bg-[rgba(124,58,237,0.07)] hover:bg-[rgba(124,58,237,0.12)] px-2.5 py-1 rounded-full transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Chat nou
                </button>
              )}
            </div>

            {/* Right: saved + cart toggle + close */}
            <div className="flex items-center gap-0.5 min-[380px]:gap-1 shrink-0">
              <button
                onClick={() => setSavedOpen((s) => !s)}
                title="Lista salvată"
                className="relative inline-flex items-center gap-1 min-[380px]:gap-1.5 h-8 px-2 min-[380px]:px-3 rounded-full border border-[var(--aria-border-3)] bg-white text-[12px] font-medium text-[var(--aria-text-2)] hover:border-[var(--aria-purple)] transition-colors"
              >
                <Bookmark className="w-4 h-4" />
                <span>{wishlist.length}</span>
              </button>
              <button
                onClick={() => setShowCart((s) => !s)}
                title={showCart ? "Înapoi la chat" : "Vezi coșul"}
                className={`relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  showCart ? "bg-[rgba(124,58,237,0.1)] text-[var(--aria-purple)]" : "text-[var(--aria-text-3)] hover:bg-[var(--aria-surface-2)]"
                }`}
              >
                <ShoppingCart className="w-4 h-4" />
                {cartCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 aria-gradient-bg text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setOpen(false)}
                title="Închide"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--aria-text-3)] hover:bg-[var(--aria-surface-2)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* "Rețin" memory bar — the criteria Aria has extracted so far. Hidden
              until the bot actually sends `criteria` on a reply. */}
          {criteria.length > 0 && !showCart && (
            <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--aria-border-2)] bg-[var(--aria-surface-2)] overflow-x-auto flex-shrink-0">
              <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--aria-text-3)] shrink-0">Rețin</span>
              {criteria.map((c, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[rgba(124,58,237,0.07)] border border-[rgba(124,58,237,0.22)] rounded-full text-[11px] text-[var(--aria-purple)] whitespace-nowrap shrink-0"
                >
                  <span className="w-1 h-1 rounded-full bg-[#38BDF8] shrink-0" />
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
            <div className="flex-1 overflow-y-auto flex flex-col justify-center gap-5 min-[380px]:gap-6 px-4 min-[380px]:px-6 py-6 min-[380px]:py-8 bg-[var(--aria-bg)]">
              <AriaMark size={52} innerSize={38} className="mx-auto" />
              <div className="flex flex-col items-center gap-2 text-center">
                <h3 className="aria-heading text-2xl text-[var(--aria-text)]">Bună! Sunt {BRAND.assistant}.</h3>
                <p className="text-[13.5px] leading-relaxed text-[var(--aria-text-4)] max-w-[320px]">
                  Spune-mi ce cauți. Analizez catalogul, compar opțiunile și îți explic exact de ce recomand ceva —
                  nu doar ce.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {INITIAL_SUGGESTIONS.map((s, j) => (
                  <button
                    key={j}
                    onClick={() => send(s)}
                    className="flex items-center gap-3 text-left px-3.5 min-[380px]:px-4 py-3 min-[380px]:py-3.5 bg-white border border-[var(--aria-border)] rounded-[13px] text-[13px] text-[var(--aria-text-2)] shadow-sm hover:border-[var(--aria-purple)] hover:shadow-md transition-all"
                  >
                    <span className="w-1.5 h-1.5 rounded-full aria-gradient-bg shrink-0" />
                    <span className="flex-1">{s}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[var(--aria-text-5)] shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 min-[380px]:px-4 py-4 min-[380px]:py-5 space-y-4 bg-[var(--aria-bg)]">
            {visibleMessages.map((msg, i) => (
              <ChatMessage
                key={i}
                message={msg}
                isFirst={i === 0}
                onSuggestion={send}
                onQuickReply={send}
                onToast={showToast}
              />
            ))}

            {sending && <ThinkingIndicator />}
          </div>
          )}

          {/* Disclaimer + input belong to the chat; the cart view has its own footer. */}
          {!showCart && (
            <>
              {/* Scope disclaimer — pinned at the bottom of the conversation area, centered */}
              <p className="text-[10px] leading-tight text-center text-[var(--aria-text-5)] bg-[var(--aria-bg)] px-4 pt-0.5 pb-1.5 flex-shrink-0">
                {BRAND.assistant} caută doar în catalogul acestui magazin · recomandări argumentate
              </p>

              {/* Input — single pill containing the field + send button, like the design. */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-[var(--aria-border-2)] bg-white flex-shrink-0"
              >
                <div className="flex items-center gap-2 pl-4 pr-1.5 py-1 bg-[var(--aria-surface-2)] border border-[var(--aria-border)] rounded-full focus-within:border-[var(--aria-purple)] transition-colors">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Întreabă orice despre produse..."
                    className="flex-1 min-w-0 bg-transparent border-none outline-none text-[13px] text-[var(--aria-text)] placeholder:text-[var(--aria-text-5)] py-2"
                  />
                  <MicButton
                    disabled={sending}
                    onTranscript={(t) => setInput((v) => (v.trim() ? `${v.trim()} ${t}` : t))}
                  />
                  <button
                    type="submit"
                    disabled={sending || !input.trim()}
                    className="w-9 h-9 rounded-full aria-gradient-bg disabled:opacity-40 text-white flex items-center justify-center flex-shrink-0 transition-opacity hover:opacity-90"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </>
          )}

          {/* Add-to-cart confirmation toast */}
          {toast && (
            <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 z-10 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center gap-2 bg-gray-900 text-white text-sm font-medium pl-3 pr-4 py-2 rounded-full shadow-lg whitespace-nowrap">
                <Check className="w-4 h-4 text-green-400" />
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
