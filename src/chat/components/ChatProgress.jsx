// NX-245 — progresul, ca OGLINDĂ vizuală a stării reale.
//
// Ce s-a păstrat din NX-244: textul e exclusiv al serverului. `view.progress` dacă îl trimite,
// altfel anunțul a11y al statusului. Nu există timer, nu există „Analizez… Caut… Compar…" derulat
// local — o etapă inventată e o afirmație despre ce face serverul, pe care clientul n-o poate face.
//
// Ce s-a schimbat aici: rândul NU mai e regiune live. Era `role="status" aria-live="polite"`, iar
// de la NX-245 anunțurile au un singur proprietar (`ChatLiveRegion`). Două regiuni care poartă
// același text = două anunțuri pentru un eveniment. `aria-hidden="true"` e alegerea onestă:
// conținutul e un DUPLICAT al ceva deja anunțat, iar starea de ocupat ajunge la tehnologia
// asistivă prin `aria-busy` de pe transcript și prin controalele chiar dezactivate.
//
// Spinnerul respectă `prefers-reduced-motion` (regula e în `index.css`) și nu poartă nume
// accesibil: e decor lângă un text care spune deja ce se întâmplă.

/**
 * @param {{progress: {label: string, detail: string|null}|null, announced?: boolean}} props
 *   `announced` = regiunea live chiar are ce spune despre starea asta. Când e `false` (serverul a
 *   trimis progres, dar nu și copy-ul `a11y` — imposibil prin schemă, unde anunțurile sunt
 *   obligatorii, deci strict o plasă), rândul redevine el însuși regiune live. Alternativa ar fi
 *   tăcere completă pentru cine nu vede ecranul, adică exact ce interzice principiul 6.
 */
export default function ChatProgress({ progress, announced = true }) {
  if (progress === null || progress === undefined) return null
  return (
    <div
      className="flex justify-start"
      role={announced ? undefined : 'status'}
      aria-live={announced ? undefined : 'polite'}
      aria-hidden={announced ? 'true' : undefined}
    >
      <div className="inline-flex items-center gap-2.5 bg-white border border-[var(--aria-border)] rounded-2xl rounded-bl-md shadow-sm px-3.5 py-2.5">
        <span className="w-[13px] h-[13px] rounded-full border-2 border-[rgba(47,102,76,0.2)] border-t-[#7C3AED] aria-think-spinner shrink-0" />
        <span className="text-xs font-medium text-[var(--aria-purple)]">{progress.label}</span>
        {progress.detail ? (
          <span className="text-[11px] text-[var(--aria-text-4)]">{progress.detail}</span>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Textul de progres, ales DETERMINIST din ce a trimis serverul. Pur, exportat separat ca să poată
 * fi verificat fără DOM.
 *
 * @returns {{label: string, detail: string|null}|null}
 */
export function serverProgress({ progressStatus, view, announcements }) {
  if (progressStatus === null || progressStatus === undefined) return null
  const progress = view?.progress
  if (progress?.label) return { label: progress.label, detail: progress.detail ?? null }
  const announcement = announcements?.[progressStatus]
  return announcement ? { label: announcement, detail: null } : null
}
