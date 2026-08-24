#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// Demo access codes — issue / list / revoke.
//
//   node scripts/demo-codes.mjs issue --label "Acme SRL — Ionescu" \
//        --email ionescu@acme.ro --days 14 --uses 10
//   node scripts/demo-codes.mjs list
//   node scripts/demo-codes.mjs revoke <id>
//
// Runs on YOUR machine with the service_role key, never in CI and never in the
// browser. Reads .env.local; nothing here may ever be prefixed VITE_.
//
// The plaintext code is printed ONCE, at issue time, and is unrecoverable
// afterwards — only its HMAC reaches the database. Losing it means issuing a new
// one, which is the property that makes a DB dump worthless.
// ════════════════════════════════════════════════════════════════════════════

import { createHmac, randomInt, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ── env ─────────────────────────────────────────────────────────────────────
function loadEnvLocal() {
  try {
    // Split on /\r?\n/, not "\n": a CRLF file would leave a trailing \r that the
    // regex below cannot consume (JS `.` excludes line terminators), so every
    // CRLF line would be skipped in silence — and on Windows that is most of them.
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env.local — rely on the real environment */
  }
}
loadEnvLocal();

const {
  VITE_SUPABASE_URL: SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  DEMO_CODE_PEPPER,
  DEMO_AUTH_PEPPER,
} = process.env;

const missing = Object.entries({
  VITE_SUPABASE_URL: SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  DEMO_CODE_PEPPER,
  DEMO_AUTH_PEPPER,
})
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length) {
  console.error(`Lipsesc din .env.local: ${missing.join(", ")}`);
  console.error("Generează pepperele o singură dată cu:  openssl rand -hex 32");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── code shape ──────────────────────────────────────────────────────────────
// Crockford-ish alphabet: no 0/O/1/I/L/U — the characters people mistype when
// copying a code out of an email. 10 symbols over 32 = 50 bits, which the
// function's 5-per-15-min throttle turns into an unreachable search space.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LEN = 10;

function generateCode() {
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return `NX${out}`;
}

// Display form only — the edge function strips non-alphanumerics before hashing,
// so NX-4K7M2-P9QAF and nx4k7m2p9qaf are the same secret.
function pretty(code) {
  return `${code.slice(0, 2)}-${code.slice(2, 7)}-${code.slice(7)}`;
}

// --code lets you pick your own (a standing code for yourself, a memorable one for
// a big account). The floor is 10 characters: the edge function's throttle turns
// brute force into a non-event only if the search space is large enough to begin
// with, and a 4-digit code falls to a few dozen proxied IPs in hours.
//
// Length is not the whole story — "ADMIN2026" is 9 characters and still guessable.
// A chosen code should be a phrase nobody would try, not a short random-looking one.
const MIN_CUSTOM_LEN = 10;

function normalizeCustom(raw) {
  const clean = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length < MIN_CUSTOM_LEN) {
    throw new Error(
      `Codul "${raw}" are ${clean.length} caractere alfanumerice; minimul e ${MIN_CUSTOM_LEN}.\n` +
        `    Încearcă ceva de tipul --code "adi-nativex-2026" (se normalizează la ADINATIVEX2026).`,
    );
  }
  return clean;
}

const hmac = (pepper, msg) => createHmac("sha256", pepper).update(msg).digest("hex");
const derivePassword = (id) => hmac(DEMO_AUTH_PEPPER, `demo-user:${id}`);

// ── args ────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[++i];
    else out._.push(argv[i]);
  }
  return out;
}

