import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarX,
  ChevronRight,
  CreditCard,
  HelpCircle,
  Info,
  MessageCircle,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Star,
  Scale,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import StorePreview from "@/components/landing/StorePreview";

/**
 * Demo entry page.
 *
 * Editorial layout on purpose: serif display headings, a warm sand palette next
 * to the shop's apothecary green, and a drawn preview of the storefront beside
 * the hero copy. The page's whole job is to say what the demo is, what it is
 * safe to do inside it, and what to ask Aria once you are in.
 */

const promises = [
  { icon: ShieldCheck, text: "No account needed" },
  { icon: CreditCard, text: "No real payments" },
  { icon: CalendarX, text: "No orders get placed" },
];

const showcase = [
  {
    icon: MessageCircle,
    title: "Talks like a person",
    text: "Customers write what they want in their own words. No keyword search, no filter checkboxes, no dropdowns to learn first.",
  },
  {
    icon: ShoppingBag,
    title: "Asks before it answers",
    text: `When a request is too vague to act on, ${BRAND.assistant} asks a question back instead of guessing. It also says why it picked what it picked.`,
  },
  {
    icon: ShoppingCart,
    title: "Follows through to the cart",
    text: "Ask for something cheaper, change your mind, swap a product. The cart and the checkout keep up.",
  },
];

const testable = [
  {
    icon: MessageCircle,
    title: "Reads plain language",
    example: "I have sensitive skin and I want a light cream for daytime.",
  },
  {
    icon: HelpCircle,
    title: "Asks when a request is vague",
    example: "I'm looking for a new face cream.",
  },
  {
    icon: Star,
    title: "Recommends from the real catalog",
    example: "I need a long-wear lipstick for a wedding. What do you suggest?",
  },
  {
    icon: Scale,
    title: "Compares two products",
    example: "What's the difference between these two, and which suits oily skin?",
  },
  {
    icon: SlidersHorizontal,
    title: "Works to a budget",
    example: "Show me something cheaper, under 150 RON.",
  },
  {
    icon: ShoppingCart,
    title: "Adds to the cart",
    example: "Put the first one in my cart.",
  },
];

const openers = [
  "I need a moisturizer for sensitive skin.",
  "What's the difference between these two?",
  "Anything good under 150 RON?",
];

const steps = [
  {
    title: "Open the catalog",
    text: "300 products across six categories.",
  },
  {
    title: `Click the ${BRAND.assistant} button`,
    text: "Bottom right corner. Write a full sentence, not keywords.",
  },
  {
    title: "Follow it to checkout",
    text: "Add what it suggests and run the order to the last step.",
  },
];

/* A four-point star used as a section ornament — the page's only decorative glyph. */
function Star4({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 1.5c.5 4.6 2.4 7.4 6.9 8.4l1.6.35c.7.15.7 1.35 0 1.5l-1.6.35c-4.5 1-6.4 3.8-6.9 8.4-.5-4.6-2.4-7.4-6.9-8.4L3.5 11.7c-.7-.15-.7-1.35 0-1.5l1.6-.35c4.5-1 6.4-3.8 6.9-8.4Z" />
    </svg>
  );
}

