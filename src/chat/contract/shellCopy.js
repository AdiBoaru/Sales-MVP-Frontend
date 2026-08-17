// NX-244 — decoderul copy-ului de SHELL primit la bootstrap (`view_copy`).
//
// De ce există: `chrome`/`composer`/`a11y` sunt server-owned și complete, dar călătoresc DOAR
// într-un `web-view.v2`, iar un view apare abia după primul tur. Între încărcarea paginii și
// primul răspuns, widgetul are totuși nevoie de eticheta launcherului, titlul dialogului și
// placeholderul composerului. În v1 le inventa în browser (`BRAND.assistant`, „Întreabă orice
// despre produse…"); aici le primește de la server, din ACELEAȘI tabele de copy ca view-urile.
//
// Aceeași regulă ca la NX-242: VALIDARE, nu reparare. Nu completează un câmp lipsă, nu taie un
// string prea lung, nu traduce nimic. Un `view_copy` stricat oprește bootstrapul vizibil, fiindcă
// un shell fără nume e un defect de contract, nu o stare din care ne descurcăm.
//
// Ce NU e: un ViewModel. Nu are `messages`, `turn` sau `conversation` și nu se randează ca un
// răspuns — e strict copy-ul ramei, disponibil înainte să existe conținut.

/** Oglindesc exact modelele NX-228 (`ComposerView`/`ChromeView`/`AnnouncementsView`). */
const COMPOSER_KEYS = Object.freeze(['enabled', 'label', 'placeholder', 'send_label'])
const CHROME_KEYS = Object.freeze([
  'launcher_label',
  'dialog_title',
  'dialog_description',
  'close_label',
  'new_chat_label',
])
/** Un anunț pentru FIECARE status de sârmă: un status fără anunț e tăcere pentru cine nu vede ecranul. */
const ANNOUNCEMENT_KEYS = Object.freeze([
  'accepted',
  'working',
  'validating',
  'completed',
  'failed',
  'cancelled',
])

/** Plafoanele contractului. Un string peste limită e payload invalid, nu ceva de trunchiat. */
const MAX_LABEL = 60
const MAX_VALUE = 200

export class ShellCopyContractError extends Error {
  constructor(reason) {
    super(`view_copy: ${reason}`)
    this.name = 'ShellCopyContractError'
    this.reason = reason
  }
}

/** Non-blank și mărginit. `"   "` e respins: backendul face `strip_whitespace` + `min_length=1`. */
function isText(value, max) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
}

/** Obiect simplu cu EXACT cheile cerute. Un câmp în plus = contract driftat ⇒ fail-closed. */
function exactObject(node, keys, reason) {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    throw new ShellCopyContractError(reason)
  }
  const present = Object.keys(node)
  if (present.length !== keys.length || !keys.every((key) => present.includes(key))) {
    throw new ShellCopyContractError(reason)
  }
  return node
}

/**
 * `unknown` → copy validat, sau `null` dacă serverul nu a trimis nimic (ruta v2 stinsă).
 *
 * Absent și invalid sunt DOUĂ lucruri diferite: absent = „serverul nu oferă asta", tratat de
 * apelant; invalid = defect de contract, care aruncă. Confundarea lor ar transforma un backend
 * stricat într-un widget mut și mulțumit de sine.
 *
 * @param {unknown} input
 * @returns {{composer: object, chrome: object, a11y: object}|null}
 * @throws {ShellCopyContractError}
 */
export function decodeShellCopy(input) {
  if (input === undefined || input === null) return null

  const root = exactObject(input, ['composer', 'chrome', 'a11y'], 'root_invalid')

  const composer = exactObject(root.composer, COMPOSER_KEYS, 'composer_invalid')
  if (typeof composer.enabled !== 'boolean') throw new ShellCopyContractError('composer_invalid')
  for (const key of ['label', 'placeholder', 'send_label']) {
    // `send_label` e `ActionLabel` (40) în contract, dar plafonul mai larg aici e suficient:
    // decoderul apără FE-ul de text nemărginit, nu re-implementează validatorul serverului.
    if (!isText(composer[key], MAX_LABEL)) throw new ShellCopyContractError('composer_invalid')
  }

  const chrome = exactObject(root.chrome, CHROME_KEYS, 'chrome_invalid')
  for (const key of CHROME_KEYS) {
    // `dialog_title`/`dialog_description` sunt `Title`/`Value` (200); restul sunt `Label` (60).
    const max = key === 'dialog_title' || key === 'dialog_description' ? MAX_VALUE : MAX_LABEL
    if (!isText(chrome[key], max)) throw new ShellCopyContractError('chrome_invalid')
  }

  const a11y = exactObject(root.a11y, ['announcements'], 'a11y_invalid')
  const announcements = exactObject(a11y.announcements, ANNOUNCEMENT_KEYS, 'a11y_invalid')
  for (const key of ANNOUNCEMENT_KEYS) {
    if (!isText(announcements[key], MAX_VALUE)) throw new ShellCopyContractError('a11y_invalid')
  }

  // Aceeași referință nu ne ajută (vine dintr-un JSON proaspăt), dar forma normalizată SÎ: copiem
  // exact cheile validate, ca un câmp strecurat prin vreo cale exotică să nu ajungă în UI.
  return Object.freeze({
    composer: Object.freeze({
      enabled: composer.enabled,
      label: composer.label,
      placeholder: composer.placeholder,
      send_label: composer.send_label,
    }),
    chrome: Object.freeze(Object.fromEntries(CHROME_KEYS.map((key) => [key, chrome[key]]))),
    a11y: Object.freeze({
      announcements: Object.freeze(
        Object.fromEntries(ANNOUNCEMENT_KEYS.map((key) => [key, announcements[key]])),
      ),
    }),
  })
}
