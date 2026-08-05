import { describe, it, expect, vi, beforeEach } from "vitest";

// A Supabase query builder is a THENABLE: awaiting one runs the query. The fake
// below reproduces that faithfully, because it is the whole point of this suite —
// code that does `query = await someAsyncHelper(query)` gets back `{ data, error }`
// instead of the builder, and the next `.order()` blows up. That shipped once and
// emptied the store page; these tests are the net.
function makeBuilder(name, resolve) {
  const calls = [];
  const builder = {
    name,
    calls,
    argsOf(method) {
      const hit = calls.find((c) => c[0] === method);
      return hit ? hit.slice(1) : null;
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve(resolve()).then(onFulfilled, onRejected);
    },
  };
  for (const method of ["select", "eq", "or", "not", "in", "order", "range", "single"]) {
    builder[method] = (...args) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  return builder;
}

const CATEGORY_ROWS = [
  { id: "c-machiaj", parent_id: null, name: "Machiaj", slug: "machiaj", product_count: 13 },
  { id: "c-rujuri", parent_id: "c-machiaj", name: "Rujuri", slug: "rujuri", product_count: 6 },
  { id: "c-pudre", parent_id: "c-machiaj", name: "Pudre", slug: "pudre", product_count: 7 },
  { id: "c-solar", parent_id: null, name: "Protecție solară", slug: "protectie-solara", product_count: 6 },
];

const PRODUCT_ROWS = [
  { id: "p1", name: "Ruj mat", slug: "ruj-mat", price: 40, status: "active", stock_total: 3 },
];

let builders;

function installSupabase() {
  builders = {};
  vi.doMock("@/api/supabaseClient", () => ({
    supabase: {
      from(table) {
        const b = makeBuilder(table, () =>
          table === "store_categories"
            ? { data: CATEGORY_ROWS, error: null }
            : { data: PRODUCT_ROWS, error: null, count: PRODUCT_ROWS.length }
        );
        (builders[table] ||= []).push(b);
        return b;
      },
    },
  }));
}

async function freshCatalog() {
  vi.resetModules();
  installSupabase();
  return import("@/api/catalog");
}

beforeEach(() => {
  vi.resetModules();
});

describe("category filtering", () => {
  it("keeps the builder alive: sort and pagination survive the category lookup", async () => {
    const { listProducts } = await freshCatalog();
    const products = await listProducts({ category: "machiaj", sort: "price_asc", limit: 12 });

    const q = builders.products[0];
    expect(q.argsOf("order")).toEqual(["price", { ascending: true }]);
    expect(q.argsOf("range")).toEqual([0, 11]);
    expect(products).toHaveLength(1);
    expect(products[0].name).toBe("Ruj mat");
  });

  it("matches the whole subtree, not just the category row", async () => {
    const { listProducts } = await freshCatalog();
    await listProducts({ category: "machiaj" });

    const [column, ids] = builders.products[0].argsOf("in");
    expect(column).toBe("primary_category_id");
    expect([...ids].sort()).toEqual(["c-machiaj", "c-pudre", "c-rujuri"]);
  });

  it("filters on a leaf by itself", async () => {
    const { listProducts } = await freshCatalog();
    await listProducts({ category: "rujuri" });
    expect(builders.products[0].argsOf("in")).toEqual(["primary_category_id", ["c-rujuri"]]);
  });

  it("does not filter for 'all', for no category, or for an unknown slug", async () => {
    const { listProducts } = await freshCatalog();
    await listProducts({ category: "all" });
    await listProducts({});
    await listProducts({ category: "nu-exista" });
    for (const q of builders.products) expect(q.argsOf("in")).toBeNull();
  });

  it("counts through the same path, with search still applied", async () => {
    const { countProducts } = await freshCatalog();
    const total = await countProducts({ category: "rujuri", search: "mat" });

    const q = builders.products[0];
    expect(total).toBe(1);
    expect(q.argsOf("in")).toEqual(["primary_category_id", ["c-rujuri"]]);
    expect(q.argsOf("or")[0]).toContain("name.ilike.%mat%");
  });

  it("reads the category tree once per session, however many callers ask", async () => {
    const { listProducts, listCategories, countCategories } = await freshCatalog();
    await Promise.all([
      listCategories(),
      countCategories(),
      listProducts({ category: "machiaj" }),
      listProducts({ category: "rujuri" }),
    ]);
    expect(builders.store_categories).toHaveLength(1);
  });
});

describe("category tree", () => {
  it("nests children under roots and sorts by size", async () => {
    const { listCategories } = await freshCatalog();
    const tree = await listCategories();

    expect(tree.map((c) => c.slug)).toEqual(["machiaj", "protectie-solara"]);
    expect(tree[0].children.map((c) => c.slug)).toEqual(["pudre", "rujuri"]);
    expect(tree[1].children).toEqual([]);
  });

  it("exposes counts keyed by slug, plus the catalog total", async () => {
    const { countCategories } = await freshCatalog();
    const counts = await countCategories();

    expect(counts.machiaj).toBe(13);
    expect(counts.rujuri).toBe(6);
    expect(counts.all).toBe(PRODUCT_ROWS.length);
  });
});
