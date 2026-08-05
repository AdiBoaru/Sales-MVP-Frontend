// ── Product copy → page panels ────────────────────────────────────────────────
// The catalogue keeps product copy in two places: `description`, one markdown-ish
// blob of "**Titlu**\nparagraf" blocks (the same eleven headings, in the same
// order, on all 300 products), and `attributes`, a structured JSON with specs,
// key ingredients, concerns, texture and finish.
//
// Pouring the blob straight into the page is what made the detail page read as
// machine output. This module regroups both sources into the panels a shopper
// actually scans — description, benefits, how to use, who it suits, specs — plus
// the short highlight pills that sit next to the buy button.
//
// Deliberately React-free: the vocabulary tables below are the interesting part
// and they are unit tested on their own (test/product-content.test.js).

function norm(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining marks: ă→a, ș→s, î→i
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function capitalize(value) {
  const text = String(value || "").trim();
  return text ? text[0].toLocaleUpperCase("ro-RO") + text.slice(1) : "";
}

function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * "Mira Atelier Balance Ser pentru ten — primul pas al rutinei…" → "Primul pas…"
 *
 * Every blurb in the catalogue opens by restating the product name. Directly
 * under the <h1> that repetition is the loudest tell that nobody wrote the page.
 */
export function stripNamePrefix(text, name) {
  const body = String(text || "").trim();
  const label = String(name || "").trim();
  if (!label || !body) return body;
  if (norm(body).slice(0, norm(label).length) !== norm(label)) return body;

  // Diacritic stripping is length-preserving for Romanian, so the normalized
  // prefix length is a safe cut point on the original string.
  const rest = body.slice(label.length).replace(/^[\s—–-]*[:,]?\s*/, "");
  return rest ? capitalize(rest) : body;
}

/**
 * Split the description blob into a lead paragraph plus its "**Titlu**" sections.
 * @returns {{ lead: string, sections: Array<{title: string, body: string}> }}
 */
export function parseDescription(description) {
  const lead = [];
  const sections = [];
  let current = null;

  for (const line of String(description || "").split(/\r?\n/)) {
    const heading = line.trim().match(/^\*\*(.+?)\*\*$/);
    if (heading) {
      current = { title: heading[1].trim(), body: [] };
      sections.push(current);
      continue;
    }
    (current ? current.body : lead).push(line);
  }

  return {
    lead: lead.join("\n").trim(),
    sections: sections
      .map((section) => ({ title: section.title, body: section.body.join("\n").trim() }))
      .filter((section) => section.body),
  };
}

// Which panel each authored section belongs to. Anything unlisted lands in
// "description", so a new heading in the catalogue is never dropped from the page.
const PANEL_OF_SECTION = new Map(
  Object.entries({
    "Ce face": "description",
    "Ce obții": "description",
    "De ce contează": "description",
    "Bine de știut": "description",
    "Ingredientele-cheie": "benefits",
    "Ingrediente-cheie": "benefits",
    "Textură și folosire": "usage",
    "În rutină": "usage",
    "Când îl folosești": "usage",
    "Sfaturi de aplicare": "usage",
    "De reținut": "usage",
    "Pentru cine": "fit",
    "Cum alegi": "fit",
  }).map(([title, panel]) => [norm(title), panel])
);

const GENERIC_INGREDIENT_TITLE = /^ingrediente(le)?-cheie$/;

// Specs surfaced by a dedicated panel — kept out of the spec table so the same
// value isn't printed twice on one page.
const SPECS_SHOWN_ELSEWHERE = new Set(
  ["Potrivit pentru", "Ingrediente-cheie", "Moment de folosire"].map(norm)
);

const SPEC_ORDER = [
  "Volum",
  "Textură",
  "Finish",
  "Acoperire",
  "Tip de păr",
  "SPF",
  "Fără",
  "Variante disponibile",
  "Cod EAN",
  "Cod producator",
].map(norm);

// Concern → shopper-facing benefit. Skin/hair *types* are deliberately absent:
// they answer "is this for me?" and belong to the "Potrivit pentru" panel, not to
// the three pills next to the buy button.
const CONCERN_HIGHLIGHT = {
  hidratare: { label: "Hidratare intensă", icon: "droplet" },
  calmare: { label: "Calmare", icon: "leaf" },
  luminozitate: { label: "Luminozitate", icon: "sparkles" },
  "protectie solara": { label: "Protecție solară", icon: "sun" },
  "ten gras": { label: "Control al sebumului", icon: "droplets" },
  ochi: { label: "Zona ochilor", icon: "eye" },
  "uz zilnic": { label: "Uz zilnic", icon: "repeat" },
};

const CONCERN_HIGHLIGHT_EN = {
  acne: { label: "Împotriva imperfecțiunilor", icon: "sparkles" },
  hyperpigmentation: { label: "Uniformizează tonul", icon: "sparkles" },
  anti_aging: { label: "Anti-age", icon: "sparkles" },
};

const TEXTURE_HIGHLIGHT = {
  gel: "Textură gel",
  "crema": "Textură cremă",
  fluid: "Textură fluidă",
  "apa": "Textură apoasă",
  lichid: "Textură lichidă",
  balsam: "Textură balsam",
  "lotiune": "Textură loțiune",
  ulei: "Textură ulei",
  unt: "Textură unt",
  "spuma": "Textură spumă",
};

const FINISH_LABEL = {
  dewy: "Finish luminos",
  matte: "Finish mat",
  satin: "Finish satinat",
  natural: "Finish natural",
};

const COVERAGE_LABEL = {
  light: "Acoperire ușoară",
  medium: "Acoperire medie",
  full: "Acoperire completă",
  buildable: "Acoperire modulabilă",
};

const HAIR_TYPE_LABEL = {
  "toate tipurile": "Toate tipurile de păr",
  curly: "Păr creț",
  cret: "Păr creț",
};

/**
 * Up to three pills for the buy box: the strongest claims we can actually back
 * with catalogue data, in descending order of usefulness to a shopper.
 * @returns {Array<{label: string, icon: string}>}
 */
export function buildHighlights(attributes) {
  const attrs = attributes || {};
  const candidates = [];

  if (attrs.spf) candidates.push({ label: `SPF ${attrs.spf}`, icon: "sun" });

  for (const concern of attrs._meta?._concerns_ro || []) {
    const hit = CONCERN_HIGHLIGHT[norm(concern)];
    if (hit) candidates.push(hit);
  }
  for (const concern of attrs.concerns || []) {
    const hit = CONCERN_HIGHLIGHT_EN[norm(concern)];
    if (hit) candidates.push(hit);
  }

  const finish = FINISH_LABEL[norm(attrs.finish)];
  if (finish) candidates.push({ label: finish, icon: "sparkles" });

  const coverage = COVERAGE_LABEL[norm(attrs.coverage)];
  if (coverage) candidates.push({ label: coverage, icon: "layers" });

  if (attrs.texture) {
    candidates.push({
      label: TEXTURE_HIGHLIGHT[norm(attrs.texture)] || `Textură ${attrs.texture}`,
      icon: "feather",
    });
  }

  if (attrs.fragrance_free === true) {
    candidates.push({ label: "Fără parfum adăugat", icon: "shield" });
  }

  return uniqueBy(candidates, (item) => item.label).slice(0, 3);
}

function fitChips(attrs) {
  const chips = [];

  const concerns = attrs._meta?._concerns_ro || [];
  if (concerns.length) {
    chips.push(...concerns.map(capitalize));
  } else if (attrs.specs?.["Potrivit pentru"]) {
    chips.push(
      ...String(attrs.specs["Potrivit pentru"])
        .split(/,| și /)
        .map((part) => capitalize(part.trim()))
        .filter(Boolean)
    );
  }

  for (const type of [].concat(attrs.hair_type || [])) {
    chips.push(HAIR_TYPE_LABEL[norm(type)] || `Păr ${type}`);
  }

  return [...new Set(chips)];
}

function specRows(attrs) {
  const specs = attrs.specs || {};
  const rows = Object.entries(specs)
    .filter(([label, value]) => value != null && String(value).trim() !== "")
    .filter(([label]) => !SPECS_SHOWN_ELSEWHERE.has(norm(label)))
    // A lone variant is not a spec, it's noise on 285 of 300 products.
    .filter(([label, value]) => norm(label) !== norm("Variante disponibile") || Number(value) > 1)
    .map(([label, value]) => ({ label, value: capitalize(String(value)) }));

  const rank = (row) => {
    const index = SPEC_ORDER.indexOf(norm(row.label));
    return index === -1 ? SPEC_ORDER.length : index;
  };
  return rows.sort((a, b) => rank(a) - rank(b));
}

/**
 * The collapsible panels under the buy box, in display order. Panels with no
 * content are omitted, so a thin product doesn't render empty rows.
 *
 * @param {{ name?: string, description?: string, attributes?: any }} product
 * @returns {Array<{id: string, title: string, lead?: string, chipsLabel?: string,
 *   chips?: string[], blocks?: Array<{title: string|null, body: string}>,
 *   specs?: Array<{label: string, value: string}>}>}
 */
export function buildProductPanels(product) {
  const attrs = product?.attributes || {};
  const { lead, sections } = parseDescription(product?.description);
  const ingredients = (attrs.key_ingredients || []).filter(Boolean);
  const ingredientTitles = new Set(ingredients.map(norm));

  const blocks = { description: [], benefits: [], usage: [], fit: [] };
  if (lead) blocks.description.push({ title: null, body: stripNamePrefix(lead, product?.name) });
  for (const section of sections) {
    // Some products name the ingredient block after the ingredient itself
    // ("**Ceai verde**") instead of using the generic heading.
    const panel = ingredientTitles.has(norm(section.title))
      ? "benefits"
      : PANEL_OF_SECTION.get(norm(section.title)) || "description";
    // The generic heading would land right under the "Ingrediente-cheie" chips
    // and say the same thing twice.
    const title = GENERIC_INGREDIENT_TITLE.test(norm(section.title)) ? null : section.title;
    blocks[panel].push({ title, body: section.body });
  }

  const specs = specRows(attrs);
  const fit = fitChips(attrs);
  const moment = attrs.specs?.["Moment de folosire"];

  const panels = [
    {
      id: "description",
      title: "Descriere",
      blocks: blocks.description,
    },
    {
      id: "benefits",
      title: ingredients.length ? "Beneficii și ingrediente-cheie" : "Beneficii",
      lead: attrs.key_benefit || "",
      chipsLabel: ingredients.length ? "Ingrediente-cheie" : "",
      chips: ingredients.map(capitalize),
      blocks: blocks.benefits,
    },
    {
      id: "usage",
      title: "Cum se folosește",
      chipsLabel: moment ? "Moment de folosire" : "",
      chips: moment ? [capitalize(moment)] : [],
      blocks: blocks.usage,
    },
    {
      // No lead line here: `attributes.best_for` reads as generated text ("ten
      // deshidratat și mixt și uscat"). The chips say the same thing cleanly.
      id: "fit",
      title: "Potrivit pentru",
      chips: fit,
      blocks: blocks.fit,
    },
    {
      id: "specs",
      title: "Specificații",
      specs,
    },
  ];

  return panels.filter(
    (panel) => panel.lead || panel.chips?.length || panel.blocks?.length || panel.specs?.length
  );
}

// Delivery promise, from the product's own `delivery_class`. Anything unknown
// falls back to the slower standard window rather than over-promising.
const DELIVERY_ETA = {
  next_day: "1-2 zile lucrătoare",
  standard: "2-4 zile lucrătoare",
  supplier: "3-6 zile lucrătoare",
};

export function deliveryEta(deliveryClass) {
  return DELIVERY_ETA[norm(deliveryClass)] || DELIVERY_ETA.standard;
}
