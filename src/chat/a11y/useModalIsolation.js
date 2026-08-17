// NX-245 — ce înseamnă, mecanic, `aria-modal="true"`.
//
// Atributul singur nu face nimic: e o PROMISIUNE către tehnologia asistivă că restul paginii nu
// există cât timp dialogul e deschis. Cine o pune fără să o și impună obține cel mai prost
// rezultat posibil — screen readerul anunță „dialog", apoi userul iese din el cu săgețile în
// vitrina de produse de dedesubt și nu mai găsește drumul înapoi.
//
// Aici se impune, prin trei mecanisme separate, fiecare cu curățarea lui:
//
//   1. FUNDAL INERT — `inert` + `aria-hidden` pe frații hostului de portal. `inert` scoate
//      subarborele din tab order ȘI din arborele de accesibilitate în browserele moderne;
//      `aria-hidden` acoperă restul. Se pun pe frați, nu pe `<body>`, fiindcă `<body>` ne-ar
//      include și pe noi.
//   2. SCROLL LOCK — pagina de dedesubt nu se mai mișcă sub deget. Valoarea anterioară se
//      restaurează exact, ca o pagină care avea deja `overflow` propriu să nu rămână blocată.
//   3. FOCUS TRAP — Tab/Shift+Tab ciclează în panel, iar un focus scăpat programatic e adus înapoi.
//
// Toate trei sunt REVERSIBILE și idempotente: se salvează valorile de dinainte, nu se presupune
// că erau goale. Un widget deschis/închis de 20 de ori (atacul Codex #9) trebuie să lase DOM-ul
// exact cum l-a găsit.
//
// Nimic din fișierul ăsta nu citește payloadul: sunt reguli despre noduri și taste.

import { useEffect } from 'react'

/**
 * Candidați la focus. Deliberat FĂRĂ verificare de vizibilitate prin layout (`offsetParent`,
 * `getBoundingClientRect`): în jsdom layoutul e mereu zero, deci un filtru pe el ar trece testele
 * exact în cazul în care trapul nu funcționează. Filtrăm pe ce e observabil în ambele lumi:
 * dezactivat, ascuns, inert.
 */
const FOCUSABLE = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[tabindex]',
].join(',')

function isFocusable(node) {
  if (node.hasAttribute('disabled')) return false
  if (node.getAttribute('tabindex') === '-1') return false
  if (node.hasAttribute('hidden')) return false
  if (node.closest('[inert]') !== null) return false
  if (node.closest('[aria-hidden="true"]') !== null) return false
  return true
}

export function focusableWithin(container) {
  if (container === null || container === undefined) return []
  return Array.from(container.querySelectorAll(FOCUSABLE)).filter(isFocusable)
}

/**
 * @param {{active: boolean, containerRef: {current: any}, hostRef?: {current: any},
 *   onError?: (area: string) => void}} options
 *   `active` = suntem în modul modal. Pe non-modal hookul nu atinge NIMIC: fără inert, fără
 *   scroll lock, fără trap — exact ce promite `aria-modal="false"`.
 *   `hostRef` = nodul de portal, singurul frate care NU se face inert.
 */
export function useModalIsolation({ active, containerRef, hostRef, onError }) {
  useEffect(() => {
    if (!active) return undefined
    if (typeof document === 'undefined') return undefined
    const container = containerRef.current
    if (container === null || container === undefined) return undefined

    const host = hostRef?.current ?? null
    const body = document.body
    /** Perechi (nod, valoare de dinainte) — restaurarea nu ghicește, reface. */
    const restored = []

    try {
      for (const sibling of Array.from(body.children)) {
        if (sibling === host || sibling.contains(container)) continue
        restored.push({
          node: sibling,
          inert: sibling.getAttribute('inert'),
          ariaHidden: sibling.getAttribute('aria-hidden'),
        })
        sibling.setAttribute('inert', '')
        sibling.setAttribute('aria-hidden', 'true')
      }
    } catch {
      onError?.('dialog')
    }

    const previousOverflow = body.style.overflow
    body.style.overflow = 'hidden'

    const onKeyDown = (event) => {
      if (event.key !== 'Tab') return
      const items = focusableWithin(container)
      if (items.length === 0) {
        // Panel fără niciun control focusabil (nu se întâmplă: closeul e mereu activ). Prindem
        // Tabul oricum, altfel focusul ar pleca în fundalul pe care tocmai l-am declarat inexistent.
        event.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const current = document.activeElement
      if (!container.contains(current)) {
        // Focus scăpat (a fost pe un control care s-a dezactivat). Îl readucem, nu îl lăsăm afară.
        event.preventDefault()
        first.focus()
        return
      }
      if (event.shiftKey && current === first) {
        event.preventDefault()
        last.focus()
        return
      }
      if (!event.shiftKey && current === last) {
        event.preventDefault()
        first.focus()
      }
    }

    // Pe `document`, în faza de CAPTURE: un handler pe container ar rata Tabul apăsat când focusul
    // a ajuns deja în afara lui, iar exact ăla e cazul de reparat.
    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      body.style.overflow = previousOverflow
      for (const entry of restored) {
        if (entry.inert === null) entry.node.removeAttribute('inert')
        else entry.node.setAttribute('inert', entry.inert)
        if (entry.ariaHidden === null) entry.node.removeAttribute('aria-hidden')
        else entry.node.setAttribute('aria-hidden', entry.ariaHidden)
      }
    }
    // `containerRef`/`hostRef`/`onError` sunt stabile la apelant; efectul se leagă de `active`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
}