/* Kraft bag with a bottle and a sprig — the illustration beside "where to start". */
function BagIllustration({ className = "" }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <path
        d="M27 46h56l-5 62a4 4 0 0 1-4 3.6H36a4 4 0 0 1-4-3.6L27 46Z"
        fill="#e6d5bd"
        stroke="#c9b394"
        strokeWidth="1.6"
      />
      <path d="M27 46h56l-.9 11H27.9L27 46Z" fill="#ddc9ad" />
      <path
        d="M44 46V36a11 11 0 0 1 22 0v10"
        fill="none"
        stroke="#b89c78"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <rect x="88" y="72" width="19" height="34" rx="5" fill="#e8ddd0" stroke="#c9b394" strokeWidth="1.4" />
      <rect x="94" y="64" width="7" height="9" rx="2" fill="#c9b394" />
      <rect x="91" y="84" width="13" height="10" rx="2" fill="#cfe0d3" />
      <path
        d="M62 44c0-9 5-15 13-17-1 9-5 14-13 17Z"
        fill="#a9c3ad"
        stroke="#7d9d84"
        strokeWidth="1.2"
      />
      <path d="M62 44c0-6-3-11-8-13 0 7 3 11 8 13Z" fill="#bcd2bf" stroke="#7d9d84" strokeWidth="1.2" />
      <path d="M62 44V27" stroke="#7d9d84" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export default function Landing() {
  return (
    <main className="min-h-screen bg-white text-gray-900">
      {/* ------------------------------------------------------------------ hero */}
      <section className="border-b border-gray-100 px-5 py-10 md:py-14">
        <div className="mx-auto grid max-w-6xl items-start gap-10 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)] lg:gap-14">
          <div>
            <div className="flex items-center gap-2">
              <Star4 className="h-5 w-5 text-gray-900" />
              <span className="font-display text-2xl font-semibold uppercase tracking-[0.14em]">
                {BRAND.name}
              </span>
            </div>

            <p className="mt-4 inline-flex items-center gap-2 rounded-md bg-[#f7efe1] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8a6a34]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#c9963f]" />
              Demo environment
            </p>

            <h1 className="mt-5 font-display text-[34px] font-semibold leading-[1.1] tracking-tight md:text-[44px]">
              Try {BRAND.assistant} in a working online store
            </h1>

            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-gray-600">
              The shop is invented. We built it so {BRAND.assistant} would have a real place to
              work, with 300 products, six categories and a cart that behaves like any other.
            </p>
            <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-gray-600">
              Browse the catalog, ask {BRAND.assistant} what to buy, compare two products, put
              something in the cart and go through checkout. Everything runs except the payment.
            </p>

            <div className="mt-7 flex gap-3 rounded-lg border border-[#f0e2c9] bg-[#fdf8f0] p-4">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#f2e3c8]">
                <Info className="h-3.5 w-3.5 text-[#8a6a34]" />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-gray-900">This is a demo.</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-gray-600">
                  Products, prices and promotions are invented. Checkout runs all the way to the
                  last step and stops there.
                </p>
              </div>
            </div>

            <Link
              to="/store"
              className="mt-7 inline-flex items-center gap-2.5 rounded-lg bg-brand-600 px-7 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-brand-700"
            >
              Enter the demo store <ArrowRight className="h-4 w-4" />
            </Link>

            <ul className="mt-7 flex flex-wrap gap-x-7 gap-y-3">
              {promises.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2 text-[12.5px] text-gray-500">
                  <Icon className="h-4 w-4 text-gray-400" strokeWidth={1.6} />
                  {text}
                </li>
              ))}
            </ul>
          </div>

          {/* preview + the annotation pointing at the chat launcher */}
          <div className="relative rounded-2xl bg-[#fdf8f0] p-4 md:p-6">
            <StorePreview />

            <div className="pointer-events-none absolute -bottom-1 right-6 hidden items-end gap-2 md:flex">
              <p className="font-display text-[13px] italic leading-snug text-brand-700">
                Click here to
                <br />
                talk to {BRAND.assistant}
              </p>
              <svg viewBox="0 0 60 46" className="h-11 w-14 text-brand-600" aria-hidden="true">
                <path
                  d="M3 42c14 4 34-2 45-24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <path
                  d="M42 22l7-5 2 9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- what it shows */}
      <section className="bg-[#fbfaf8] px-5 py-14">
        <div className="mx-auto max-w-5xl">
          <h2 className="flex items-center justify-center gap-2.5 font-display text-2xl font-semibold">
            <Star4 className="h-4 w-4 text-[#c9963f]" />
            What the demo shows
          </h2>
          <p className="mx-auto mt-3 max-w-3xl text-center text-[13.5px] leading-relaxed text-gray-500">
            {BRAND.assistant}'s job is to take someone from a vague idea to a product they would
            actually buy. Three parts of that are worth watching.
          </p>

          <div className="mt-10 grid gap-8 md:grid-cols-3 md:gap-0">
            {showcase.map(({ icon: Icon, title, text }, i) => (
              <div
                key={title}
                className={`flex gap-4 md:px-7 ${
                  i > 0 ? "md:border-l md:border-gray-200" : ""
                }`}
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#f7efe1]">
                  <Icon className="h-5 w-5 text-[#8a6a34]" strokeWidth={1.6} />
                </span>
                <div>
                  <h3 className="text-[14px] font-semibold">{title}</h3>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-gray-500">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ what to test */}
      <section className="bg-[#fbfaf8] px-5 pb-14">
        <div className="mx-auto max-w-5xl rounded-xl border border-gray-200 bg-white p-6 md:p-8">
          <h2 className="flex items-center justify-center gap-2.5 font-display text-2xl font-semibold">
            <Star4 className="h-4 w-4 text-[#c9963f]" />
            What you can test with {BRAND.assistant}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-[13px] leading-relaxed text-gray-500">
            Six things worth trying. The quotes are prompts you can type as they are.
          </p>

          <ol className="mt-8 space-y-2">
            {testable.map(({ icon: Icon, title, example }, i) => (
              <li
                key={title}
                className="flex items-stretch overflow-hidden rounded-lg border border-gray-200"
              >
                <span className="grid w-12 shrink-0 place-items-center border-r border-gray-200 bg-[#faf6ee]">
                  <Icon className="h-4 w-4 text-[#8a6a34]" strokeWidth={1.6} />
                </span>
                <span className="flex flex-1 items-center px-4 py-3 text-[13px] font-medium md:w-[38%] md:flex-none">
                  {i + 1}. {title}
                </span>
                <span className="hidden flex-1 items-center border-l border-gray-200 px-4 py-3 text-[12.5px] italic text-gray-500 md:flex">
                  “{example}”
                </span>
                <span className="grid w-9 shrink-0 place-items-center">
                  <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------- openers + where to start */}
      <section className="bg-[#fbfaf8] px-5 pb-14">
        <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="font-display text-lg font-semibold">Not sure what to ask?</h3>
            <p className="mt-1.5 text-[12.5px] text-gray-500">Copy one of these to start.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {openers.map((opener) => (
                <div
                  key={opener}
                  className="flex min-h-[92px] flex-col justify-between rounded-lg border border-gray-200 p-3"
                >
                  <p className="text-[12px] leading-relaxed text-gray-700">{opener}</p>
                  <ChevronRight className="mt-2 h-3.5 w-3.5 self-end text-gray-300" />
                </div>
              ))}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="font-display text-lg font-semibold">Where to start</h3>
            <p className="mt-1.5 text-[12.5px] text-gray-500">Three steps, about two minutes.</p>

            {/* narrowed only where the illustration is visible, so the steps
                keep the full width on phones */}
            <ol className="mt-5 space-y-4 sm:max-w-[68%]">
              {steps.map((step, i) => (
                <li key={step.title} className="flex gap-3">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold">{step.title}</p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-gray-500">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>

            <BagIllustration className="pointer-events-none absolute -bottom-1 right-3 hidden h-36 w-36 sm:block" />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- closing CTA */}
      <section className="bg-[#fbfaf8] px-5 pb-12">
        <div className="mx-auto flex max-w-5xl flex-col items-start gap-6 rounded-xl bg-[#f6e7ce] px-6 py-7 md:flex-row md:items-center md:px-9">
          <Sparkles className="h-8 w-8 shrink-0 text-[#c9963f]" strokeWidth={1.4} />
          <div className="flex-1">
            <h2 className="font-display text-[22px] font-semibold">
              Ready to try {BRAND.assistant}?
            </h2>
            <p className="mt-1 text-[13px] text-[#6b5b42]">The store is one click away.</p>
          </div>
          <Link
            to="/store"
            className="inline-flex items-center gap-2.5 rounded-lg bg-brand-600 px-7 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Open the demo store <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="bg-[#fbfaf8] px-5 pb-10">
        <p className="flex items-center justify-center gap-2 text-center text-[11.5px] text-gray-400">
          <Info className="h-3.5 w-3.5" />
          <span>
            <span className="font-semibold text-gray-500">Reminder:</span> this is a demo. No
            payments are taken and no orders are placed.
          </span>
        </p>
      </footer>
    </main>
  );
}
