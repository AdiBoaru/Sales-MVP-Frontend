// NX-245 — `matchMedia` pentru jsdom, cu viewport CONDUS din test.
//
// jsdom nu implementează `window.matchMedia`. Fără el, `useResponsiveDialogMode` cade pe ramura
// „nu știu" (desktop non-modal) și niciun test n-ar putea atinge vreodată modul modal — adică
// exact partea cu focus trap, fundal inert și scroll lock, care e jumătate din card.
//
// Stubul nu e un mock cu `matches: false` hardcodat: EVALUEAZĂ interogarea față de
// `window.innerWidth`, iar `setViewport()` notifică listenerii înregistrați, ca la un resize real.
// Așa se poate testa și tranziția mobil→desktop cu panelul deschis (scurgerea de `inert`/trap pe
// care o vânează atacul Codex #6), nu doar cele două stări statice.

const lists = new Set()

function evaluate(query) {
  const max = /\(\s*max-width:\s*([\d.]+)px\s*\)/.exec(query)
  if (max !== null) return window.innerWidth <= Number.parseFloat(max[1])
  const min = /\(\s*min-width:\s*([\d.]+)px\s*\)/.exec(query)
  if (min !== null) return window.innerWidth >= Number.parseFloat(min[1])
  if (/prefers-reduced-motion:\s*reduce/.test(query)) return globalThis.__reducedMotion === true
  return false
}

/** Instalat o dată, din `test/setup.js`. */
export function installMatchMedia() {
  window.matchMedia = (query) => {
    const listeners = new Set()
    const list = {
      media: query,
      matches: evaluate(query),
      addEventListener: (type, fn) => {
        if (type === 'change') listeners.add(fn)
      },
      removeEventListener: (type, fn) => {
        if (type === 'change') listeners.delete(fn)
      },
      // Forma veche (Safari < 14) — o expunem ca să fie exercitată și ramura ei din hook.
      addListener: (fn) => listeners.add(fn),
      removeListener: (fn) => listeners.delete(fn),
      listeners,
    }
    lists.add(list)
    return list
  }
}

/** Lățime nouă + notificare, ca un resize adevărat. */
export function setViewport(width) {
  window.innerWidth = width
  for (const list of lists) {
    const next = evaluate(list.media)
    if (next === list.matches) continue
    list.matches = next
    for (const fn of list.listeners) fn({ matches: next, media: list.media })
  }
}

/** Între teste: fără asta, listenerii unei componente demontate se acumulează peste suită. */
export function resetMatchMedia(width = 1024) {
  lists.clear()
  window.innerWidth = width
  globalThis.__reducedMotion = false
}

export const MOBILE_WIDTH = 390
export const DESKTOP_WIDTH = 1280
