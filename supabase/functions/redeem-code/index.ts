// ════════════════════════════════════════════════════════════════════════════
// POST /functions/v1/redeem-code   { "code": "NX7K2M-P4QA" }
//
// The only door into the demo catalog. Takes a code, returns a real Supabase
// session (24h by default) or an error — never any hint about which codes exist
// beyond what the caller already proved by holding one.
//
// The code itself is NEVER compared in the browser and never stored in clear
// anywhere: the DB holds HMAC-SHA256(code, DEMO_CODE_PEPPER) and the pepper lives
// only in this function's environment.
//
// Deploy:
//   supabase functions deploy redeem-code --no-verify-jwt
// (`--no-verify-jwt` is required and correct — the caller is by definition not yet
// authenticated. Authorization is the code, enforced below.)
//
// Secrets:
//   supabase secrets set DEMO_CODE_PEPPER=... DEMO_AUTH_PEPPER=... \
//                        DEMO_ALLOWED_ORIGINS=https://demo.nativextech.com
// ════════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CODE_PEPPER = Deno.env.get("DEMO_CODE_PEPPER")!;
const AUTH_PEPPER = Deno.env.get("DEMO_AUTH_PEPPER")!;

// Strict allowlist. Not "*": a wildcard would let any page on the internet drive
// this endpoint with a victim's network position.
const ALLOWED_ORIGINS = (Deno.env.get("DEMO_ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGINS[0] ?? "null",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// ── crypto helpers ──────────────────────────────────────────────────────────
async function hmacHex(pepper: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// "nx 7k2m-p4qa" and "NX7K2MP4QA" are the same code. Users retype from an email;
// punctuation and case are not part of the secret.
function normalizeCode(raw: unknown): string {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// The synthetic user's password, derived rather than stored — nothing to steal at
// rest. Same derivation lives in scripts/demo-codes.mjs when the user is created.
function derivePassword(codeId: string): Promise<string> {
  return hmacHex(AUTH_PEPPER, `demo-user:${codeId}`);
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
}

// User-facing copy. `invalid` covers "never existed" and "revoked" alike.
const MESSAGES: Record<string, string> = {
  invalid: "Cod invalid. Verifică-l și încearcă din nou.",
  expired: "Codul a expirat. Cere unul nou de pe nativextech.com.",
  exhausted: "Codul a atins numărul maxim de activări.",
  throttled: "Prea multe încercări. Așteaptă 15 minute și revino.",
  error: "Ceva n-a mers. Încearcă din nou peste câteva momente.",
};

const HTTP_STATUS: Record<string, number> = {
  invalid: 401,
  expired: 401,
  exhausted: 403,
  throttled: 429,
  error: 500,
};

function fail(status: string, cors: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ ok: false, reason: status, message: MESSAGES[status] ?? MESSAGES.error }),
    { status: HTTP_STATUS[status] ?? 400, headers: { ...cors, "Content-Type": "application/json" } },
  );
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("error", cors);

  try {
    const body = await req.json().catch(() => ({}));
    const code = normalizeCode(body.code);

    // Cheap shape check before touching the DB — keeps junk out of the ledger.
    if (code.length < 6 || code.length > 32) return fail("invalid", cors);

    const [codeHash, ipHash] = await Promise.all([
      hmacHex(CODE_PEPPER, code),
      hmacHex(CODE_PEPPER, clientIp(req)),
    ]);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await admin.rpc("redeem_demo_code", {
      p_code_hash: codeHash,
      p_ip_hash: ipHash,
      p_user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
    });

    if (error) {
      console.error("[redeem-code] rpc:", error.message);
      return fail("error", cors);
    }
    if (data?.status !== "ok") return fail(data?.status ?? "error", cors);

    // Valid code → mint a session by signing in as the code's synthetic user.
    // Deliberately NOT a hand-rolled JWT: this reuses Supabase's own expiry,
    // refresh and revocation machinery instead of reimplementing it.
    const auth = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data: signIn, error: signInError } = await auth.auth.signInWithPassword({
      email: data.auth_email,
      password: await derivePassword(data.id),
    });

    if (signInError || !signIn.session) {
      // The code was valid but its user is missing/banned — an issuing problem,
      // not the visitor's fault. Loud in the logs, generic on the wire.
      console.error("[redeem-code] signIn:", signInError?.message ?? "no session");
      return fail("error", cors);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        label: data.label ?? null,
        expiresAt: data.expires_at,
        usesLeft: data.max_uses - data.uses,
        session: {
          access_token: signIn.session.access_token,
          refresh_token: signIn.session.refresh_token,
        },
      }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[redeem-code]", e);
    return fail("error", cors);
  }
});
