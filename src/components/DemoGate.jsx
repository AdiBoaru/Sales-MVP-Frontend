import React, { useState } from "react";
import { ArrowRight, KeyRound, Loader2 } from "lucide-react";
import { formatCode, useDemoAccess, MIN_CODE_LEN } from "@/lib/demoAccess";
import { BRAND } from "@/lib/brand";

const SIGNUP_URL = "https://nativextech.com/";

// Entry screen for the protected routes. Purely a courtesy: the catalog is closed
// at the database, so removing this component from the tree yields an empty shop,
// not an open one. Its job is to explain the lock and take the code — the verdict
// comes from the redeem-code edge function.
export default function DemoGate({ children }) {
  const { status, submit } = useDemoAccess();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (status === "open") return children;

  if (status === "checking") {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-brand-600 rounded-full animate-spin" />
      </div>
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");
    const result = await submit(code);
    // On success this component unmounts (status flips to "open"); only the
    // failure path needs to restore the form.
    if (!result.ok) {
      setError(result.message);
      setBusy(false);
    }
  }

  // Pragul vine din `demoAccess`, nu e o constantă locală: cu un cod implicit de
  // 4 cifre, un `< 6` hardcodat aici ar ține butonul dezactivat pe parola corectă.
  const tooShort = code.replace(/[^A-Z0-9]/gi, "").length < MIN_CODE_LEN;

  return (
    <main className="aria-lux is-light min-h-screen bg-[var(--color-void)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-[var(--color-hair)] bg-[var(--color-surface)] p-7 md:p-9">
          <span className="inline-flex items-center gap-2 rounded-full bg-[var(--color-chip)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-ink)]">
            <KeyRound className="h-3 w-3" aria-hidden="true" />
            Acces demo
          </span>

          <h1 className="mt-5 font-heading text-2xl font-bold text-[var(--color-ink)]">
            Introdu codul de acces
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-soft)]">
            Demo-ul {BRAND.name} este privat. Ai primit un cod pe e-mail după ce
            te-ai înscris — scrie-l mai jos ca să deschizi magazinul.
          </p>

          <form onSubmit={handleSubmit} className="mt-7" noValidate>
            <label
              htmlFor="demo-code"
              className="block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-mute)]"
            >
              Cod de acces
            </label>

            <input
              id="demo-code"
              name="demo-code"
              type="text"
              value={code}
              onChange={(e) => {
                setCode(formatCode(e.target.value));
                setError("");
              }}
              placeholder="NX-XXXXX-XXXXX"
              // A demo code is not a saved credential: no autofill, no spellcheck,
              // no mobile keyboard "helpfully" capitalising or correcting it.
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode="text"
              autoFocus
              disabled={busy}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "demo-code-error" : undefined}
              className="mt-2 w-full rounded-xl border border-[var(--color-hair)] bg-[var(--color-void)] px-4 py-3 font-mono text-lg tracking-[0.12em] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] placeholder:tracking-normal outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-chip)] disabled:opacity-60"
            />

            <div className="min-h-[1.5rem] pt-2">
              {error && (
                <p
                  id="demo-code-error"
                  role="alert"
                  className="text-sm leading-snug text-[var(--color-ember)]"
                >
                  {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={busy || tooShort}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)] px-5 py-3 text-sm font-semibold text-[var(--color-on-accent)] transition hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Se verifică…
                </>
              ) : (
                <>
                  Intră în magazin
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-[var(--color-ink-mute)]">
          N-ai încă un cod?{" "}
          <a
            href={SIGNUP_URL}
            className="font-semibold text-[var(--color-accent-ink)] underline underline-offset-4"
          >
            Înscrie-te la demo
          </a>
        </p>
      </div>
    </main>
  );
}
