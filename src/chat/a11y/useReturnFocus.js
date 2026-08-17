// NX-245 — focusul se întoarce de unde a plecat.
//
// Fără asta, închiderea widgetului cu Escape sau cu butonul de close lasă focusul pe `<body>`:
// următorul Tab reia de la începutul paginii, iar cine navighează cu tastatura pierde locul în
// care era. E cel mai frecvent defect al dialogurilor „aproape accesibile".
//
// Două reguli care fac diferența față de un `element.focus()` naiv:
//
//   1. Declanșatorul poate să nu mai existe. Launcherul nostru se DEMONTEAZĂ cât timp panelul e
//      deschis (panelul îi ocupă exact locul), deci referința capturată la deschidere e un nod
//      deconectat până la închidere. De aceea există un fallback: launcherul proaspăt montat.
//   2. Nu furăm focusul. Pe desktop dialogul e non-modal: userul poate să iasă din el și să
//      lucreze în pagină. Dacă în clipa închiderii focusul e ÎN AFARA widgetului, omul se uită în
//      altă parte — a-l muta înapoi ar fi un salt neexplicat.

import { useCallback, useEffect, useRef } from 'react'

/** Outcome-uri închise pentru `web_widget_focus_restore_total`. Fără ID-uri, fără selectori. */
export const FOCUS_RESTORE_OUTCOMES = Object.freeze({
  OPENER: 'opener',
  FALLBACK: 'fallback',
  SKIPPED: 'skipped',
  NONE: 'none',
})

function activeElement() {
  if (typeof document === 'undefined') return null
  const node = document.activeElement
  return node === null || node === document.body ? null : node
}

function focus(node) {
  if (node === null || node === undefined || typeof node.focus !== 'function') return false
  if (node.isConnected !== true) return false
  try {
    node.focus()
  } catch {
    return false
  }
  return true
}

/**
 * @param {boolean} open
 * @param {{fallbackRef?: {current: any}, containerRef?: {current: any},
 *   onOutcome?: (outcome: string) => void}} [options]
 *   `fallbackRef` = launcherul (sau orice ancoră stabilă) de folosit când declanșatorul a dispărut.
 *   `containerRef` = panelul; servește la a decide dacă focusul mai e „la noi".
 */
export function useReturnFocus(open, { fallbackRef, containerRef, onOutcome } = {}) {
  const openerRef = useRef(null)
  const wasOpenRef = useRef(open)
  const onOutcomeRef = useRef(onOutcome)
  onOutcomeRef.current = onOutcome
  /**
   * „Focusul mai e la noi?" — răspuns ținut LA ZI, nu calculat la închidere. Motivul e mecanic:
   * când panelul se demontează, React pune `containerRef.current = null` ÎNAINTE ca efectul ăsta
   * să ruleze, deci un `container.contains(activeElement)" de atunci n-are ce interoga și ar
   * răspunde „da" pentru orice — inclusiv pentru cineva care tocmai citea în pagină.
   */
  const insideRef = useRef(true)

  const report = useCallback((outcome) => onOutcomeRef.current?.(outcome), [])

  useEffect(() => {
    if (!open) return undefined
    if (typeof document === 'undefined') return undefined
    insideRef.current = true
    const onFocusIn = (event) => {
      const container = containerRef?.current ?? null
      if (container === null) return
      insideRef.current = container.contains(event.target)
    }
    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    const wasOpen = wasOpenRef.current
    wasOpenRef.current = open

    if (open === wasOpen) return
    if (open) {
      // Deschidere: reținem cine avea focusul. Poate fi launcherul, poate fi butonul din antet
      // („Întreabă Aria"), poate fi nimic (deschidere din `?chat=1`).
      openerRef.current = activeElement()
      return
    }

    const opener = openerRef.current
    openerRef.current = null

    // Închidere: mutăm focusul numai dacă era la noi, după ultima poziție ÎNREGISTRATĂ cât timp
    // panelul mai exista. `<body>` acum înseamnă doar că nodul focusat s-a demontat cu panelul.
    if (!insideRef.current) {
      report(FOCUS_RESTORE_OUTCOMES.SKIPPED)
      return
    }

    if (focus(opener)) {
      report(FOCUS_RESTORE_OUTCOMES.OPENER)
      return
    }
    if (focus(fallbackRef?.current ?? null)) {
      report(FOCUS_RESTORE_OUTCOMES.FALLBACK)
      return
    }
    report(FOCUS_RESTORE_OUTCOMES.NONE)
    // `containerRef`/`fallbackRef` sunt ref-uri stabile; efectul depinde DOAR de tranziția lui
    // `open`. Adăugarea lor în listă ar reporni efectul la fiecare render al apelantului.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, report])
}
