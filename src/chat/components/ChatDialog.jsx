// NX-245 — launcherul și panelul, cu semantică de dialog care chiar înseamnă ceva.
//
// Două moduri, decise de viewport (DoR):
//
//   • MOBIL — panelul acoperă tot ecranul, deci e `aria-modal="true"`: fundal inert, focus trap,
//     scroll lock. Pagina de dedesubt nu mai există nici vizual, nici pentru screen reader.
//   • DESKTOP — panelul e un drawer lateral, restul vitrinei rămâne vizibil și utilizabil, deci
//     `aria-modal="false"`: FĂRĂ trap și FĂRĂ inert. Cine vrea să se uite la produsul din spate în
//     timp ce întreabă despre el poate.
//
// Panelul se randează într-un PORTAL pe `<body>`. Nu din modă: „fundal inert" înseamnă „frații
// mei din body sunt inerți", iar cât timp panelul stă îngropat în arborele vitrinei, el însuși ar
// fi înăuntrul a ceea ce încearcă să dezactiveze.
//
// Launcherul se DEMONTEAZĂ cât timp panelul e deschis, fiindcă panelul îi ocupă exact locul pe
// ecran. Consecința asupra ARIA e deliberată: `aria-controls` se emite numai când panelul chiar
// există în DOM. Un IDREF care nu rezolvă e o violare axe (`aria-valid-attr-value`) și o minciună
// spusă tehnologiei asistive; iar alternativa — un launcher rămas montat, invizibil sub panel —
// ar pune în tab order un buton pe care nimeni nu-l vede. Întoarcerea focusului nu depinde de el:
// `useReturnFocus` preferă declanșatorul real (butonul din antet, dacă de acolo s-a deschis) și
// cade pe launcherul proaspăt montat abia când acela nu mai există.

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MessageCircle, Plus, X } from 'lucide-react'
import { DIALOG_MODES, useResponsiveDialogMode } from '../a11y/useResponsiveDialogMode.js'
import { useModalIsolation } from '../a11y/useModalIsolation.js'
import { useReturnFocus } from '../a11y/useReturnFocus.js'
import { TECHNICAL_COPY } from '../v2/technicalCopy.js'

/**
 * @param {{open: boolean, onOpenChange: (open: boolean) => void, chrome: object|null,
 *   newChatDisabled: boolean, onNewChat: () => void, initialFocusRef?: {current: any},
 *   onMetric?: (name: string, labels: object) => void, children: any}} props
 */
