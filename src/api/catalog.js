import { supabase } from "@/api/supabaseClient";

// ── Categories ────────────────────────────────────────────────────────────────
// Read from the DB, not guessed. Source is the `store_categories` view (migration
// 039): it exposes only categories that actually carry active products — 6 roots
// over ~36 children, from the 102 rows in the table — each with a SUBTREE product
// count. One request feeds both the menu and its badges.
//
// The view deliberately omits `categories.path`: 19 of 102 rows have a `path`
// that contradicts `parent_id`, so the hierarchy comes from `parent_id` alone.
const CATEGORY_SELECT = "id,parent_id,name,slug,product_count";

// { tree, bySlug, subtreeIds } — resolved once per session. We cache the PROMISE
// so concurrent callers (sidebar + product query, on first paint) share a single
// request instead of racing two.
let categoriesPromise = null;

function buildCategoryIndex(rows) {
  const bySlug = new Map();
  const byId = new Map();
  const childrenOf = new Map();

  for (const r of rows) {
    const cat = {
      id: r.id,
      parentId: r.parent_id,
      name: r.name,
      slug: r.slug,
      productCount: r.product_count ?? 0,
      children: [],
    };
    bySlug.set(cat.slug, cat);
    byId.set(cat.id, cat);
  }
  for (const cat of byId.values()) {
    const siblings = childrenOf.get(cat.parentId) || [];
    siblings.push(cat);
    childrenOf.set(cat.parentId, siblings);
  }

  const byCount = (a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name, "ro");
  for (const cat of byId.values()) {
    cat.children = (childrenOf.get(cat.id) || []).sort(byCount);
  }
  // The exposed set is closed upwards — a category with products always has its
  // parent exposed too — so a null parent really does mean "root".
  const tree = [...byId.values()].filter((c) => !c.parentId).sort(byCount);

  // A root's filter must match products hanging off it directly AND off any
  // descendant: "Îngrijirea buzelor" holds its 7 products on the root itself,
  // while "Machiaj" holds all 101 on children.
  const subtreeIds = new Map();
  const collect = (cat) => {
    const ids = [cat.id];
    for (const child of cat.children) ids.push(...collect(child));
    subtreeIds.set(cat.slug, ids);
    return ids;
  };
  for (const root of tree) collect(root);

  return { tree, bySlug, subtreeIds };
}

function loadCategories() {
  if (!supabase) return Promise.resolve(buildCategoryIndex([]));
  if (!categoriesPromise) {
    categoriesPromise = supabase
      .from("store_categories")
      .select(CATEGORY_SELECT)
      .then(({ data, error }) => {
        if (error) {
          console.error("[catalog] loadCategories:", error.message);
          categoriesPromise = null; // let the next caller retry
          return buildCategoryIndex([]);
        }
        return buildCategoryIndex(data || []);
      });
  }
  return categoriesPromise;
}

// The ids to match for one category: itself + every descendant. null = no filter
// (no category selected, or a slug we don't know — same as the old classifier did
// for an unknown value).
//
// ⚠ This resolves to an ARRAY on purpose, and the caller applies `.in()` itself.
// It must never `return query` from an async function: a Supabase query builder is
// a THENABLE, so `await` on a promise resolving to one doesn't hand back the
// builder — it runs the query and resolves with `{ data, error }`. The builder is
// gone by the time the next `.order()` is chained, and the whole listing throws.
async function categorySubtreeIds(categorySlug) {
  if (!categorySlug || categorySlug === "all") return null;
  const { subtreeIds } = await loadCategories();
  const ids = subtreeIds.get(categorySlug);
  return ids && ids.length ? ids : null;
}

/**
 * Menu tree: roots, each with `children`, both carrying `productCount`.
 * @returns {Promise<Array<{id: string, parentId: string|null, name: string, slug: string, productCount: number, children: any[]}>>}
 */
export async function listCategories() {
  const { tree } = await loadCategories();
  return tree;
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

// Lighter column set for grid/list views — omits the heavy `description` body
// (only the detail page needs it), which noticeably shrinks the list payload.
const LIST_SELECT =
  "id,name,slug,short_description,currency,price,sale_price,availability,status,stock_total,rating,review_count,product_url, product_images(url,alt,position)";

// ── Public API ────────────────────────────────────────────────────────────────
/** @param {{ search?: string, category?: string, sort?: string, limit?: number, offset?: number }} [opts] */
export async function listProducts({ search, category, sort, limit = 24, offset = 0 } = {}) {
  if (!supabase) return [];
  const categoryIds = await categorySubtreeIds(category);

  let query = supabase.from("products").select(LIST_SELECT).eq("status", "active");
  query = applySearchFilter(query, search);
  if (categoryIds) query = query.in("primary_category_id", categoryIds);
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
  const categoryIds = await categorySubtreeIds(category);

  let query = supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");
  query = applySearchFilter(query, search);
  if (categoryIds) query = query.in("primary_category_id", categoryIds);

  const { count, error } = await query;
  if (error) {
    console.error("[catalog] countProducts:", error.message);
    return 0;
  }
  return count || 0;
}

// { all, "machiaj": 101, "rujuri": 6, ... } — slug → subtree count, for the
// sidebar badges. The counts ride along with the category list, so this costs
// one request for every category plus one for the `all` total; it used to be one
// count query per category.
export async function countCategories() {
  if (!supabase) return { all: 0 };
  const [{ bySlug }, all] = await Promise.all([loadCategories(), countProducts({})]);
  const counts = { all };
  for (const cat of bySlug.values()) counts[cat.slug] = cat.productCount;
  return counts;
}
