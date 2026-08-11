// NX-242 — punctul UNIC de intrare pentru orice payload `web-view.v2` primit de la backend.
//
// Decoderul validează forma și atât. Nu convertește prețuri, nu inventează defaults, nu repară
// aliasuri, nu taie scoruri și nu decide ce înseamnă un produs, un status sau o acțiune. Un
// payload valid iese EXACT cum a intrat (aceeași referință); unul invalid nu iese deloc.
//
// De ce contează: în v1 browserul e al doilea proprietar al contractului — își parsează prețurile
// din string, își calculează procentul de reducere, alege comportamentul unui CTA după `kind` și
// acceptă aliasuri. Fiecare dintre ele e o regulă comercială care trăiește în două locuri și
// diverge tăcut. Aici nu există niciuna: dacă backendul greșește, se vede ca eroare, nu ca un
// răspuns aproape corect.
//
// Ce NU e acest modul: o poartă de securitate completă. Vezi `isDisplayableUrl` mai jos și
// `test/fixtures/web-v2/README.md` pentru invarianții pe care JSON Schema nu îi poate exprima.

import validateWebViewV2 from './generated/webViewV2Validator.js'
import {
  WEB_VIEW_V2_BLOCK_TYPES,
  WEB_VIEW_V2_SCHEMA_HASH,
  WEB_VIEW_V2_SCHEMA_VERSION,
  WEB_VIEW_V2_URL_PROPERTIES,
} from './generated/webViewV2SchemaHash.js'

export { WEB_VIEW_V2_SCHEMA_HASH, WEB_VIEW_V2_SCHEMA_VERSION }

/**
 * Validatorul generat, cu forma pe care o expune AJV: predicat + `errors` populat la eșec.
 * Fișierul generat e `@ts-nocheck` (cod emis), deci tipul îl declarăm aici, o singură dată.
 *
 * @type {((data: unknown) => boolean) & { errors?: Array<{keyword?: string, instancePath?: string}> | null }}
 */
const validateView = /** @type {never} */ (validateWebViewV2)

/** Codurile stabile ale erorii de contract. Intră în metrici, deci sunt un enum ÎNCHIS. */
export const WEB_VIEW_CONTRACT_ERROR_CODES = Object.freeze({
  UNSUPPORTED_VERSION: 'unsupported_version',
  SCHEMA_HASH_MISMATCH: 'schema_hash_mismatch',
  INVALID_PAYLOAD: 'invalid_payload',
})

/**
 * Motivele de diagnostic — rafinare a codului, tot low-cardinality. Tipul brut al unui bloc
 * necunoscut NU devine niciodată label: ar fi controlat de payload, deci nemărginit.
 */
export const WEB_VIEW_DECODE_REASONS = Object.freeze({
  OK: 'ok',
  NOT_AN_OBJECT: 'not_an_object',
  UNSUPPORTED_VERSION: 'unsupported_version',
  SCHEMA_HASH_MISMATCH: 'schema_hash_mismatch',
  UNKNOWN_BLOCK: 'unknown_block',
  FORBIDDEN_URL: 'forbidden_url',
  INVALID_PAYLOAD: 'invalid_payload',
})

const MAX_ISSUES = 3
const MAX_ISSUE_PATH_LEN = 200

/**
 * Eroare TEHNICĂ de contract. Nu e mesajul pe care îl vede cumpărătorul: shell-ul (NX-243) decide
 * ce afișează. `message` conține doar codul — niciun fragment din payload, niciun URL, niciun
 * token, niciun text de la model. Un sentinel injectat în payload nu are pe unde să iasă.
 */
export class WebViewContractError extends Error {
  constructor(code, { reason = code, issues = [] } = {}) {
    super(`web-view.v2: ${code}`)
    this.name = 'WebViewContractError'
    this.code = code
    this.reason = reason
    this.issues = Object.freeze(issues)
  }
}

/**
 * `keyword` + `instancePath`, nimic altceva. `params` ar conține numele proprietății în plus
 * (controlat de payload) iar `message`/`data` ar conține valoarea — ambele ies din log.
 */
function sanitizeIssues(errors) {
  if (!Array.isArray(errors)) return []
  return errors.slice(0, MAX_ISSUES).map((err) => ({
    keyword: typeof err?.keyword === 'string' ? err.keyword.slice(0, 40) : 'unknown',
    path: typeof err?.instancePath === 'string' ? err.instancePath.slice(0, MAX_ISSUE_PATH_LEN) : '',
  }))
}

/**
 * Un `block.type` din afara unionului finit e clasificat determinist, din allowlistul GENERAT din
 * schemă. Cu `oneOf`, AJV raportează oricum eșecul la nivel de bloc, deci forma erorii nu poate
 * distinge „tip necunoscut" de „câmp intern greșit" — iar diferența contează pentru rollout.
 */
function hasUnknownBlockType(payload) {
  const messages = payload?.messages
  if (!Array.isArray(messages)) return false
  for (const message of messages) {
    const blocks = message?.blocks
    if (!Array.isArray(blocks)) continue
    for (const block of blocks) {
      const type = block?.type
      if (typeof type !== 'string' || !WEB_VIEW_V2_BLOCK_TYPES.includes(type)) return true
    }
  }
  return false
}

