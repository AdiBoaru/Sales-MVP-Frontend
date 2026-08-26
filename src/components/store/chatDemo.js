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
    // The izi answer rhythm: bold lead, accent summary line, a card, then section
    // headings + a green-check feature list parsed straight out of the markdown.
    { role: "user", content: "vreau mai multe detalii despre primul ruj" },
    {
      role: "assistant",
      content:
        "**Primul ruj este un ruj clasic solid, foarte accesibil, care pornește verde și se transformă " +
        "în roz/roșu cyclam pe buze, cu rezistență bună la transfer.**\n\n" +
        "E gândit pentru un machiaj de zi cu culoare vizibilă și efect interesant de schimbare de culoare.\n\n" +
        "## De ce ți-l recomand\n" +
        "Ruj clasic solid, inițial verde, care se transformă în roz/roșu cyclam cu acoperire completă și " +
        "aspect perlat, rezistent la transfer, ideal pentru machiaj de zi.\n\n" +
        "## Funcționalități principale\n" +
        "- Schimbare de culoare unică — rujul verde devine roz/roșu cyclam pentru un efect vizibil pe buze.\n" +
        "- Rezistență la transfer — asigură un machiaj de durată fără pete pe obiecte.\n" +
        "- Acoperire completă și aspect perlat — oferă un finisaj uniform și strălucitor buzelor.\n" +
        "- Preț accesibil și rating bun — costă sub 10 lei și are o evaluare de 4.11 din 5, bazată pe 35 de recenzii.\n\n" +
        "## Ce spun clienții\n" +
        "Majoritatea recenziilor sunt pozitive, utilizatorii apreciază nuanța roz plăcută obținută prin schimbare, " +
        "textura cremoasă și raportul calitate-preț. Există însă unele rezerve legate de miros și uscăciune.",
      products: [
        {
          product_id: null,
          name: "Ruj verde care isi schimba culoarea in Roz/Rosu Cyclam, rezistent la transfer",
          price: 7.87,
          currency: "RON",
          image_url: "https://picsum.photos/seed/rujverde/240",
          url: "#",
          rating: 4.11,
          review_count: 35,
          reason: "Ruj solid foarte ieftin, acoperire completă, perlat, cu efect de schimbare de culoare.",
          badges: [{ label: "Top Favorite", tone: "info" }],
          details:
            "**Textură și finisaj**\nRuj solid, perlat, cu acoperire completă. Nuanța finală variază ușor " +
            "în funcție de pH-ul buzelor tale.\n\n**Cum se aplică**\n- Hidratează buzele înainte.\n" +
            "- Aplică un strat subțire și lasă 30 de secunde pentru dezvoltarea culorii.",
        },
      ],
      suggestions: [
        "Care este durata rezistenței rujului?",
        "Cum se aplică corect rujul solid?",
        "Există alte nuanțe disponibile în această gamă?",
      ],
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
      content: "Le-am pus față în față. Alegerea se joacă la ce tratezi mai întâi, acneea sau porii.",
      comparison: {
        // Forma NARATIVĂ pe care o emite backendul: titlu localizat de server, linie de accent,
        // rânduri = axe de decizie (nu coloane de catalog) și îndrumarea sub tabel.
        heading: "Diferențe principale",
        subtitle: "Una lucrează pe acnee și matifiere, cealaltă pe pori și hidratare susținută.",
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
          { label: "Textura și senzația", values: ["Fluid matifiant, se usucă repede.", "Gel-cremă, rămâne mai catifelat."] },
          { label: "Pe ce lucrează", values: ["Acid salicilic și zinc, pentru acnee.", "Niacinamidă, pentru aspectul porilor."] },
          { label: "Ce se ia în calcul", values: ["Poate usca pielea sensibilă.", null] },
          { label: "Pentru cine", values: ["Ten mixt spre gras.", "Ten gras cu pori vizibili."], winner: 1 },
          { label: "Preț", values: ["82,50 Lei", "113,88 Lei"], winner: 0 },
        ],
        closing: [
          "Când alegi, uită-te întâi la ce te deranjează mai mult: coșurile sau porii. Textura " +
            "vine pe locul doi, dar contează dacă ai pielea sensibilă.",
          "Dacă problema principală e acneea, ia-o pe prima. Dacă vrei mai degrabă porii uniformi " +
            "și o senzație mai confortabilă, a doua e mai potrivită.",
        ],
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
