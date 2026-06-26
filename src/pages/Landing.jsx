import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, MessageSquare, PenLine, ShoppingCart, Send, Gift, RotateCcw, BookOpen, HelpCircle, Truck } from "lucide-react";
import { motion } from "framer-motion";
import { BRAND } from "@/lib/brand";

const steps = [
  {
    num: 1,
    icon: MessageSquare,
    title: `Deschide chatul ${BRAND.assistant}`,
    desc: `Apasă „Întreabă pe ${BRAND.assistant}" și pornești o conversație cu asistenta ta personală de cumpărături.`,
    color: "bg-violet-600",
  },
  {
    num: 2,
    icon: PenLine,
    title: "Întreabă firesc",
    desc: "Spune ce cauți cum i-ai spune unei prietene. Fără meniuri, fără cuvinte-cheie, doar limbaj firesc.",
    color: "bg-green-500",
  },
  {
    num: 3,
    icon: ShoppingCart,
    title: `Lasă ${BRAND.assistant} să aleagă`,
    desc: "Compară variantele, îți recomandă ce merită cu adevărat și pune produsul potrivit direct în coș.",
    color: "bg-violet-600",
  },
];

const suggestions = [
  { icon: Gift, text: '„Caut un cadou sub 100 de lei"' },
  { icon: ShoppingCart, text: '„Adaugă în coș cel mai bine cotat produs"' },
  { icon: BookOpen, text: '„Ce-mi recomanzi pentru un buget de 200 de lei?"' },
  { icon: HelpCircle, text: '„Am pielea uscată pe mâini, ce cremă sau rutină îmi recomanzi?"' },
  { icon: RotateCcw, text: '„Care e politica de retur?"' },
  { icon: Truck, text: '„Când îmi ajunge comanda?"' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (/** @type {number} */ i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" },
  }),
};

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-white to-green-50/40">
      {/* Hero */}
      <section className="pt-16 pb-12 px-4 text-center max-w-2xl mx-auto">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-4xl md:text-5xl font-bold font-heading tracking-tight leading-tight"
        >
          Cumpărături alese inteligent.{" "}
          <span className="text-violet-600">{BRAND.assistant} găsește exact ce ți se potrivește.</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mt-5 text-muted-foreground text-base md:text-lg leading-relaxed max-w-lg mx-auto"
        >
          Spune-i Ariei ce cauți, pentru cine sau ce buget ai, iar ea alege din sute de produse atent selectate. Fără filtre complicate, doar o conversație firească.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-8"
        >
          <Link
            to="/store"
            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold px-8 py-3.5 rounded-full transition-all duration-200 shadow-lg shadow-violet-200 hover:shadow-violet-300 text-base"
          >
            Intră în magazin <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
        <p className="mt-4 text-xs text-muted-foreground tracking-wide">
          Testează chatbotul &nbsp;·&nbsp; Întreabă orice, fără cont
        </p>
      </section>

      {/* How it works */}
      <section className="py-14 px-4 max-w-4xl mx-auto">
        <p className="text-center text-xs font-semibold tracking-widest text-violet-600 uppercase mb-2">
          Atât de simplu
        </p>
        <h2 className="text-center text-2xl md:text-3xl font-bold font-heading mb-10">Cum funcționează</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow duration-300"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`${step.color} w-10 h-10 rounded-xl flex items-center justify-center`}>
                  <step.icon className="w-5 h-5 text-white" />
                </div>
              </div>
              <h3 className="font-semibold text-base mb-1.5">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Opening lines */}
      <section className="py-14 px-4 max-w-3xl mx-auto">
        <p className="text-center text-xs font-semibold tracking-widest text-violet-600 uppercase mb-2">
          Idei de pornire
        </p>
        <h2 className="text-center text-2xl md:text-3xl font-bold font-heading mb-1">Întreab-o pe {BRAND.assistant}...</h2>
        <p className="text-center text-sm text-muted-foreground mb-8">
          Exemple reale pe care i le poți cere oricând în magazin.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {suggestions.map((s, i) => (
            <motion.div
              key={i}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl px-4 py-3.5 hover:border-violet-200 hover:shadow-sm transition-all duration-200 group cursor-default"
            >
              <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0 group-hover:bg-violet-100 transition-colors">
                <s.icon className="w-4 h-4 text-violet-600" />
              </div>
              <span className="text-sm text-foreground flex-1">{s.text}</span>
              <Send className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-violet-400 transition-colors" />
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 px-4 text-center">
        <div>
          <Link
            to="/store"
            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold px-10 py-4 rounded-full transition-all duration-200 shadow-lg shadow-violet-200 hover:shadow-violet-300 text-base"
          >
            Începe acum <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          {BRAND.assistant} te însoțește la fiecare pas, de la prima întrebare până la coș.
        </p>
      </section>
    </div>
  );
}
