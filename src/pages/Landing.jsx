import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  Check,
  MessageSquareText,
  MousePointerClick,
  Search,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";
import { BRAND } from "@/lib/brand";

const demoSteps = [
  {
    icon: ShoppingBag,
    title: "Enter the demo store",
    desc: "You will find a test storefront, built specifically to simulate an AI-assisted shopping experience.",
  },
  {
    icon: Search,
    title: "Browse the products",
    desc: "Pick a simple scenario: search for a product, compare a few variants, or start from a concrete need.",
  },
  {
    icon: MessageSquareText,
    title: `Try the ${BRAND.assistant} chat`,
    desc: "Ask questions the way a real customer would, and watch the assistant offer recommendations, explanations and buying support.",
  },
];

const testIdeas = [
  "I'm looking for a gift under 100 RON.",
  "Which product suits dry skin?",
  "Compare two options and recommend one.",
  "Add the most suitable product to my cart.",
];

const highlights = [
  "Ready to test in minutes",
  "Online store and AI chat in a single experience",
  "No setup and no extra account",
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.45, ease: "easeOut" },
  }),
};

export default function Landing() {
  return (
    <main className="aria-lux is-light relative min-h-screen overflow-hidden bg-[var(--color-void)]">
      {/* Soft accent wash behind the hero, lifting the top of the page. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, var(--color-glow), transparent 70%)",
        }}
      />

      <section className="relative px-4 py-14 md:py-20">
        <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-hair)] bg-[var(--color-chip)] px-4 py-2 text-sm font-medium text-[var(--color-accent-ink)]"
          >
            <Bot className="h-4 w-4" />
            AI Sales Assistant — demo access
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="mt-7 max-w-3xl font-heading text-4xl font-bold leading-tight tracking-tight text-[var(--color-ink)] md:text-6xl"
          >
            Experience an online store guided by AI
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.16 }}
            className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--color-ink-soft)] md:text-lg"
          >
            This site is the test environment you received after signing up for the demo.
            In just a few minutes you can explore the store, talk to {BRAND.assistant}, and
            see how AI supports a buying decision.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, delay: 0.24 }}
            className="mt-9 flex flex-col items-center gap-3 sm:flex-row"
          >
            <Link
              to="/store"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-8 py-3.5 text-base font-semibold text-[var(--color-on-accent)] transition-colors duration-200 hover:bg-[var(--color-accent-hover)]"
            >
              Start testing <ArrowRight className="h-4 w-4" />
            </Link>
            <span className="text-sm text-[var(--color-ink-mute)]">
              Demo store and AI chat
            </span>
          </motion.div>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {highlights.map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-1.5 text-sm text-[var(--color-ink-faint)]"
              >
                <Check className="h-4 w-4 text-[var(--color-accent-ink)]" />
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="relative px-4 pb-14">
        <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-3">
          {demoSteps.map((step, i) => (
            <motion.article
              key={step.title}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-40px" }}
              className="rounded-2xl border border-[var(--color-hair)] bg-[var(--color-surface)] p-6"
            >
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-chip)] text-[var(--color-accent-ink)]">
                <step.icon className="h-5 w-5" />
              </div>
              <h2 className="font-heading text-lg font-semibold text-[var(--color-ink)]">
                {step.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-soft)]">
                {step.desc}
              </p>
            </motion.article>
          ))}
        </div>
      </section>

      <section className="relative px-4 pb-20">
        <div className="mx-auto grid max-w-5xl gap-6 rounded-3xl border border-[var(--color-hair)] bg-[var(--color-surface)] p-6 md:grid-cols-[1fr_1.15fr] md:p-8">
          <div>
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-chip)] text-[var(--color-accent-ink)]">
              <MousePointerClick className="h-5 w-5" />
            </div>
            <h2 className="font-heading text-2xl font-bold text-[var(--color-ink)]">
              How to test the demo
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-soft)]">
              Use the chat exactly as a customer who wants to buy faster and better informed
              would. Ask for recommendations, comparisons, product details, or help adding an
              item to the cart.
            </p>
          </div>

          <div className="grid gap-3">
            {testIdeas.map((idea, i) => (
              <motion.div
                key={idea}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className="flex items-center gap-3 rounded-2xl border border-[var(--color-hair)] bg-[var(--color-surface-2)] px-4 py-3 text-left text-sm text-[var(--color-ink)]"
              >
                <Sparkles className="h-4 w-4 flex-shrink-0 text-[var(--color-accent-ink)]" />
                <span>{idea}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
