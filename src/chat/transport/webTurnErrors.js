// NX-243 — erorile TEHNICE ale transportului v2.
//
// Aici nu există copy comercial și nu se compune niciun mesaj de asistent. O eroare de transport
// spune ce s-a întâmplat cu REQUESTUL (rețea, timeout, sesiune, contract), nu ce ar trebui să
// citească cumpărătorul: textul afișabil vine exclusiv din backend, ca `web-view.v2` sau ca
// `error.message` server-owned. Dacă frontendul ar începe să-și scrie propriile replici, ar
// redeveni al doilea motor pe care NX-242/NX-243 tocmai îl scot din browser.
//
// Distincția care contează cel mai mult e `unknownOutcome`: „nu știm dacă serverul a primit
// requestul". Un timeout NU e un turn eșuat. Tratarea lui ca eșec e exact bug-ul care produce
// al doilea apel LLM pentru același mesaj.

/** Coduri STABILE și low-cardinality — intră în metrici, deci sunt un enum ÎNCHIS. */
export const WEB_TURN_ERROR_CODES = Object.freeze({
  /** Rețeaua a picat / DNS / CORS: requestul poate să fi ajuns sau nu. */
  NETWORK: 'network',
  /** Am renunțat noi să mai așteptăm. Serverul poate procesa mai departe. */
  TIMEOUT: 'timeout',
  /** Anulare deliberată (unmount, navigare, semnal extern). Nu e o defecțiune. */
  ABORTED: 'aborted',
  /** 403 pe o rută v2: sesiunea nu mai e validă (expirată, rotită, origin greșit). */
  SESSION_EXPIRED: 'session_expired',
  /** 401: poarta de acces a site-ului demo. Nu e retryable și nu declanșează renewal. */
  UNAUTHORIZED: 'unauthorized',
  /** 404 pe un turn: nu există, sau nu e al acestei sesiuni (backendul nu distinge, deliberat). */
  NOT_FOUND: 'not_found',
  /** 404 pe rută: flagul v2/SSE e stins pe server. */
  UNSUPPORTED: 'unsupported',
  /** 429 înainte de accept (rate limit sau buget). */
  RATE_LIMITED: 'rate_limited',
  /** 409 `idempotency_conflict`: același `client_turn_id` cu alt conținut. Bug de client. */
  IDEMPOTENCY_CONFLICT: 'idempotency_conflict',
  /** 4xx terminal structurat înainte de accept (`schema_invalid`, `action_*`, …). */
  REJECTED: 'rejected',
  /** 5xx: outcome necunoscut, ca timeoutul. */
  SERVER: 'server',
  /** Răspuns care nu respectă contractul (view sau status). Fail-closed, zero best-effort. */
  CONTRACT: 'contract',
})

/** Codurile pentru care NU știm dacă serverul a acceptat turul → recovery, niciodată turn nou. */
const UNKNOWN_OUTCOME = /** @type {string[]} */ (Object.freeze([
  WEB_TURN_ERROR_CODES.NETWORK,
  WEB_TURN_ERROR_CODES.TIMEOUT,
  WEB_TURN_ERROR_CODES.SERVER,
]))

/**
 * Eroare de transport. `serverCode` e codul stabil emis de backend (`schema_invalid`,
 * `action_expired`, …) — low-cardinality, sigur în metrici. `serverMessage` e copy SERVER-OWNED
 * și e singurul text pe care shell-ul are voie să-l arate; nu există fallback scris de frontend.
 */
export class WebTurnTransportError extends Error {
  /**
   * @param {string} code
   * @param {{status?: number|null, serverCode?: string|null, serverMessage?: string|null,
   *   retryAfterMs?: number|null, retryable?: boolean, cause?: unknown}} [details]
   */
  constructor(code, { status = null, serverCode = null, serverMessage = null, retryAfterMs = null, retryable = false, cause = null } = {}) {
    super(`web-turn.v2: ${code}`)
    this.name = 'WebTurnTransportError'
    this.code = code
    this.status = status
    this.serverCode = serverCode
    this.serverMessage = serverMessage
    this.retryAfterMs = retryAfterMs
    this.retryable = retryable
    this.cause = cause
  }

  /** „Nu știm dacă a ajuns la server." Decide între recovery și eroare terminală. */
  get unknownOutcome() {
    return UNKNOWN_OUTCOME.includes(this.code)
  }
}

/**
 * Orice altceva (TypeError din fetch, DOMException din abort) → eroare tipizată.
 * @param {any} err
 * @param {string} [fallbackCode] cod din `WEB_TURN_ERROR_CODES`
 */
export function asTransportError(err, fallbackCode = WEB_TURN_ERROR_CODES.NETWORK) {
  if (err instanceof WebTurnTransportError) return err
  const aborted = err?.name === 'AbortError'
  return new WebTurnTransportError(aborted ? WEB_TURN_ERROR_CODES.ABORTED : fallbackCode, {
    cause: err,
  })
}
