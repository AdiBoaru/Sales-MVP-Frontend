import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
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
    title: "Intră în magazinul demo",
    desc: "Vei vedea un magazin online de test, pregătit special pentru simularea unei experiențe asistate de AI.",
  },
  {
    icon: Search,
    title: "Explorează produsele",
    desc: "Alege un scenariu simplu: caută un produs, compară variante sau pornește de la o nevoie concretă.",
  },
  {
    icon: MessageSquareText,
    title: `Testează chatul ${BRAND.assistant}`,
    desc: "Scrie întrebări ca un client real și urmărește cum asistentul oferă recomandări, explicații și suport de cumpărare.",
  },
];

const testIdeas = [
  "Caut un cadou sub 100 de lei.",
  "Ce produs mi se potrivește pentru piele uscată?",
  "Compară două opțiuni și recomandă-mi una.",
  "Adaugă în coș produsul cel mai potrivit.",
];

const highlights = [
  "Demo pregătit pentru testare rapidă",
  "Magazin online + chat AI în aceeași experiență",
  "Fără configurare și fără cont suplimentar",
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
    <main className="min-h-screen bg-gradient-to-b from-white via-white to-violet-50/50 text-foreground">
      <section className="px-4 py-10 md:py-16">
        <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="inline-flex items-center gap-2 rounded-full border border-violet-100 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700"
          >
            <Bot className="h-4 w-4" />
            Acces demo AI Sales Assistant
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="mt-7 max-w-3xl font-heading text-4xl font-bold leading-tight tracking-tight md:text-6xl"
          >
            Testează experiența unui magazin online asistat de AI
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.16 }}
            className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg"
          >
            Acest website este mediul de testare primit după înscrierea la demo.
            În câteva minute poți explora magazinul, conversa cu {BRAND.assistant} și vedea cum AI-ul susține decizia de cumpărare.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, delay: 0.24 }}
            className="mt-8 flex flex-col items-center gap-3 sm:flex-row"
          >
            <Link
              to="/store"
              className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-violet-200 transition-all duration-200 hover:bg-violet-700 hover:shadow-violet-300"
            >
              Începe testarea <ArrowRight className="h-4 w-4" />
            </Link>
            <span className="text-sm text-muted-foreground">
              Magazin demo + chat AI
            </span>
          </motion.div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {highlights.map((item) => (
              <span key={item} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-14">
        <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-3">
          {demoSteps.map((step, i) => (
            <motion.article
              key={step.title}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-40px" }}
              className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
            >
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                <step.icon className="h-5 w-5" />
              </div>
              <h2 className="font-heading text-lg font-semibold">{step.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <section className="px-4 pb-16">
        <div className="mx-auto grid max-w-5xl gap-6 rounded-3xl border border-violet-100 bg-white p-6 shadow-sm md:grid-cols-[1fr_1.15fr] md:p-8">
          <div>
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-green-50 text-green-600">
              <MousePointerClick className="h-5 w-5" />
            </div>
            <h2 className="font-heading text-2xl font-bold">Cum să testezi demo-ul</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Folosește chatul ca și cum ai fi un client care vrea să cumpere mai rapid și mai informat.
              Poți cere recomandări, comparații, detalii despre produse sau ajutor pentru adăugarea în coș.
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
                className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-left text-sm"
              >
                <Sparkles className="h-4 w-4 flex-shrink-0 text-violet-600" />
                <span>{idea}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
