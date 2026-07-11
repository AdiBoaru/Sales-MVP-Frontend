// Dev-only preview fixture. Open the store with `?demo=1` to seed the chat with a
// rich conversation that exercises every generic field the card can render — so the
// visual layer can be reviewed against the design without waiting on the Python bot.
//
// Products here are already in the MAPPED shape (what the widget stores after
// chatClient.mapProduct), so this mirrors a real reply 1:1. Images use picsum and
// fall back to the card's empty-state icon if offline.

export function demoMessages() {
  return [
    {
      role: "assistant",
      content: `Bună! Sunt **Aria**, asistenta ta de cumpărături. Spune-mi ce cauți și îți găsesc produsele potrivite.`,
    },
    { role: "user", content: "Caut un fluid matifiant bun pentru ten gras, sub 120 lei" },
    {
      role: "assistant",
      content:
        "Pentru ten gras, caută o cremă **ușoară, non-comedogenică** și cu efect matifiant. Iată recomandarea mea, plus o alternativă:",
      criteria: ["ten gras", "sub 120 lei", "efect matifiant"],
      products: [
        {
          product_id: null,
          name: "Fluid hidratant matifiant Bioderma Sebium Mat Control, ten mixt/gras, 30 ml",
          price: 82.5,
          list_price: 99,
          currency: "RON",
          image_url: "https://picsum.photos/seed/sebium/240",
          url: "#",
          rating: 4.81,
          review_count: 1234,
          reason: "Textură ușoară, controlează sebumul fără să usuce pielea.",
          score: 9.2,
          why:
            "Din toate fluidele matifiante analizate sub 120 de lei, e singurul cu acid salicilic + zinc " +
            "confirmat clinic pentru reglarea sebumului, plus un finish mat care rezistă sub machiaj toată ziua.",
          best: "Ten gras, pori dilatați, machiaj de zi",
          avoid: "Ten foarte uscat sau sensibil la acid salicilic",
          pros: [
            "Textură foarte ușoară, se absoarbe în câteva secunde",
            "Fără parfum — potrivit și pentru ten sensibilizat",
            "Sub bugetul de 120 lei, cu -18% activ acum",
          ],
          cons: ["Flaconul e mic (30 ml) pentru folosire zilnică intensivă"],
          badges: [
            { label: "genius", tone: "info" },
            { label: "Super Preț", tone: "danger" },
          ],
          highlights: [
            { text: "Comandă până la 18:00, livrare mâine", tone: "success", icon: "truck" },
            { text: "-100 Lei în Coș", tone: "warning", icon: "tag" },
          ],
          meta: [{ label: "Livrare", value: "Marți, 7 Iul." }],
          details:
            "**De ce ți-l recomand:** conține acid salicilic + zinc care reglează sebumul. " +
            "Se absoarbe rapid, lasă un finish mat și e potrivit sub machiaj. Fără parfum.",
        },
        {
          product_id: null,
          name: "Cremă matifiantă pentru ten gras Vichy Normaderm, 50 ml",
          price: 113.88,
          currency: "RON",
          image_url: "https://picsum.photos/seed/vichy/240",
          url: "#",
          rating: 4.46,
          review_count: 318,
          score: 8.4,
          reason: "Hidratare puternică 72h + niacinamidă pentru pori.",
          badges: [{ label: "Top Favorite", tone: "promo" }],
          meta: [{ label: "Livrare", value: "Miercuri, 8 Iul." }],
        },
      ],
      suggestions: [
        "Arată doar cu efect antiacneic",
        "Recomandă-mi una cu SPF pentru ten gras",
        "Compară Sebium Mat Control cu Normaderm",
      ],
      offer: { kind: "open_url", label: "Vezi toată gama pentru ten gras", url: "#" },
    },
    { role: "user", content: "Compară-le, te rog" },
    {
      role: "assistant",
      content: "Sigur — iată diferențele principale între cele două:",
      comparison: {
        columns: [
          {
            name: "Bioderma Sebium Mat Control",
            price: 82.5,
            list_price: 99,
            currency: "RON",
            image_url: "https://picsum.photos/seed/sebium/240",
            url: "#",
          },
          {
            name: "Vichy Normaderm",
            price: 113.88,
            currency: "RON",
            image_url: "https://picsum.photos/seed/vichy/240",
            url: "#",
          },
        ],
        rows: [
          { label: "Preț", values: ["82,50 Lei", "113,88 Lei"], winner: 0 },
          { label: "Tip", values: ["Fluid matifiant", "Gel-cremă 72h"] },
          { label: "Ingredient cheie", values: ["Acid salicilic + zinc", "Niacinamidă 4%"], winner: 0 },
          { label: "Finish", values: ["Mat", "Mat-natural"] },
          { label: "Pentru cine", values: ["Ten mixt/gras", "Ten gras cu pori"], winner: 1 },
        ],
        verdict:
          "Pentru ten gras cu tendință acneică, Sebium Mat Control câștigă prin combinația " +
          "acid salicilic + zinc — mai eficientă pe termen scurt și mai ieftină. Normaderm rămâne " +
          "alegerea bună dacă principala problemă e doar aspectul porilor, nu acneea.",
        confidence: 84,
      },
      suggestions: ["Vreau opțiuni doar până în 90 lei"],
      offer: { kind: "quick_reply", label: "Adaugă-le pe ambele în coș", payload: "Adaugă ambele produse în coș" },
    },

    { role: "user", content: "Vreau o variantă cu efect imediat, mai ieftină" },
    {
      role: "assistant",
      // "Am înțeles ce cauți" understanding card + a re-recommendation whose hero card
      // carries a "Ce s-a schimbat" delta block.
      understanding: {
        chips: [
          { k: "Efect", v: "imediat" },
          { k: "Buget", v: "sub 100 lei" },
          { k: "Regulă", v: "fără parfum" },
        ],
        note: "Am potrivit recomandarea la ce contează pentru tine — nu doar la preț.",
      },
      products: [
        {
          product_id: null,
          brand: "DERMIA",
          name: "HA5 · Ser Hidratant",
          price: 95,
          list_price: 115,
          currency: "RON",
          image_url: "https://picsum.photos/seed/ha5/240",
          url: "#",
          rating: 4.8,
          review_count: 1644,
          score: 9.3,
          why:
            "Cinci tipuri de acid hialuronic cu greutăți moleculare diferite — hidratează în profunzime, " +
            "cu efect de „umplere” vizibil imediat, onest.",
          changes: [
            { delta: "−34 lei", label: "preț față de recomandarea anterioară", tone: "good" },
            { delta: "efect imediat", label: "vs. rezultat în săptămâni", tone: "good" },
            { delta: "fără SPF", label: "adaugă separat protecția solară", tone: "warn" },
          ],
          best: "Ten deshidratat, efect vizibil rapid",
          avoid: "Cauți tratament pentru riduri profunde",
          pros: ["Hidratare pe mai multe niveluri", "Textură lejeră, absorbție rapidă"],
          cons: ["Hidratarea cere reaplicare zilnică"],
        },
      ],
      suggestions: ["E în stoc?", "Salvează-l în listă"],
    },

    { role: "user", content: "E în stoc?" },
    {
      role: "assistant",
      // In-text stock status rows + a message-level confidence bar.
      content: "Da — și livrarea e rapidă:",
      status: [
        { name: "HA5 · Ser Hidratant", sub: "Livrare mâine, până la ora 18", badge: "În stoc", tone: "ok" },
        { name: "SPF 50 Mineral, fără parfum", sub: "Livrare în 2–3 zile lucrătoare", badge: "Stoc limitat · 4 buc", tone: "warn" },
      ],
      confidence: 88,
      suggestions: ["Salvează-l în listă"],
    },

    { role: "user", content: "Construiește-mi o rutină completă pentru ten uscat" },
    {
      role: "assistant",
      // A full routine timeline (numbered steps + connector line + mini product cards).
      content: "Uite rutina pe care ți-o construiesc, pas cu pas:",
      routine: {
        title: "Rutina esențială · 3 pași",
        total: "209 lei",
        note: "Ordinea de aplicare dimineața: 1 → 3, de la cea mai lejeră textură la cea mai bogată. Seara, sari peste SPF.",
        steps: [
          {
            role: "Pasul 1 · Curățare",
            why: "Gel fără sulfați — nu decapează pielea deja uscată.",
            product: { brand: "DERMIA", name: "Gel de Curățare Blând", price: 45, currency: "RON", image_url: "https://picsum.photos/seed/cleanser/160", url: "#", score: 9.0 },
          },
          {
            role: "Pasul 2 · Hidratare activă",
            why: "Serul face munca grea: 5 tipuri de acid hialuronic.",
            product: { brand: "DERMIA", name: "HA5 · Ser Hidratant", price: 95, currency: "RON", image_url: "https://picsum.photos/seed/ha5/160", url: "#", score: 9.3 },
          },
          {
            role: "Pasul 3 · Sigilare",
            why: "Ceramidele refac bariera și țin hidratarea în piele.",
            product: { brand: "HYDRA", name: "Cremă Ceramide", price: 69, currency: "RON", image_url: "https://picsum.photos/seed/cream/160", url: "#", score: 9.1 },
          },
        ],
      },
      suggestions: ["Salvează toată rutina", "De ce acești pași?"],
    },

    { role: "user", content: "Vreau un ser care șterge ridurile în 3 zile" },
    {
      role: "assistant",
      // Honest refusal — the amber "no results" card, never a fabricated product.
      noResults: {
        title: "Niciun ser nu șterge ridurile în 3 zile",
        text:
          "Ridurile se atenuează în săptămâni, nu în zile — orice produs care promite altceva vinde o iluzie. " +
          "Îți propun două direcții oneste:",
      },
      suggestions: ["Efect real în timp: retinol", "Efect imediat: ce netezește azi"],
    },
  ];
}