// ── commands ────────────────────────────────────────────────────────────────
async function issue(args) {
  const id = randomUUID();
  const code = args.code ? normalizeCustom(args.code) : generateCode();
  const authEmail = `demo+${id}@codes.nativextech.com`;
  const days = Number(args.days ?? 14);
  const maxUses = Number(args.uses ?? 10);

  // 1. The synthetic identity the session will belong to. Its password is derived
  //    from the id, so it is reproducible by the edge function and stored nowhere.
  const { data: user, error: userError } = await admin.auth.admin.createUser({
    email: authEmail,
    password: derivePassword(id),
    email_confirm: true,
    user_metadata: { demo_code_id: id, label: args.label ?? null },
  });
  if (userError) throw new Error(`createUser: ${userError.message}`);

  // 2. The code row. Only the HMAC goes in.
  const { error } = await admin.rpc("issue_demo_code", {
    p_id: id,
    p_code_hash: hmac(DEMO_CODE_PEPPER, code),
    p_auth_email: authEmail,
    p_user_id: user.user.id,
    p_label: args.label ?? null,
    p_lead_email: args.email ?? null,
    p_max_uses: maxUses,
    p_days: days,
  });
  if (error) {
    await admin.auth.admin.deleteUser(user.user.id).catch(() => {});
    // `code_hash` is unique, so re-issuing a custom code that already exists lands
    // here. Say so plainly instead of leaking a Postgres constraint name.
    if (error.code === "23505") {
      throw new Error(`Codul ăsta e deja emis. Revocă-l întâi, sau alege altul.`);
    }
    throw new Error(`issue_demo_code: ${error.message}`);
  }

  const expires = new Date(Date.now() + days * 864e5);
  console.log(`\n  Cod:      ${args.code ? code : pretty(code)}`);
  console.log(`  Pentru:   ${args.label ?? "—"}${args.email ? ` <${args.email}>` : ""}`);
  console.log(`  Expiră:   ${expires.toLocaleDateString("ro-RO")} (${days} zile)`);
  console.log(`  Activări: ${maxUses}`);
  console.log(`  id:       ${id}\n`);
  if (!args.code) console.log("  ⚠  Codul NU mai poate fi recuperat. Trimite-l acum.\n");
}

async function list() {
  const { data, error } = await admin.rpc("list_demo_codes");
  if (error) throw new Error(error.message);
  if (!data?.length) return console.log("Niciun cod emis.");

  const now = Date.now();
  const state = (r) =>
    r.revoked_at ? "REVOCAT"
    : new Date(r.expires_at).getTime() <= now ? "EXPIRAT"
    : r.uses >= r.max_uses ? "EPUIZAT"
    : "activ";

  console.table(
    data.map((r) => ({
      id: r.id.slice(0, 8),
      stare: state(r),
      pentru: r.label ?? r.lead_email ?? "—",
      folosiri: `${r.uses}/${r.max_uses}`,
      expiră: new Date(r.expires_at).toLocaleDateString("ro-RO"),
      ultima: r.last_used_at ? new Date(r.last_used_at).toLocaleString("ro-RO") : "—",
    })),
  );
}

async function revoke(args) {
  const idPrefix = args._[1];
  if (!idPrefix) throw new Error("Lipsește id-ul: demo-codes.mjs revoke <id>");

  const { data: all, error: listError } = await admin.rpc("list_demo_codes");
  if (listError) throw new Error(listError.message);

  const matches = all.filter((r) => r.id.startsWith(idPrefix));
  if (matches.length !== 1) {
    throw new Error(matches.length ? `"${idPrefix}" e ambiguu (${matches.length} coduri).` : `Niciun cod cu id ${idPrefix}.`);
  }

  const { data: userId, error } = await admin.rpc("revoke_demo_code", { p_id: matches[0].id });
  if (error) throw new Error(error.message);

  // Flagging the row stops NEW redemptions; banning the user stops the refresh
  // that keeps an ALREADY-open session alive. Access tokens already in a browser
  // stay valid until they expire — that window is the "Access token expiry"
  // setting in Auth (see DEMO_ACCESS.md; keep it at 30 min).
  if (userId) {
    const { error: banError } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: "876000h",
    });
    if (banError) console.warn(`  ⚠ sesiunile active n-au putut fi închise: ${banError.message}`);
  }

  console.log(`Revocat: ${matches[0].label ?? matches[0].id}`);
}

// ── main ────────────────────────────────────────────────────────────────────
const args = parseArgs(process.argv.slice(2));
const commands = { issue, list, revoke };
const command = commands[args._[0]];

if (!command) {
  console.error("Comenzi: issue | list | revoke\n");
  console.error('  node scripts/demo-codes.mjs issue --label "Acme SRL" --email x@acme.ro --days 14 --uses 10');
  console.error('  node scripts/demo-codes.mjs issue --label "Adi" --code "adi-nativex-2026" --days 3650 --uses 999');
  console.error("  node scripts/demo-codes.mjs list");
  console.error("  node scripts/demo-codes.mjs revoke <id>\n");
  console.error("  --code  cod ales de tine (min. 10 caractere alfanumerice);");
  console.error("          fără el se generează unul aleator, afișat o singură dată.");
  process.exit(1);
}

command(args).catch((e) => {
  console.error(`\n  ✖ ${e.message}\n`);
  process.exit(1);
});
