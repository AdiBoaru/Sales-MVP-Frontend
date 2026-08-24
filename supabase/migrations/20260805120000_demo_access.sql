-- ════════════════════════════════════════════════════════════════════════════
-- Demo access gate — server-side half.
--
-- The storefront is a static SPA on Hostinger: its Supabase anon key ships inside
-- the JS bundle, so ANY gate implemented in React is decoration. The real gate is
-- here — after this migration `anon` cannot read the catalog at all, and a visitor
-- only gets a readable session by redeeming a valid code through the `redeem-code`
-- edge function.
--
-- Three deliberate choices:
--
--  1. Code storage. `code_hash` is HMAC-SHA256(code, DEMO_CODE_PEPPER) — not bcrypt.
--     Codes are 40+ bits of CSPRNG output, not user-chosen passwords, so slow
--     hashing buys nothing; HMAC gives an O(1) indexed lookup instead of a table
--     scan, and the pepper lives only in the edge function's env, so a stolen DB
--     dump alone never yields a usable code.
--
--  2. Schema placement. These tables live in `demo`, which is NOT in PostgREST's
--     exposed-schema list. They are unreachable over the REST API with any browser
--     key regardless of RLS — a second, independent lock.
--
--  3. Grants over policies. The catalog lockdown is a REVOKE, not a policy rewrite.
--     Grants are checked BEFORE row-level security, so revoking from `anon` also
--     closes VIEWS (`store_categories`), which do not enforce the underlying
--     tables' RLS unless created with `security_invoker`.
--
-- This migration is INERT: it only adds machinery. Applying it to a live shop
-- changes nothing a visitor can see. The switch that actually closes the catalog
-- is the next migration, 20260805120001_demo_lockdown.sql — run that one last,
-- once the gate is deployed and you have redeemed a real code.
--
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

create schema if not exists demo;
revoke all on schema demo from public, anon, authenticated;

