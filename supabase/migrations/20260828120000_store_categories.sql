-- ─────────────────────────────────────────────────────────────────────────────
-- `store_categories` — the menu source the storefront reads (src/api/catalog.js).
--
-- WHY THIS LIVES HERE NOW. The view used to come from the backend's migration 039,
-- on the old Supabase project (ref xfczucwqntefethxxien). The move to NativexSales
-- (ref pidqzxymjhzlmoesfsba) brought the catalog tables across but not the view, so
-- `loadCategories()` failed with PGRST205 ("Could not find the table") and the
-- sidebar rendered empty while the product grid worked — the two reads are
-- independent. Recreated here so the storefront owns the one object it cannot run
-- without, rather than depending on a backend migration that may not travel.
--
-- CONTRACT — do not change without changing buildCategoryIndex() in catalog.js:
--   id, parent_id, name, slug, product_count
-- `business_id` is deliberately ABSENT: catalog.js reads ownership from the base
-- table in a second query, and adding the column here would silently make that
-- read look redundant when it is the only thing scoping the menu to one tenant.
--
-- product_count is a SUBTREE count, not a direct one. "Machiaj" holds 2 products
-- directly and 679 across its five children; a badge showing 2 would read as broken.
-- The recursion is what makes the root filter and its badge agree.
--
-- Only categories whose subtree carries at least one ACTIVE product are exposed.
-- That filter is closed upwards for free: if a child has products, every ancestor's
-- subtree contains them too, so a category can never surface without its parent.
--
-- security_invoker = true: the view runs with the CALLER's privileges, so the RLS
-- on products/categories still applies. Without it a view owned by `postgres` would
-- hand `anon` everything the owner can see — including other tenants' rows and
-- non-active products — which is precisely what the RLS policies exist to prevent.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view public.store_categories
with (security_invoker = true)
as
with recursive subtree as (
  -- Every category is in its own subtree; that is what makes a leaf's count equal
  -- its direct count instead of zero.
  select id as root_id, id as node_id
  from public.categories
  union all
  select s.root_id, c.id
  from public.categories c
  join subtree s on c.parent_id = s.node_id
),
counts as (
  select s.root_id, count(p.id)::int as product_count
  from subtree s
  join public.products p
    on p.primary_category_id = s.node_id
   and p.status = 'active'
  group by s.root_id
)
select
  c.id,
  c.parent_id,
  c.name,
  c.slug,
  counts.product_count
from public.categories c
join counts on counts.root_id = c.id
where counts.product_count > 0;

comment on view public.store_categories is
  'Storefront menu: categories with at least one active product in their subtree, each with a subtree product count. Read by src/api/catalog.js.';

-- The view is a separate object from its base tables, so the tables'' grants do
-- not reach it. Read-only, and only for the two roles the storefront ever uses.
grant select on public.store_categories to anon, authenticated;
