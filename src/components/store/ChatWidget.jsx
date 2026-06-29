import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, X, Send, Plus, Minus, Star, Check, ShoppingCart, Trash2 } from "lucide-react";
import { sendChatMessage, resetChatSession, isChatConfigured } from "@/api/chatClient";
import { addToCart, useCart, useCartCount, setQuantity, removeItem } from "@/lib/cart";
import { formatCurrency } from "@/utils";
import { BRAND } from "@/lib/brand";

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

// Escape HTML, then render only **bold**.
function RichText({ text }) {
  const escaped = String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br/>");
  return <span dangerouslySetInnerHTML={{ __html: escaped }} />;
}

// Best-effort color for a product badge. Labels arrive already localized (ro/en/hu),
// so we keyword-match loosely and fall back to violet for anything unrecognized.
function badgeClasses(badge) {
  const b = badge.toLowerCase();
  if (/(preț|pret|price|reducere|discount|sale|super|szuper|akció|ár)/.test(b))
    return "bg-emerald-100 text-emerald-700";
  if (/(favorit|favourite|top|popular|bestseller|kedvenc|népszerű)/.test(b))
    return "bg-orange-100 text-orange-700";
  return "bg-violet-100 text-violet-700";
}

function ChatProductCard({ product, onAdd }) {
  const handleAdd = (e) => {
    // Don't let the click bubble up to the card link (add ≠ navigate).
    e.preventDefault();
    e.stopPropagation();
    addToCart({
      product_id: null,
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

  const content = (
    <>
      <div className="w-14 h-14 rounded-lg bg-gray-50 overflow-hidden flex-shrink-0">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        {/* Reserve room on the right so a corner badge doesn't overlap the name. */}
        <p className={`text-xs font-semibold leading-snug line-clamp-2 ${product.badge ? "pr-16" : ""}`}>
          {product.name}
        </p>
        {product.reason && (
          <p className="text-[10px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
            {product.reason}
          </p>
        )}
        {product.rating != null && (
          <div className="flex items-center gap-1 mt-0.5">
            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
            <span className="text-[10px] text-muted-foreground">
              {product.rating}
              {product.review_count > 0 && ` (${product.review_count.toLocaleString("ro-RO")})`}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 mt-1">
          <div className="flex items-baseline gap-1.5 min-w-0 flex-wrap">
            <span className="text-xs font-bold whitespace-nowrap">
              {formatCurrency(product.price, product.currency)}
            </span>
            {hasDiscount && (
              <span className="text-[10px] text-muted-foreground line-through whitespace-nowrap">
                {formatCurrency(product.list_price, product.currency)}
              </span>
            )}
            {hasDiscount && discountPct > 0 && (
              <span className="text-[9px] font-bold text-emerald-600 whitespace-nowrap">-{discountPct}%</span>
            )}
          </div>
          <button
            onClick={handleAdd}
            className="inline-flex items-center gap-1 shrink-0 bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-semibold px-2 py-1 rounded-md transition-colors"
          >
            <Plus className="w-3 h-3" /> Adaugă
          </button>
        </div>
      </div>
      {product.badge && (
        <span
          className={`absolute top-2 right-2.5 z-10 text-[9px] font-bold px-1.5 py-0.5 rounded-md ${badgeClasses(product.badge)}`}
        >
          {product.badge}
        </span>
      )}
    </>
  );

  const baseClass = "relative flex gap-3 bg-white border border-gray-100 rounded-xl p-2.5 shadow-sm";

  // Whole card links to the product page (new tab keeps the chat open). No URL -> plain card.
  if (product.url) {
    return (
      <a
        href={product.url}
        target="_blank"
        rel="noopener noreferrer"
        title={`Vezi ${product.name}`}
        className={`${baseClass} hover:border-violet-300 hover:shadow-md transition-all cursor-pointer`}
      >
        {content}
      </a>
    );
  }

  return <div className={baseClass}>{content}</div>;
}

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

// Progressive "thinking" status shown while waiting for Aria's reply.
// Steps forward over time: Gândesc -> Caut -> Pregătesc răspunsul.
const THINKING_STAGES = ["Gândesc", "Caut", "Pregătesc răspunsul"];

function ThinkingIndicator() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const toCaut = setTimeout(() => setStage(1), 1500);
    const toPregatesc = setTimeout(() => setStage(2), 4500);
    return () => {
      clearTimeout(toCaut);
      clearTimeout(toPregatesc);
    };
  }, []);

  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-2.5 bg-white border border-gray-100 rounded-2xl rounded-bl-md px-3.5 py-2.5 shadow-sm">
        <span className="text-sm font-semibold bg-gradient-to-r from-violet-600 via-fuchsia-400 to-violet-600 bg-[length:200%_100%] bg-clip-text text-transparent animate-shimmer">
          {THINKING_STAGES[stage]}
        </span>
        <span className="flex items-center gap-1 ml-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-thinking-bounce" />
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-thinking-bounce [animation-delay:0.2s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-thinking-bounce [animation-delay:0.4s]" />
        </span>
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
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 bg-gray-50/50">
        <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mb-4">
          <ShoppingCart className="w-8 h-8 text-violet-600" />
        </div>
        <h3 className="text-lg font-bold">Coșul tău e gol</h3>
        <p className="text-sm text-muted-foreground max-w-[260px] mt-1 mb-5">
          Adaugă produse din recomandările lui {BRAND.assistant} și le vei vedea aici.
        </p>
        <button
          onClick={onBack}
          className="text-sm font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 px-4 py-2 rounded-full transition-colors"
        >
          Înapoi la chat
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 bg-gray-50/50">
        {items.map((it) => (
          <div key={it.key} className="flex gap-3 bg-white border border-gray-100 rounded-xl p-2.5 shadow-sm">
            <div className="w-14 h-14 rounded-lg bg-gray-50 overflow-hidden flex-shrink-0">
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
                    className="w-6 h-6 rounded-md border border-gray-200 flex items-center justify-center hover:bg-gray-50 disabled:opacity-40 transition-colors"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="text-xs font-semibold w-5 text-center">{it.quantity}</span>
                  <button
                    onClick={() => setQuantity(it.key, it.quantity + 1)}
                    title="Crește cantitatea"
                    className="w-6 h-6 rounded-md border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
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
      <div className="border-t border-gray-100 bg-white p-3 flex-shrink-0 space-y-2.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="font-bold">{formatCurrency(total, currency)}</span>
        </div>
        <Link
          to="/Cart"
          className="block w-full text-center bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
        >
          Finalizează comanda
        </Link>
      </div>
    </>
  );
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [messages, setMessages] = useState(/** @type {any[]} */ ([greeting()]));
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState(/** @type {string | null} */ (null));
  const cartCount = useCartCount();
  const scrollRef = useRef(null);
  const toastTimer = useRef(/** @type {any} */ (null));

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
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: reply.content,
          products: reply.products,
          suggestions: reply.suggestions,
          comparison: reply.comparison,
        },
      ]);
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
    setMessages([greeting()]);
  };

  // Before the first user message we show a centered welcome screen instead of the thread.
  const hasConversation = messages.some((m) => m.role === "user");

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold pl-4 pr-5 py-3 rounded-full shadow-lg shadow-violet-300 transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          <span className="hidden sm:inline">{BRAND.assistant}</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[400px] bg-white border-l border-gray-100 shadow-2xl flex flex-col">
          {/* Header */}
          <div className="relative flex items-center justify-between px-4 h-14 border-b border-gray-100 flex-shrink-0">
            {/* Left: "new chat" — only once the user has sent a message */}
            <div className="flex items-center">
              {hasConversation && (
                <button
                  onClick={handleReset}
                  title="Începe un chat nou"
                  className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 px-2.5 py-1 rounded-full transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Chat nou
                </button>
              )}
            </div>

            {/* Center: Aria logo + name (always centered) */}
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-none">
              <div className="w-7 h-7 bg-violet-600 rounded-lg flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold">{BRAND.assistant}</span>
            </div>

            {/* Right: cart toggle + close */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowCart((s) => !s)}
                title={showCart ? "Înapoi la chat" : "Vezi coșul"}
                className={`relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  showCart ? "bg-violet-100 text-violet-700" : "text-muted-foreground hover:bg-gray-50"
                }`}
              >
                <ShoppingCart className="w-4 h-4" />
                {cartCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-violet-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setOpen(false)}
                title="Închide"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-gray-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Cart view takes over the body when toggled from the header. */}
          {showCart ? (
            <CartView onBack={() => setShowCart(false)} />
          ) : /* Welcome state — centered Aria, shown until the first user message */
          !hasConversation ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 bg-gray-50/50">
              <div className="w-16 h-16 rounded-2xl bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-200 mb-4">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-lg font-bold">Bună! Sunt {BRAND.assistant}</h3>
              <p className="text-sm text-muted-foreground max-w-[260px] mt-1 mb-5">
                Asistenta ta de cumpărături. Spune-mi ce cauți și îți găsesc produsele potrivite.
              </p>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {INITIAL_SUGGESTIONS.map((s, j) => (
                  <button
                    key={j}
                    onClick={() => send(s)}
                    className="text-xs bg-white border border-violet-200 text-violet-700 px-3 py-1.5 rounded-full hover:bg-violet-50 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50/50">
            {messages.map((msg, i) => (
              <div key={i} className="space-y-2">
                <div className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={`max-w-[85%] text-sm leading-relaxed px-3.5 py-2.5 rounded-2xl ${
                      msg.role === "user"
                        ? "bg-violet-600 text-white rounded-br-md"
                        : "bg-white border border-gray-100 rounded-bl-md"
                    }`}
                  >
                    <RichText text={msg.content} />
                  </div>
                </div>

                {/* A comparison renders a TABLE (not the products re-listed as cards);
                    the table header IS the compared products, so we don't duplicate them. */}
                {msg.comparison ? (
                  <ComparisonTable comparison={msg.comparison} />
                ) : msg.products?.length > 0 ? (
                  <div className="space-y-2">
                    {msg.products.map((p, j) => (
                      <ChatProductCard
                        key={j}
                        product={p}
                        onAdd={() => showToast("Produsul a fost adăugat în coș")}
                      />
                    ))}
                  </div>
                ) : null}

                {msg.suggestions?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {msg.suggestions.map((s, j) => (
                      <button
                        key={j}
                        onClick={() => send(s)}
                        className="text-xs bg-white border border-violet-200 text-violet-700 px-3 py-1.5 rounded-full hover:bg-violet-50 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {sending && <ThinkingIndicator />}
          </div>
          )}

          {/* Disclaimer + input belong to the chat; the cart view has its own footer. */}
          {!showCart && (
            <>
              {/* AI disclaimer — pinned at the bottom of the conversation area, centered */}
              <p className="text-[10px] leading-tight text-center text-muted-foreground bg-gray-50/50 px-4 pt-0.5 pb-1.5 flex-shrink-0">
                Funcționez cu inteligență artificială, așa că pot greși uneori.
              </p>

              {/* Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="flex items-center gap-2 p-3 border-t border-gray-100 flex-shrink-0"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={`Scrie-i lui ${BRAND.assistant}...`}
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-300"
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  className="w-10 h-10 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white flex items-center justify-center flex-shrink-0 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
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
        </div>
      )}
    </>
  );
}
