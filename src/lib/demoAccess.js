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

/** Display helper: NX4K7M2P9QAF -> NX-4K7M2-P9QAF. Cosmetic only — the server
 *  strips separators before hashing, so formatting can never break a valid code. */
export function formatCode(raw) {
  const clean = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  const parts = [clean.slice(0, 2), clean.slice(2, 7), clean.slice(7, 12)].filter(Boolean);
  return parts.join("-");
}

/**
 * Trade a code for a session.
 * @param {string} code
 * @returns {Promise<{ ok: boolean, message?: string, label?: string|null, expiresAt?: string }>}
 */
export async function redeemCode(code) {
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
  if (supabase) await supabase.auth.signOut();
}

/**
 * Gate state for the protected routes.
 * @returns {{ status: "checking"|"locked"|"open", submit: (code: string) => Promise<{ok: boolean, message?: string}> }}
 */
export function useDemoAccess() {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
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
