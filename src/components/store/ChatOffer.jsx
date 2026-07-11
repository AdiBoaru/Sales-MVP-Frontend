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

const BTN =
  "inline-flex items-center justify-center gap-2 w-full text-sm font-semibold px-4 py-2.5 rounded-xl aria-gradient-bg hover:opacity-90 text-white shadow-sm shadow-violet-200 transition-opacity";

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
