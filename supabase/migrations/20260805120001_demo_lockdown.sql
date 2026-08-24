-- ════════════════════════════════════════════════════════════════════════════
-- Catalog lockdown — the switch that actually closes the demo.
--
-- Split out of 20260805120000_demo_access.sql ON PURPOSE. That migration is inert:
-- it only ADDS machinery, so it can be applied to a live shop with no visible
-- effect. This one is the irreversible-feeling half — the moment it runs, the anon
-- key in the deployed bundle reads nothing.
--
-- Run it LAST, after the edge function is deployed, the frontend with the gate is
-- live, and you have redeemed a real code end to end. Then the shop closes with
-- zero downtime instead of going blank while you finish deploying.
--
-- To reopen (rollback):
--   grant select on public.products, public.product_images,
--                   public.categories, public.store_categories to anon;
-- ════════════════════════════════════════════════════════════════════════════

-- After this, the anon key in the bundle reads NOTHING. `authenticated` (i.e. a
-- redeemed session) keeps the read access the storefront needs.
do $$
declare
  rel text;
begin
  foreach rel in array array['products', 'product_images', 'categories', 'store_categories']
  loop
    if to_regclass('public.' || rel) is not null then
      execute format('revoke all on public.%I from anon', rel);
      execute format('grant select on public.%I to authenticated', rel);
    end if;
  end loop;
end;
$$;

-- Belt and braces on the base tables: policies still apply to `authenticated`.
do $$
declare
  rel text;
begin
  foreach rel in array array['products', 'product_images', 'categories']
  loop
    if to_regclass('public.' || rel) is not null then
      execute format('alter table public.%I enable row level security', rel);
      execute format('drop policy if exists demo_authenticated_read on public.%I', rel);
      execute format(
        'create policy demo_authenticated_read on public.%I for select to authenticated using (true)', rel);
    end if;
  end loop;
end;
$$;

-- `store_categories` is a view: make it run with the CALLER's privileges so it
-- can never become a side door around the base tables' RLS.
do $$
begin
  if to_regclass('public.store_categories') is not null then
    execute 'alter view public.store_categories set (security_invoker = true)';
  end if;
end;
$$;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect ZERO rows. Any row here is a table `anon` can still read.
--   select table_name, privilege_type
--     from information_schema.role_table_grants
--    where grantee = 'anon'
--      and table_name in ('products','product_images','categories','store_categories');