export default function ChatDialog({
  open,
  onOpenChange,
  chrome,
  newChatDisabled,
  onNewChat,
  initialFocusRef,
  onMetric,
  children,
}) {
  const mode = useResponsiveDialogMode()
  const modal = mode === DIALOG_MODES.MOBILE_MODAL
  const panelRef = useRef(null)
  const launcherRef = useRef(null)
  const titleRef = useRef(null)
  const onMetricRef = useRef(onMetric)
  onMetricRef.current = onMetric

  // ID-uri STABILE pe viața componentei: `aria-labelledby`/`aria-describedby`/`aria-controls` se
  // rup tăcut dacă se regenerează la fiecare render.
  const base = useId()
  const panelId = `${base}-panel`
  const titleId = `${base}-title`
  const descriptionId = `${base}-description`

  const metric = useCallback((name, labels) => onMetricRef.current?.(name, labels), [])

  // Hostul de portal: creat o dată, atașat la `<body>` și ȘTERS la unmount. Fără ștergere, 20 de
  // cicluri deschis/închis lasă 20 de `<div>`-uri orfane în body (atacul Codex #9).
  const [host] = useState(() => {
    if (typeof document === 'undefined') return null
    const node = document.createElement('div')
    // Marcaj de identitate, nu de stil: face hostul de negăsit-greșit când se numără scurgerile
    // (un `<div>` gol pe `<body>` arată identic cu containerul oricărei alte biblioteci).
    node.setAttribute('data-nx-chat-portal', '')
    return node
  })
  const hostRef = useRef(host)
  // `useLayoutEffect`, nu `useEffect`: React randează panelul în hostul încă DETAȘAT, iar un efect
  // pasiv l-ar atașa abia după prima pictare — adică un cadru în care dialogul e „deschis" și nu se
  // vede nimic. Rulează și înaintea izolării modale, deci `background()` vede deja hostul și nu-l
  // face inert pe el însuși.
  useLayoutEffect(() => {
    if (host === null) return undefined
    document.body.appendChild(host)
    return () => {
      if (host.parentNode !== null) host.parentNode.removeChild(host)
    }
  }, [host])

  useModalIsolation({
    active: open && modal,
    containerRef: panelRef,
    hostRef,
    onError: (area) => metric('web_widget_client_error_total', { area }),
  })

  useReturnFocus(open, {
    fallbackRef: launcherRef,
    containerRef: panelRef,
    onOutcome: (outcome) => metric('web_widget_focus_restore_total', { outcome }),
  })

  // Escape închide în AMBELE moduri. Pe `document`, în capture: dacă focusul e pe un control care
  // oprește propagarea (sau a scăpat în afara panelului pe desktop), tasta tot ajunge aici.
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open, onOpenChange])

  // Focus inițial „conform stării": composerul dacă poate fi folosit, altfel titlul. Nu punem
  // focusul pe un input dezactivat (browserul l-ar refuza și ar rămâne pe `<body>`), și nu-l
  // aruncăm pe primul buton din antet, care ar fi „Conversație nouă" — adică exact controlul care
  // șterge conversația, oferit ca primă țintă a tastei Enter.
  useEffect(() => {
    if (!open) return
    metric('web_widget_dialog_open_total', { mode })
    const target = initialFocusRef?.current ?? null
    if (target !== null && target.disabled !== true && typeof target.focus === 'function') {
      target.focus()
      return
    }
    if (titleRef.current !== null) {
      titleRef.current.focus()
      return
    }
    // Ultima plasă: PANELUL însuși. Se ajunge aici când composerul e dezactivat ȘI serverul n-a
    // livrat titlu (bootstrap picat) — fără ea, focusul ar rămâne pe `<body>`, adică în afara unui
    // dialog care tocmai a declarat fundalul inert. Exact tiparul recomandat de ARIA APG.
    panelRef.current?.focus()
    // Numai la DESCHIDERE. Cu `mode` în dependențe, un resize mobil↔desktop ar re-fura focusul
    // din locul în care userul tocmai citea.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) {
    return (
      <button
        ref={launcherRef}
        type="button"
        onClick={() => onOpenChange(true)}
        aria-haspopup="dialog"
        aria-expanded={false}
        className="nx-chat-launcher fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 aria-gradient-bg hover:opacity-90 text-white font-semibold pl-4 pr-5 py-3 rounded-full shadow-lg transition-opacity min-h-[44px]"
      >
        <MessageCircle className="w-4 h-4" aria-hidden="true" />
        {/* Numele vine de la server. Fallbackul TEHNIC intră doar cât timp bootstrapul n-a
            răspuns (sau a eșuat): un buton fără nume accesibil e mai rău decât unul generic. */}
        <span>{chrome?.launcher_label ?? TECHNICAL_COPY.launcherFallback}</span>
      </button>
    )
  }

  const titled = Boolean(chrome?.dialog_title)
  const panel = (
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      // `-1`: țintă de focus programatic (ultima plasă de mai sus), niciodată în tab order —
      // `focusableWithin` exclude explicit `tabindex="-1"`, deci nu intră în ciclul trapului.
      tabIndex={-1}
      aria-modal={modal}
      // Numele dialogului: titlul serverului dacă există. Fără el (bootstrap picat) folosim ACELAȘI
      // fallback tehnic ca launcherul — nu un string nou, și în niciun caz copy comercial.
      aria-labelledby={titled ? titleId : undefined}
      aria-label={titled ? undefined : TECHNICAL_COPY.launcherFallback}
      aria-describedby={chrome?.dialog_description ? descriptionId : undefined}
      className="aria-widget nx-chat-panel fixed inset-y-0 right-0 z-50 w-full max-w-full sm:w-[452px] bg-white border-l border-[var(--aria-border-2)] shadow-2xl flex flex-col outline-none"
    >
      <div className="h-[2px] aria-gradient-bg flex-shrink-0" />

      <header className="flex items-center justify-between gap-2 min-[380px]:gap-3 px-3 min-[380px]:px-[18px] py-3 border-b border-[var(--aria-border-2)] flex-shrink-0">
        <div className="min-w-0 flex-1">
          {titled ? (
            // `tabindex=-1`: țintă de focus programatic la deschidere, dar NU în tab order.
            <h2
              ref={titleRef}
              id={titleId}
              tabIndex={-1}
              className="aria-heading text-base leading-tight text-[var(--aria-text)] truncate outline-none"
            >
              {chrome.dialog_title}
            </h2>
          ) : null}
          {chrome?.dialog_description ? (
            <p
              id={descriptionId}
              className="hidden min-[360px]:block text-[10.5px] leading-tight tracking-[0.04em] text-[var(--aria-text-3)] truncate"
            >
              {chrome.dialog_description}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {chrome?.new_chat_label ? (
            <button
              type="button"
              onClick={onNewChat}
              disabled={newChatDisabled}
              className="hidden min-[430px]:inline-flex items-center gap-1 text-xs font-medium text-[var(--aria-purple)] bg-[rgba(47,102,76,0.07)] hover:bg-[rgba(47,102,76,0.12)] px-2.5 py-1 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              {chrome.new_chat_label}
            </button>
          ) : null}
          {/* Închiderea rămâne activă ORICÂND, inclusiv în plin tur: turul e al serverului și
              continuă fără noi. Un widget care nu se poate închide cât „lucrează" e o capcană. */}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={chrome?.close_label ?? TECHNICAL_COPY.closeFallback}
            title={chrome?.close_label ?? TECHNICAL_COPY.closeFallback}
            className="relative w-8 h-8 rounded-lg flex items-center justify-center text-[var(--aria-text-3)] hover:bg-[var(--aria-surface-2)] after:absolute after:content-[''] after:-inset-1.5 after:rounded-lg"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      {children}
    </div>
  )

  return host === null ? panel : createPortal(panel, host)
}
