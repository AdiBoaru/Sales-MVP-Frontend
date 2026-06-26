import React, { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Plus, Star, Check } from "lucide-react";
import { sendChatMessage, resetChatSession, isChatConfigured } from "@/api/chatClient";
import { addToCart } from "@/lib/cart";
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

function ChatProductCard({ product, onAdd }) {
  const handleAdd = () => {
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

  return (
    <div className="flex gap-3 bg-white border border-gray-100 rounded-xl p-2.5 shadow-sm">
      <div className="w-14 h-14 rounded-lg bg-gray-50 overflow-hidden flex-shrink-0">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold leading-snug line-clamp-2">{product.name}</p>
        {product.rating != null && (
          <div className="flex items-center gap-1 mt-0.5">
            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
            <span className="text-[10px] text-muted-foreground">{product.rating}</span>
          </div>
        )}
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs font-bold">{formatCurrency(product.price, product.currency)}</span>
          <button
            onClick={handleAdd}
            className="inline-flex items-center gap-1 bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-semibold px-2 py-1 rounded-md transition-colors"
          >
            <Plus className="w-3 h-3" /> Adaugă
          </button>
        </div>
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

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(/** @type {any[]} */ ([greeting()]));
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState(/** @type {string | null} */ (null));
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
          <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100 flex-shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                title="Începe un chat nou"
                className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 px-2.5 py-1 rounded-full transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Chat nou
              </button>
              <div className="w-7 h-7 bg-violet-600 rounded-lg flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold">{BRAND.assistant}</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              title="Închide"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-gray-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
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

                {msg.products?.length > 0 && (
                  <div className="space-y-2">
                    {msg.products.map((p, j) => (
                      <ChatProductCard
                        key={j}
                        product={p}
                        onAdd={() => showToast("Produsul a fost adăugat în coș")}
                      />
                    ))}
                  </div>
                )}

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
