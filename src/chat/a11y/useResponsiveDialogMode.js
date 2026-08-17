// NX-245 — modalitatea dialogului, ca fapt TEHNIC despre viewport.
//
// Decizia de produs (DoR): pe ecran mic panelul acoperă tot, deci e un `dialog` MODAL (focus trap
// + fundal inert); pe desktop e un drawer lateral care lasă pagina vizibilă, deci e NON-modal —
// fără trap și fără inert. Un dialog declarat `aria-modal="false"` peste care se pune totuși un
// focus trap e mai rău decât oricare dintre variante: promite una și face alta, iar userul de
// tastatură rămâne prins într-o fereastră pe care sistemul îi spune că o poate părăsi.
//
// Pragul e ACELAȘI cu al layoutului (`sm:` din Tailwind = 640px, unde panelul trece de la lățime
// plină la 452px). Dacă cele două s-ar despărți, ar exista o bandă de lățimi în care panelul
// acoperă tot ecranul fără să fie modal — adică fundal inaccesibil vizual, dar tababil.
//
// Hookul e pur tehnic: nu citește nimic din payload și nu decide nimic despre conținut. De aceea
// are voie să existe în `src/chat/**` (a11y-ul e logică de prezentare permisă).

import { useEffect, useState } from 'react'

export const DIALOG_MODES = Object.freeze({
  MOBILE_MODAL: 'mobile_modal',
  DESKTOP_NONMODAL: 'desktop_nonmodal',
})

/** 639.98px, nu 639px: `sm:` se aplică de la 640px, iar zoomul poate produce lățimi fracționare. */
export const MOBILE_DIALOG_QUERY = '(max-width: 639.98px)'

function matches(query) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia(query).matches === true
  } catch {
    // Un `matchMedia` care aruncă (medii exotice, jsdom fără polyfill) nu are voie să doboare
    // widgetul. Necunoscut ⇒ NON-modal: refuzul de a trapa focusul e greșeala mai mică.
    return false
  }
}

/**
 * @param {string} [query]
 * @returns {'mobile_modal'|'desktop_nonmodal'}
 */
export function useResponsiveDialogMode(query = MOBILE_DIALOG_QUERY) {
  const [mobile, setMobile] = useState(() => matches(query))

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    let list
    try {
      list = window.matchMedia(query)
    } catch {
      return undefined
    }
    // Re-citim la abonare: între primul render și efect, lățimea se poate fi schimbat deja
    // (rotire, deschidere de devtools), iar un mod rămas în urmă înseamnă trap fără fundal inert.
    setMobile(list.matches === true)
    const onChange = (event) => setMobile(event.matches === true)
    // `addEventListener` e forma modernă; `addListener` e Safari < 14. Ambele se DEZABONEAZĂ,
    // fiindcă un listener rămas după unmount ține componenta vie și mută moduri pe un dialog mort.
    if (typeof list.addEventListener === 'function') {
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    }
    if (typeof list.addListener === 'function') {
      list.addListener(onChange)
      return () => list.removeListener(onChange)
    }
    return undefined
  }, [query])

  return mobile ? DIALOG_MODES.MOBILE_MODAL : DIALOG_MODES.DESKTOP_NONMODAL
}
