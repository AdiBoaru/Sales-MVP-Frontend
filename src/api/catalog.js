import { supabase } from "@/api/supabaseClient";

// ── Category classifier ───────────────────────────────────────────────────────
// The `categories` table is NOT anon-readable and `primary_category_id` doesn't
// map cleanly, so categories are DERIVED from the product name via ilike,
// server-side (keeps pagination + exact counts). `priority` resolves overlaps —
// LOWER number wins — so each product is counted once. Validated on all ~500
// products. Keep this array verbatim (see IMPLEMENTATION.md §5a).
export const CATEGORIES = [
  { value: "seruri",    label: "Seruri & Esențe",          priority: 9,  keywords: ["ser"] },
  { value: "creme",     label: "Creme & Hidratare",        priority: 11, keywords: ["crema", "ulei"] },
  { value: "masti",     label: "Măști",                    priority: 10, keywords: ["masca"] },
  { value: "toner",     label: "Tonere & Ape",             priority: 8,  keywords: ["toner"] },
  { value: "curatare",  label: "Curățare & Demachiere",    priority: 2,  keywords: ["de curatare", "micelar", "demachiant"] },
  { value: "accesorii", label: "Pensule & Accesorii",      priority: 7,  keywords: ["pensula", "burete", "accesoriu"] },
  { value: "par",       label: "Păr & Șampon",             priority: 4,  keywords: ["sampon", "balsam"] },
  { value: "machiaj",   label: "Machiaj",                  priority: 6,  keywords: ["ruj","gloss","fond de ten","de buze","fard","pudra","corector","rimel","creion","iluminator"] },
  { value: "spf",       label: "Protecție solară (SPF)",   priority: 1,  keywords: ["spf"] },
  { value: "corp",      label: "Corp & Deodorante",        priority: 3,  keywords: ["de dus", "deodorant"] },
  { value: "parfum",    label: "Parfumuri",                priority: 5,  keywords: ["parfum"] },
  { value: "diverse",   label: "Diverse",                  priority: 99, keywords: [] }, // fallback
];

const ALL_KEYWORDS = CATEGORIES.flatMap((c) => c.keywords);

// Apply a category filter to a Supabase query builder.
// For a category: OR over its own keywords, then EXCLUDE the keywords of every
// higher-priority category (lower number). `diverse` = matches no keyword at all.
function applyCategoryFilter(query, categoryValue) {
  if (!categoryValue || categoryValue === "all") return query;

  const cat = CATEGORIES.find((c) => c.value === categoryValue);
  if (!cat) return query;

  if (cat.value === "diverse") {
    for (const kw of ALL_KEYWORDS) query = query.not("name", "ilike", `%${kw}%`);
    return query;
  }

  const orExpr = cat.keywords.map((kw) => `name.ilike.%${kw}%`).join(",");
  if (orExpr) query = query.or(orExpr);

  const higher = CATEGORIES.filter((c) => c.priority < cat.priority);
  for (const c of higher) {
    for (const kw of c.keywords) query = query.not("name", "ilike", `%${kw}%`);
  }
  return query;
}

// Strip characters that would break a PostgREST .or() filter string.
function sanitizeSearch(search) {
  return String(search || "").replace(/[%,()*\\]/g, " ").trim();
}

function applySearchFilter(query, search) {
  const q = sanitizeSearch(search);
  if (!q) return query;
  return query.or(`name.ilike.%${q}%,short_description.ilike.%${q}%`);
}

function applySort(query, sort) {
  switch (sort) {
    case "price_asc":
      return query.order("price", { ascending: true });
    case "price_desc":
      return query.order("price", { ascending: false });
    case "rating":
      return query.order("rating", { ascending: false, nullsFirst: false });
    case "newest":
      // No reliable created-at column exposed; fall back to id desc.
      return query.order("id", { ascending: false });
    case "featured":
    default:
      return query.order("rating", { ascending: false, nullsFirst: false });
  }
}

// Normalize a DB row into the shape the UI consumes.
export function mapProduct(row) {
  if (!row) return null;

  const images = Array.isArray(row.product_images)
    ? [...row.product_images].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    : [];

  const price = Number(row.price) || 0;
  const salePrice = row.sale_price != null ? Number(row.sale_price) : null;
  const onSale = salePrice != null && salePrice > 0 && salePrice < price;
  const effectivePrice = onSale ? salePrice : price;
  const discountPercent = onSale && price > 0 ? Math.round((1 - salePrice / price) * 100) : 0;

  const stockTotal = row.stock_total != null ? Number(row.stock_total) : null;
  const availabilityStr = String(row.availability ?? "").trim().toLowerCase();
  // Prefer stock_total when present. Only consult `availability` as a fallback, and
  // match whole negative tokens (anchored) — NOT a bare "0", which would flag any
  // value containing the digit 0 (e.g. "10 in stoc", "20").
  const availabilitySaysOut =
    row.availability === false ||
    availabilityStr === "0" ||
    /\b(out\s*of\s*stock|unavailable|sold\s*out|epuizat|indisponibil)\b/.test(availabilityStr);
  const inStock = stockTotal != null ? stockTotal > 0 : !availabilitySaysOut;

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    shortDescription: row.short_description || "",
    description: row.description || "",
    currency: row.currency || "RON",
    price,
    salePrice,
    onSale,
    effectivePrice,
    discountPercent,
    availability: row.availability,
    status: row.status,
    stockTotal,
    inStock,
    rating: row.rating != null ? Number(row.rating) : null,
    reviewCount: row.review_count != null ? Number(row.review_count) : 0,
    productUrl: row.product_url || "",
    image: images[0]?.url || "",
    images,
  };
}

const PRODUCT_SELECT = "*, product_images(url,alt,position)";

// ── Public API ────────────────────────────────────────────────────────────────
/** @param {{ search?: string, category?: string, sort?: string, limit?: number, offset?: number }} [opts] */
export async function listProducts({ search, category, sort, limit = 24, offset = 0 } = {}) {
  if (!supabase) return [];
  let query = supabase.from("products").select(PRODUCT_SELECT).eq("status", "active");
  query = applySearchFilter(query, search);
  query = applyCategoryFilter(query, category);
  query = applySort(query, sort);
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) {
    console.error("[catalog] listProducts:", error.message);
    return [];
  }
  return (data || []).map(mapProduct);
}

export async function getProduct(id) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("id", id)
    .eq("status", "active")
    .single();
  if (error) {
    console.error("[catalog] getProduct:", error.message);
    return null;
  }
  return mapProduct(data);
}

/** @param {{ search?: string, category?: string }} [opts] */
export async function countProducts({ search, category } = {}) {
  if (!supabase) return 0;
  let query = supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");
  query = applySearchFilter(query, search);
  query = applyCategoryFilter(query, category);

  const { count, error } = await query;
  if (error) {
    console.error("[catalog] countProducts:", error.message);
    return 0;
  }
  return count || 0;
}

// { all, seruri, creme, ... } for the sidebar badges.
export async function countCategories() {
  if (!supabase) return { all: 0 };
  const entries = await Promise.all(
    CATEGORIES.map(async (c) => [c.value, await countProducts({ category: c.value })])
  );
  const all = await countProducts({});
  return { all, ...Object.fromEntries(entries) };
}
