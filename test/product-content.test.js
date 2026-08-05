import { describe, it, expect } from "vitest";
import {
  buildHighlights,
  buildProductPanels,
  deliveryEta,
  parseDescription,
  stripNamePrefix,
} from "@/lib/productContent";

// A real row, trimmed: the catalogue writes the same eleven "**Titlu**" blocks on
// every product, so the bucketing below is what the whole detail page depends on.
const DESCRIPTION = [
  "Mira Atelier Balance Ser pentru ten — pentru hidratare, ten mixt și ten uscat.",
  "",
  "**Ce face**",
  "Pielea deshidratată nu e neapărat piele uscată.",
  "",
  "**Acid hialuronic**",
  "Trage apa în straturile de suprafață.",
  "",
  "**Ingredientele-cheie**",
  "Acid hialuronic și vitamina C, în aceeași formulă.",
  "",
  "**Textură și folosire**",
  "Textura de fluid se absoarbe rapid.",
  "",
  "**În rutină**",
  "Aplică 3-4 picături pe pielea curată.",
  "",
  "**Pentru cine**",
  "Formula e gândită pentru hidratare.",
  "",
  "**Titlu nou din catalog**",
  "Text pe care harta de secțiuni nu îl cunoaște.",
].join("\n");

const ATTRIBUTES = {
  _meta: { _concerns_ro: ["hidratare", "ten mixt", "uz zilnic"] },
  specs: {
    Volum: "30 ml",
    "Cod EAN": "0146696211494",
    "Textură": "fluid",
    "Potrivit pentru": "hidratare, ten mixt și ten uscat",
    "Ingrediente-cheie": "acid hialuronic, vitamina C",
    "Moment de folosire": "dimineața și seara",
    "Variante disponibile": "1",
  },
  texture: "fluid",
  best_for: "ten deshidratat și mixt",
  concerns: ["hydration", "combination"],
  key_benefit: "Hidratează și echilibrează pielea.",
  key_ingredients: ["acid hialuronic", "vitamina C"],
  fragrance_free: true,
};

const PRODUCT = { name: "Mira Atelier Balance Ser pentru ten", description: DESCRIPTION, attributes: ATTRIBUTES };

const panelById = (id) => buildProductPanels(PRODUCT).find((panel) => panel.id === id);
const titlesOf = (panel) => panel.blocks.map((block) => block.title);

describe("stripNamePrefix", () => {
  it("drops the restated product name and re-capitalizes", () => {
    expect(stripNamePrefix("Mira Atelier Balance Ser pentru ten — primul pas al rutinei.", PRODUCT.name)).toBe(
      "Primul pas al rutinei."
    );
  });

  it("matches through diacritics", () => {
    expect(stripNamePrefix("Gel de curățare — curăță blând.", "Gel de curatare")).toBe("Curăță blând.");
  });

  it("leaves unrelated copy alone", () => {
    expect(stripNamePrefix("Ser cu acid hialuronic.", PRODUCT.name)).toBe("Ser cu acid hialuronic.");
  });
});

describe("parseDescription", () => {
  it("splits the lead paragraph from its sections", () => {
    const { lead, sections } = parseDescription(DESCRIPTION);
    expect(lead).toMatch(/^Mira Atelier Balance Ser pentru ten —/);
    expect(sections.map((s) => s.title)).toEqual([
      "Ce face",
      "Acid hialuronic",
      "Ingredientele-cheie",
      "Textură și folosire",
      "În rutină",
      "Pentru cine",
      "Titlu nou din catalog",
    ]);
    expect(sections[0].body).toBe("Pielea deshidratată nu e neapărat piele uscată.");
  });

  it("survives an empty description", () => {
    expect(parseDescription("")).toEqual({ lead: "", sections: [] });
  });
});

describe("buildProductPanels", () => {
  it("keeps the panel order of the design", () => {
    expect(buildProductPanels(PRODUCT).map((p) => p.id)).toEqual([
      "description",
      "benefits",
      "usage",
      "fit",
      "specs",
    ]);
  });

  it("files an ingredient-named section under benefits, not description", () => {
    // The generic "Ingredientele-cheie" heading is dropped: it would print right
    // under the chips label that already says it.
    expect(titlesOf(panelById("benefits"))).toEqual(["Acid hialuronic", null]);
    expect(panelById("benefits").chips).toEqual(["Acid hialuronic", "Vitamina C"]);
    expect(panelById("benefits").lead).toBe("Hidratează și echilibrează pielea.");
  });

  it("routes usage and fit sections to their own panels", () => {
    expect(titlesOf(panelById("usage"))).toEqual(["Textură și folosire", "În rutină"]);
    expect(panelById("usage").chips).toEqual(["Dimineața și seara"]);
    expect(titlesOf(panelById("fit"))).toEqual(["Pentru cine"]);
    expect(panelById("fit").chips).toEqual(["Hidratare", "Ten mixt", "Uz zilnic"]);
    // `best_for` ("ten deshidratat și mixt și uscat") is deliberately not printed.
    expect(panelById("fit").lead).toBeUndefined();
  });

  it("never drops an unknown heading — it lands in the description", () => {
    const description = panelById("description");
    expect(titlesOf(description)).toEqual([null, "Ce face", "Titlu nou din catalog"]);
    // The lead loses the restated name; the <h1> right above it already said it.
    expect(description.blocks[0].body).toMatch(/^Pentru hidratare/);
  });

  it("hides specs that already have their own panel, plus the lone variant", () => {
    expect(panelById("specs").specs).toEqual([
      { label: "Volum", value: "30 ml" },
      { label: "Textură", value: "Fluid" },
      { label: "Cod EAN", value: "0146696211494" },
    ]);
  });

  it("omits panels with nothing in them", () => {
    expect(buildProductPanels({ name: "Ruj mat", description: "", attributes: {} })).toEqual([]);
    expect(buildProductPanels(null)).toEqual([]);
  });
});

describe("buildHighlights", () => {
  it("prefers benefits over skin types and caps at three", () => {
    expect(buildHighlights(ATTRIBUTES).map((h) => h.label)).toEqual([
      "Hidratare intensă",
      "Uz zilnic",
      "Textură fluidă",
    ]);
  });

  it("leads with SPF and reads makeup attributes", () => {
    expect(
      buildHighlights({ spf: 50, finish: "matte", coverage: "full", texture: "cremă" }).map((h) => h.label)
    ).toEqual(["SPF 50", "Finish mat", "Acoperire completă"]);
  });

  it("falls back to the raw texture for a value it has no phrasing for", () => {
    expect(buildHighlights({ texture: "pudră" })).toEqual([{ label: "Textură pudră", icon: "feather" }]);
  });

  it("returns nothing when there is nothing to claim", () => {
    expect(buildHighlights({})).toEqual([]);
    expect(buildHighlights(null)).toEqual([]);
  });
});

describe("deliveryEta", () => {
  it("maps the delivery class, and never over-promises on an unknown one", () => {
    expect(deliveryEta("next_day")).toBe("1-2 zile lucrătoare");
    expect(deliveryEta("supplier")).toBe("3-6 zile lucrătoare");
    expect(deliveryEta("")).toBe("2-4 zile lucrătoare");
    expect(deliveryEta("something_new")).toBe("2-4 zile lucrătoare");
  });
});