-- ── Codes ───────────────────────────────────────────────────────────────────
-- One row per issued code. `auth_email` is the synthetic Supabase user the code
-- signs in as; its password is never stored — the edge function derives it as
-- HMAC(DEMO_AUTH_PEPPER, id), so there is no credential at rest to leak.
create table if not exists demo.access_codes (
  id            uuid primary key default gen_random_uuid(),
  code_hash     text        not null unique,
  auth_email    text        not null unique,
  label         text,                    -- "Acme SRL — Ionescu", for the audit trail
  lead_email    text,
  user_id       uuid,                    -- auth.users.id, set by the issuing script
  max_uses      integer     not null default 10,
  uses          integer     not null default 0,
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- ── Audit / rate-limit ledger ───────────────────────────────────────────────
-- The IP is stored HASHED (HMAC, same pepper): enough to throttle a single
-- attacker, not enough to be a personal-data liability.
create table if not exists demo.redeem_attempts (
  id         bigserial primary key,
  ip_hash    text        not null,
  code_id    uuid references demo.access_codes(id) on delete set null,
  ok         boolean     not null,
  reason     text        not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists redeem_attempts_ip_recent_idx
  on demo.redeem_attempts (ip_hash, created_at desc);
create index if not exists redeem_attempts_code_idx
  on demo.redeem_attempts (code_id, created_at desc);

-- ── The redemption transaction ──────────────────────────────────────────────
-- Throttle → look up → validate → consume, in ONE statement-level transaction.
-- The consume step is a conditional UPDATE (`where uses < max_uses`), so two
-- simultaneous requests on a code with one use left cannot both win.
--
-- SECURITY DEFINER with `search_path = ''`: it runs as the owner (needed to touch
-- the unexposed `demo` schema) and every identifier below is schema-qualified, so
-- a hostile search_path cannot redirect a single lookup.
create or replace function public.redeem_demo_code(
  p_code_hash  text,
  p_ip_hash    text,
  p_user_agent text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code   demo.access_codes%rowtype;
  v_fails  integer;
  v_uses   integer;
  v_reason text;
begin
  -- 1. Per-IP throttle. Without this, a 40-bit code is brute-forceable; with it,
  --    5 wrong guesses per 15 min makes the search space take millennia.
  select count(*) into v_fails
    from demo.redeem_attempts
   where ip_hash = p_ip_hash
     and not ok
     and created_at > now() - interval '15 minutes';

  if v_fails >= 5 then
    insert into demo.redeem_attempts (ip_hash, ok, reason, user_agent)
      values (p_ip_hash, false, 'throttled', p_user_agent);
    return jsonb_build_object('status', 'throttled');
  end if;

  -- 2. Look up by hash. Unknown code and wrong code are the same path.
  select * into v_code from demo.access_codes where code_hash = p_code_hash;

  if not found then
    insert into demo.redeem_attempts (ip_hash, ok, reason, user_agent)
      values (p_ip_hash, false, 'invalid', p_user_agent);
    return jsonb_build_object('status', 'invalid');
  end if;

  -- 3. Validate. A revoked code reports `invalid` — revocation should look like
  --    the code never existed, so a leaked-and-killed code gives no signal back.
  v_reason := case
    when v_code.revoked_at is not null    then 'invalid'
    when v_code.expires_at <= now()       then 'expired'
    when v_code.uses >= v_code.max_uses   then 'exhausted'
    else null
  end;

  if v_reason is not null then
    insert into demo.redeem_attempts (ip_hash, code_id, ok, reason, user_agent)
      values (p_ip_hash, v_code.id, false, v_reason, p_user_agent);
    return jsonb_build_object('status', v_reason);
  end if;

  -- 4. Consume, atomically.
  update demo.access_codes
     set uses = uses + 1, last_used_at = now()
   where id = v_code.id
     and uses < max_uses
  returning uses into v_uses;

  if v_uses is null then           -- lost the race against a concurrent redeem
    insert into demo.redeem_attempts (ip_hash, code_id, ok, reason, user_agent)
      values (p_ip_hash, v_code.id, false, 'exhausted', p_user_agent);
    return jsonb_build_object('status', 'exhausted');
  end if;

  insert into demo.redeem_attempts (ip_hash, code_id, ok, reason, user_agent)
    values (p_ip_hash, v_code.id, true, 'ok', p_user_agent);

  return jsonb_build_object(
    'status',     'ok',
    'id',         v_code.id,
    'auth_email', v_code.auth_email,
    'label',      v_code.label,
    'expires_at', v_code.expires_at,
    'uses',       v_uses,
    'max_uses',   v_code.max_uses
  );
end;
$$;

-- Only the edge function (service_role) may call it. `anon`/`authenticated` are
-- explicitly stripped: a SECURITY DEFINER function callable by anon would hand a
-- brute-forcer an unthrottled oracle.
revoke all on function public.redeem_demo_code(text, text, text) from public, anon, authenticated;
grant execute on function public.redeem_demo_code(text, text, text) to service_role;

-- ── Admin surface ───────────────────────────────────────────────────────────
-- scripts/demo-codes.mjs drives these. They exist because `demo` is unexposed:
-- rather than open the schema to PostgREST just so the issuing script can reach
-- it, three narrow SECURITY DEFINER functions are the entire write surface — and
-- `service_role` is the only grantee.
create or replace function public.issue_demo_code(
  p_id         uuid,
  p_code_hash  text,
  p_auth_email text,
  p_user_id    uuid,
  p_label      text default null,
  p_lead_email text default null,
  p_max_uses   integer default 10,
  p_days       integer default 14
) returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into demo.access_codes
    (id, code_hash, auth_email, user_id, label, lead_email, max_uses, expires_at)
  values
    (p_id, p_code_hash, p_auth_email, p_user_id, p_label, p_lead_email, p_max_uses,
     now() + make_interval(days => p_days))
  returning id;
$$;

create or replace function public.list_demo_codes()
returns table (
  id uuid, label text, lead_email text, user_id uuid,
  uses integer, max_uses integer,
  expires_at timestamptz, revoked_at timestamptz, last_used_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select id, label, lead_email, user_id, uses, max_uses,
         expires_at, revoked_at, last_used_at, created_at
    from demo.access_codes
   order by created_at desc;
$$;

-- Returns the synthetic user so the caller can also kill live sessions — a row
-- flag alone would leave already-issued JWTs valid until they expire.
create or replace function public.revoke_demo_code(p_id uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$
  update demo.access_codes
     set revoked_at = coalesce(revoked_at, now())
   where id = p_id
  returning user_id;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.issue_demo_code(uuid, text, text, uuid, text, text, integer, integer)',
    'public.list_demo_codes()',
    'public.revoke_demo_code(uuid)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
