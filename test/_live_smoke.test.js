import { describe, it, expect, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

// Live smoke against the REAL Supabase (NativexSales), not a mock. Opt-in:
//   SB_URL=https://pidqzxymjhzlmoesfsba.supabase.co SB_KEY=<key> npx vitest run test/_live_smoke.test.js
// Skipped otherwise, so `npm test` and CI stay hermetic.
const LIVE = Boolean(process.env.SB_URL && process.env.SB_KEY);

vi.mock("@/api/supabaseClient", () => ({
  supabase: LIVE
    ? createClient(process.env.SB_URL, process.env.SB_KEY, { auth: { persistSession: false } })
    : null,
}));

describe.skipIf(!LIVE)("live catalog", () => {
  it("lists, counts, paginates and sorts against the real catalog", async () => {
    const { listProducts, countProducts, listCategories, countCategories } = await import(
      "@/api/catalog"
    );

    const total = await countProducts({});
    const page = await listProducts({ limit: 12 });
    console.log(`total activ: ${total}, pagina 1: ${page.length}`);
    // Loose bound, not an exact number: the catalog is synced from sole.ro and the
    // count moves on every run. An equality here would fail on the next sync.
    expect(total).toBeGreaterThan(2000);
    expect(page).toHaveLength(12);
    expect(page.every((p) => p.name && p.id)).toBe(true);

    // Offset paging must not repeat rows — the bug this catches is an unstable
    // sort, where two pages can both contain the same product.
    const page2 = await listProducts({ limit: 12, offset: 12 });
    const overlap = page2.filter((p) => page.some((q) => q.id === p.id));
    expect(overlap).toEqual([]);

    const tree = await listCategories();
    console.log("radacini:", tree.map((c) => `${c.name}=${c.productCount}`).join(", "));
    expect(tree.length).toBeGreaterThan(0);

    // The badge and the filter must agree: a root's count is a SUBTREE count, so
    // it has to match what the product query returns for that same slug.
    for (const root of tree) {
      const n = await countProducts({ category: root.slug });
      expect(n).toBe(root.productCount);
    }

    // Sum over roots == total. Catches double-counting in the view's recursion.
    const sum = tree.reduce((acc, c) => acc + c.productCount, 0);
    expect(sum).toBe(total);

    const biggest = tree[0];
    const sorted = await listProducts({ category: biggest.slug, sort: "price_asc", limit: 12 });
    const prices = sorted.map((p) => p.price);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);

    const counts = await countCategories();
    expect(counts.all).toBe(total);
    expect(counts[biggest.slug]).toBe(biggest.productCount);

    // A detail read has to return the heavy columns the grid omits.
    const { getProduct } = await import("@/api/catalog");
    const one = await getProduct(page[0].id);
    expect(one?.id).toBe(page[0].id);
  }, 120000);
});