// ── Allowlist de URL ───────────────────────────────────────────────────────────────────────
// Oglindește `_validate_url` din NX-228 (`src/web/contracts_v2.py`). Nu e o regulă de business:
// e gaura pe care backendul a documentat-o explicit — allowlistul lui trăiește într-un
// `model_validator`, deci NU apare în JSON Schema. Un client care validează DOAR cu schema ar
// accepta `javascript:`. Guardul RESPINGE, nu repară: un URL rescris în tăcere ar fi exact
// „sanitizarea care schimbă valoarea și continuă" pe care cardul o interzice.
const FORBIDDEN_URL_PREFIXES = ['javascript:', 'data:', 'file:', 'vbscript:', 'blob:', 'about:']

function isDisplayableUrl(value) {
  if (typeof value !== 'string' || value.length === 0) return false
  // whitespace/backslash = vectorul clasic de bypass („java\nscript:"); caracterele de control
  // sunt respinse în plus față de backend, care nu le poate emite oricum.
  if (/\s/.test(value) || value.includes('\\')) return false
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return false
  const lowered = value.toLowerCase()
  if (FORBIDDEN_URL_PREFIXES.some((prefix) => lowered.startsWith(prefix))) return false
  if (value.startsWith('//')) return false // protocol-relativ: moștenește schema paginii gazdă
  if (value.startsWith('/')) return true
  return lowered.startsWith('https://')
}

/** Prima cale de URL respinsă, ca `instancePath` (fără valoare), sau `null`. */
function findForbiddenUrl(node, path) {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      const hit = findForbiddenUrl(node[i], `${path}/${i}`)
      if (hit) return hit
    }
    return null
  }
  if (!node || typeof node !== 'object') return null
  for (const key of Object.keys(node)) {
    const value = node[key]
    if (WEB_VIEW_V2_URL_PROPERTIES.includes(key) && typeof value === 'string') {
      if (!isDisplayableUrl(value)) return `${path}/${key}`
      continue
    }
    const hit = findForbiddenUrl(value, `${path}/${key}`)
    if (hit) return hit
  }
  return null
}

function now() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

/**
 * Singura intrare pentru un payload v2. Primește `unknown` — nu presupune nimic despre el.
 *
 * @param {unknown} input payload deja parsat din JSON (parsarea aparține transportului, NX-243)
 * @param {{expectedSchemaHash?: string, onDiagnostic?: (d: object) => void}} [options]
 *   `expectedSchemaHash` = hashul anunțat de server la bootstrap. Diferit de al buildului ⇒
 *   `schema_hash_mismatch`, fail-closed: nu cădem pe v1 și nu încercăm best-effort.
 * @returns {object} EXACT `input`, aceeași referință
 * @throws {WebViewContractError}
 */
export function decodeWebViewV2(input, { expectedSchemaHash, onDiagnostic } = {}) {
  const startedAt = now()

  const emit = (outcome, reason) => {
    if (typeof onDiagnostic !== 'function') return
    try {
      onDiagnostic({
        outcome,
        reason,
        schemaMajor: WEB_VIEW_V2_SCHEMA_VERSION,
        durationMs: now() - startedAt,
      })
    } catch {
      // Un callback de telemetrie stricat nu are voie să schimbe rezultatul decodării.
    }
  }

  const fail = (code, reason, issues) => {
    emit('error', reason)
    return new WebViewContractError(code, { reason, issues })
  }

  const { UNSUPPORTED_VERSION, SCHEMA_HASH_MISMATCH, INVALID_PAYLOAD } =
    WEB_VIEW_CONTRACT_ERROR_CODES
  const R = WEB_VIEW_DECODE_REASONS

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw fail(INVALID_PAYLOAD, R.NOT_AN_OBJECT)
  }

  // Versiunea ÎNAINTE de orice interpretare. „E aproape v2, hai să citim ce înțelegem" e exact
  // modul în care un contract moare — și e drumul pe care un payload v1 ar intra pe ușa din dos.
  const envelope = /** @type {Record<string, unknown>} */ (input)
  if (envelope.schema_version !== WEB_VIEW_V2_SCHEMA_VERSION) {
    throw fail(UNSUPPORTED_VERSION, R.UNSUPPORTED_VERSION)
  }

  if (expectedSchemaHash !== undefined && expectedSchemaHash !== WEB_VIEW_V2_SCHEMA_HASH) {
    throw fail(SCHEMA_HASH_MISMATCH, R.SCHEMA_HASH_MISMATCH)
  }

  if (!validateView(input)) {
    const issues = sanitizeIssues(validateView.errors)
    const reason = hasUnknownBlockType(input) ? R.UNKNOWN_BLOCK : R.INVALID_PAYLOAD
    throw fail(INVALID_PAYLOAD, reason, issues)
  }

  const forbiddenUrlPath = findForbiddenUrl(input, '')
  if (forbiddenUrlPath !== null) {
    throw fail(INVALID_PAYLOAD, R.FORBIDDEN_URL, [
      { keyword: 'url_allowlist', path: forbiddenUrlPath.slice(0, MAX_ISSUE_PATH_LEN) },
    ])
  }

  emit('ok', R.OK)
  return input
}
