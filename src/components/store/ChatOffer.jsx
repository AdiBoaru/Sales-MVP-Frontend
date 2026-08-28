import React from "react";
import { Link } from "react-router-dom";
import { ExternalLink, ShoppingBag, CornerDownRight, CalendarCheck } from "lucide-react";

// Generic call-to-action under a bot reply. The bot picks `kind`; the FE maps it to a
// behavior — open_url/book open a link (new tab), checkout goes to the cart, quick_reply
// sends `payload` back as the next user message. Unknown/invalid kinds never reach here
// (dropped in mapOffer), so this only ever renders a real, working button.
const ICONS = {
  open_url: ExternalLink,
  book: CalendarCheck,
  checkout: ShoppingBag,
  quick_reply: CornerDownRight,
};

// Butonul principal al unui răspuns. `shadow-brand-200` era umbra VERDE a
// magazinului (din tailwind.config) pusă sub un buton violet — se vedea ca un halo
// murdar. Umbra vine acum din accentul propriu, iar hoverul ridică butonul în loc
// să-l estompeze: `opacity` pe un gradient îl spală, nu îl face să pară apăsabil.
const BTN =
  "inline-flex items-center justify-center gap-2 w-full text-[14px] font-semibold tracking-[-0.008em] px-4 py-3 rounded-[var(--aria-r-md)] aria-gradient-bg text-white shadow-[0_6px_18px_-6px_rgba(109,40,217,0.65)] hover:shadow-[0_10px_24px_-6px_rgba(109,40,217,0.75)] hover:-translate-y-px active:translate-y-0 transition-all";

export default function ChatOffer({ offer, onQuickReply }) {
  if (!offer) return null;
  const Icon = ICONS[offer.kind];
  const inner = (
    <>
      {Icon && <Icon className="w-4 h-4 shrink-0" />}
      <span>{offer.label}</span>
    </>
  );

  if (offer.kind === "quick_reply") {
    return (
      <button type="button" onClick={() => onQuickReply?.(offer.payload)} className={BTN}>
        {inner}
      </button>
    );
  }

  // checkout -> the app's own cart/checkout flow (internal route).
  if (offer.kind === "checkout") {
    return (
      <Link to="/Cart" className={BTN}>
        {inner}
      </Link>
    );
  }

  // open_url | book -> external link, opened in a new tab so the chat stays put.
  return (
    <a href={offer.url} target="_blank" rel="noopener noreferrer" className={BTN}>
      {inner}
    </a>
  );
}
