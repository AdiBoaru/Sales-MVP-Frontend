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
        "Pentru ten gras, caută o cremă **ușoară, non-comedogenică** și cu efect matifiant. Iată două variante pe care le recomand des:",
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
          reason: "Hidratare puternică 72h + niacinamidă pentru pori.",
          badges: [{ label: "Top Favorite", tone: "promo" }],
          highlights: [{ text: "Comandă până la 18:00, livrare mâine", tone: "success", icon: "truck" }],
          meta: [{ label: "Livrare", value: "Miercuri, 8 Iul." }],
          details:
            "Textură tip gel-cremă, se absoarbe fără peliculă grasă. Niacinamidă 4% — " +
            "bună pe termen lung pentru aspectul porilor și uniformizarea tenului.",
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
          { label: "Tip", values: ["Fluid matifiant", "Gel-cremă 72h"] },
          { label: "Ingredient cheie", values: ["Acid salicilic + zinc", "Niacinamidă 4%"] },
          { label: "Finish", values: ["Mat", "Mat-natural"] },
          { label: "Pentru cine", values: ["Ten mixt/gras", "Ten gras cu pori"] },
        ],
      },
      suggestions: ["Vreau opțiuni doar până în 90 lei"],
      offer: { kind: "quick_reply", label: "Adaugă-le pe ambele în coș", payload: "Adaugă ambele produse în coș" },
    },
  ];
}
