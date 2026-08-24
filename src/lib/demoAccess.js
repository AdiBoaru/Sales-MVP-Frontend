// Demo access gate — client half.
//
// This module holds NO secret and makes NO decision. It posts the code to the
// `redeem-code` edge function and installs whatever session comes back; the
// verdict is the server's. Tampering with anything here (short-circuiting
// `useDemoAccess`, deleting the gate from the DOM) yields a storefront whose
// every query returns empty, because `anon` has no grants on the catalog.
//
// See supabase/functions/redeem-code/index.ts for the other half.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const REDEEM_URL = `${SUPABASE_URL}/functions/v1/redeem-code`;

const GENERIC_ERROR = "Nu am putut verifica codul. Verifică conexiunea și încearcă din nou.";

/** Aceeași normalizare ca în funcția edge: majuscule, fără separatori. Cratimele
 *  și spațiile nu fac parte din secret — oamenii retasteaza codul dintr-un e-mail. */
function normalizeCode(raw) {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// ── Codul implicit ──────────────────────────────────────────────────────────
// Jumătatea de SERVER a porții nu e instalată pe proiectul Supabase: `public.
// redeem_demo_code` nu există, iar `anon` citește în continuare catalogul
// (verificat cu cheia de service). Cu funcția `redeem-code` nedeploiată, orice
// cod cade pe ramura de rețea de mai jos, deci poarta nu lasă pe nimeni înăuntru
// — nici pe tine. Constanta asta e ușa de serviciu până se fac pașii 1–6 din
// DEMO_ACCESS.md.
//
// Ce NU e: protecție. Stă în clar în bundle, deci o vede oricine deschide
// DevTools. Nu slăbește însă nimic real, fiindcă azi catalogul e public oricum.
// Iar în ziua în care rulezi migrația de lockdown, ușa se închide de la sine:
// fără sesiune Supabase, `anon` nu mai citește nimic și magazinul rămâne gol —
// exact proprietatea pe care se sprijină tot designul („poarta nu e în React").
//
// Ca s-o scoți: `VITE_DEMO_DEFAULT_CODE=` (gol) în env, sau șterge constanta.
const DEFAULT_CODE = normalizeCode(import.meta.env.VITE_DEMO_DEFAULT_CODE ?? "1234");

/** Cel mai scurt cod acceptabil — coboară cu codul implicit, ca butonul de
 *  submit să nu rămână blocat pe o parolă de 4 cifre. */
export const MIN_CODE_LEN = DEFAULT_CODE ? Math.min(6, DEFAULT_CODE.length) : 6;

const LOCAL_OPEN_KEY = "nx-demo-default-open";

/** localStorage aruncă în private mode / cu cookies blocate; o poartă căzută
 *  acolo ar fi mai rea decât una care doar nu ține minte. */
function readDefaultOpen() {
  try {
    return localStorage.getItem(LOCAL_OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDefaultOpen(open) {
  try {
    if (open) localStorage.setItem(LOCAL_OPEN_KEY, "1");
    else localStorage.removeItem(LOCAL_OPEN_KEY);
  } catch {
    /* fără persistență: rămâne deschis până la reload */
  }
}

/** Display helper: NX4K7M2P9QAF -> NX-4K7M2-P9QAF. Cosmetic only — the server
 *  strips separators before hashing, so formatting can never break a valid code.
 *  Gruparea se aplică DOAR formei emise (`NX…`): un cod ales de mână, „1234" sau
 *  „adi-nativex-2026", n-are structura aia și grupat ar apărea „12-34". */
export function formatCode(raw) {
  const clean = normalizeCode(raw).slice(0, 12);
  if (!clean.startsWith("NX")) return clean;
  const parts = [clean.slice(0, 2), clean.slice(2, 7), clean.slice(7, 12)].filter(Boolean);
  return parts.join("-");
}

/**
 * Trade a code for a session.
 * @param {string} code
 * @returns {Promise<{ ok: boolean, message?: string, label?: string|null, expiresAt?: string }>}
 */
export async function redeemCode(code) {
  // Înaintea oricărui apel de rețea: cât timp funcția edge nu e deployată, nu are
  // cine valida nimic, iar un round-trip inutil ar întoarce doar GENERIC_ERROR.
  if (DEFAULT_CODE && normalizeCode(code) === DEFAULT_CODE) {
    writeDefaultOpen(true);
    return { ok: true, label: null, expiresAt: null };
  }

  if (!supabase) return { ok: false, message: GENERIC_ERROR };

  let payload;
  try {
    const res = await fetch(REDEEM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Supabase's gateway wants a key on every /functions/v1 call even when the
        // function itself runs with verify_jwt = false.
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ code: String(code || "").trim() }),
    });
    payload = await res.json();
  } catch {
    // Network/CORS failure — never report this as "wrong code", or a prospect on a
    // flaky connection retypes a perfectly good code until it hits the throttle.
    return { ok: false, message: GENERIC_ERROR };
  }

  if (!payload?.ok) return { ok: false, message: payload?.message || GENERIC_ERROR };

  const { error } = await supabase.auth.setSession(payload.session);
  if (error) return { ok: false, message: GENERIC_ERROR };

  return { ok: true, label: payload.label ?? null, expiresAt: payload.expiresAt };
}

export async function endDemoSession() {
  writeDefaultOpen(false);
  if (supabase) await supabase.auth.signOut();
}

/**
 * Gate state for the protected routes.
 * @returns {{ status: "checking"|"locked"|"open", submit: (code: string) => Promise<{ok: boolean, message?: string}> }}
 */
export function useDemoAccess() {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    // Ușa de serviciu, verificată prima: e singura care nu depinde de un server.
    if (readDefaultOpen()) {
      setStatus("open");
      return;
    }
    if (!supabase) {
      setStatus("locked");
      return;
    }
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (alive) setStatus(data?.session ? "open" : "locked");
    });

    // Re-locks the UI by itself when a session ends — including the case that
    // matters: a revoked code whose refresh is now rejected, which surfaces here
    // as SIGNED_OUT without the visitor doing anything.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) setStatus(session ? "open" : "locked");
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const submit = useCallback(async (code) => {
    const result = await redeemCode(code);
    if (result.ok) setStatus("open");
    return result;
  }, []);

  return { status, submit };
}
