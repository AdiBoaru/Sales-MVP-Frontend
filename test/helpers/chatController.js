// NX-245 — un controller FALS, cu exact forma pe care shell-ul o consumă.
//
// De ce fals și nu cel real: testele de aici sunt despre ce vede și ce poate atinge utilizatorul
// într-o stare dată — focus, roluri, controale inactive, anunțuri. Starea trebuie așezată exact,
// nu obținută prin trei round-tripuri de rețea simulate. Invarianții mașinii de stare (cine
// deblochează și când) au deja suita lor: `test/web-chat-reducer.test.js` +
// `test/web-chat-controller.test.jsx`, pe implementarea adevărată.
//
// Ce NU face fake-ul: nu inventează câmpuri. Formele de mai jos sunt luate din fixturile de
// contract, deci dacă `web-view.v2` se schimbă, testele se rup — cum trebuie.

import { vi } from 'vitest'
import validViews from '../fixtures/web-v2/valid_views.json'

export const VIEW_COPY = Object.freeze({
  composer: validViews.greeting.composer,
  chrome: validViews.greeting.chrome,
  a11y: validViews.greeting.a11y,
})

/** Fazele mașinii NX-243 în care NU se poate trimite nimic. */
export const BUSY_PHASES = Object.freeze(['submitting', 'waiting', 'recovering'])

/**
 * @param {object} [overrides] — suprascrie orice câmp; `views` acceptă chei din fixturi.
 */
export function makeController(overrides = {}) {
  const { phase = 'ready', views = [], composer, chrome, announcements, ...rest } = overrides
  const resolved = views.map((item) => (typeof item === 'string' ? validViews[item] : item))
  const view = resolved.length === 0 ? null : resolved[resolved.length - 1]
  const busy = BUSY_PHASES.includes(phase)
  // `null` EXPLICIT ≠ câmp absent. Starea „bootstrapul a picat, serverul n-a trimis niciun copy"
  // se exprimă cu `chrome: null`, iar un `??` ar înlocui-o tăcut cu valoarea implicită — adică
  // fix testul care verifică fallbackurile tehnice n-ar mai testa nimic.
  const pick = (key, provided, fallback) => (key in overrides ? provided : fallback)
  return {
    state: { phase },
    view,
    views: resolved,
    // Precedența e a controllerului real: view-ul curent bate copy-ul de bootstrap.
    chrome: pick('chrome', chrome, view?.chrome ?? VIEW_COPY.chrome),
    composer: pick('composer', composer, view?.composer ?? VIEW_COPY.composer),
    announcements: pick(
      'announcements',
      announcements,
      view?.a11y?.announcements ?? VIEW_COPY.a11y.announcements,
    ),
    canSubmit: phase === 'ready',
    busy,
    progressStatus: busy ? 'working' : null,
    sessionOutcome: null,
    fault: null,
    canRetry: false,
    sendText: vi.fn(() => true),
    sendAction: vi.fn(() => true),
    retry: vi.fn(),
    reset: vi.fn(() => true),
    ...rest,
  }
}

export { validViews }
