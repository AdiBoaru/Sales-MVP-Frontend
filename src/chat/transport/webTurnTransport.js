// NX-243 — transportul turului web v2. Primitive injectabile, zero stare de aplicație.
//
// Contractul consumat e cel REAL din backend (`src/web/app.py`, NX-232/233), nu unul presupus:
//
//   GET  /web/bootstrap?token=…                     → { token, visitor_id, sig, sse_url }
//   POST /web/v2/turns?token=&visitor_id=&sig=      → 202 status · 200 view terminal (replay)
//                                                     409 conflict · 4xx eroare structurată
//   GET  /web/v2/turns/{id}?token=&visitor_id=&sig= → 202 status · 200 view terminal · 404
//   GET  /web/v2/turns/{id}/events?…                → SSE `status`/`result` (dacă flagul e pornit)
//
// Trei decizii care nu sunt evidente și de care depinde corectitudinea:
//
// 1. URL-urile se construiesc AICI, din `apiBase` + id. `status_url`/`events_url` din payload NU
//    devin niciodată ținta unui request; `events_url` e citit strict ca semnal de capabilitate
//    („serverul oferă SSE"). Un backend compromis nu are voie să redirecteze clientul.
// 2. Autentificarea e în query string (token/visitor_id/sig) fiindcă exact așa o cere backendul
//    pe rutele v2 — nu e un workaround inventat ca să meargă `EventSource`. Sesiunea rămâne opacă:
//    `sig` e semnat server-side (v2 poartă claims în el) și nu se decodează niciodată aici.
// 3. Fiecare payload de view trece prin decoderul strict NX-242 înainte să existe pentru restul
//    aplicației; payload-ul de status are propriul decoder strict, mai jos. Nimic nu iese
//    „reparat".
//
// Ce NU face transportul: nu ține stare, nu decide când să reîncerce, nu inventează un turn nou,
// nu inspectează `action_token` și nu transformă un label în text. Politica e a controllerului.

import { decodeShellCopy } from '../contract/shellCopy.js'
import { WEB_TURN_ERROR_CODES as E, WebTurnTransportError, asTransportError } from './webTurnErrors.js'

/**
 * @typedef {{signal?: AbortSignal, timeoutMs?: number}} RequestOptions
 * @typedef {{turnId: string, clientTurnId: string, status: string, pollAfterMs: number|null,
 *   sseOffered: boolean}} TurnStatus
 * @typedef {{outcome: 'accepted', status: TurnStatus}
 *   | {outcome: 'terminal', view: object}
 *   | {outcome: 'active_turn', status: TurnStatus|null}} TurnResponse
 */

/** Contractul de request pe care îl vorbește backendul (`TURN_SCHEMA_VERSION`). */
export const WEB_TURN_REQUEST_SCHEMA_VERSION = 'web-turn.v2'
/** Contractul payload-ului de status 202 (`status_payload`, src/web/turn_events.py). */
export const WEB_TURN_STATUS_SCHEMA_VERSION = 'web-turn-status.v2'

/**
 * Rangul lifecycle-ului. OGLINDEȘTE `STATUS_ORDINAL` din `src/web/turn_events.py` — sunt exact
 * id-urile de eveniment SSE emise de server, deci monotonia e a lui, nu inventată de noi. Există
 * aici pentru că polling-ul (fallback) nu primește `id:` și are totuși nevoie să respingă un
 * status vechi sosit după unul nou.
 */
export const TURN_STATUS_RANK = Object.freeze({
  accepted: 0,
  working: 1,
  validating: 2,
  completed: 3,
  failed: 3,
  cancelled: 3,
})

/** Statusurile terminale — turul nu mai produce nimic după ele. */
export const TERMINAL_TURN_STATUSES = Object.freeze(['completed', 'failed', 'cancelled'])

export function isTerminalStatus(status) {
  return TERMINAL_TURN_STATUSES.includes(status)
}

// ── Decodarea strictă a payload-ului de status ──────────────────────────────────────────────
// Aceeași regulă ca la view (NX-242): validare, nu reparare. `extra` respins, `status` enum
// ÎNCHIS, `poll_after_ms` număr întreg. Un câmp nou apărut pe server oprește clientul vizibil
// (fail-closed) în loc să-l lase să meargă pe jumătate — cutoverul e controlat de NX-249.

const STATUS_KEYS = ['schema_version', 'turn', 'status_url', 'poll_after_ms', 'events_url']
const TURN_KEYS = ['id', 'client_turn_id', 'status']

function contractError(reason) {
  return new WebTurnTransportError(E.CONTRACT, { serverCode: reason })
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0
}

/**
 * `unknown` → payload de status validat. Aruncă `WebTurnTransportError(CONTRACT)` altfel.
 * Întoarce un obiect NOU cu exact câmpurile de care are nevoie clientul; `status_url` e
 * deliberat absent din rezultat, ca nimeni să nu fie tentat să-l folosească drept țintă.
 */
export function decodeTurnStatus(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw contractError('status_not_an_object')
  }
  if (input.schema_version !== WEB_TURN_STATUS_SCHEMA_VERSION) {
    throw contractError('status_unsupported_version')
  }
  for (const key of Object.keys(input)) {
    if (!STATUS_KEYS.includes(key)) throw contractError('status_unknown_field')
  }
  const turn = input.turn
  if (turn === null || typeof turn !== 'object' || Array.isArray(turn)) {
    throw contractError('status_turn_invalid')
  }
  for (const key of Object.keys(turn)) {
    if (!TURN_KEYS.includes(key)) throw contractError('status_unknown_field')
  }
  if (!isNonEmptyString(turn.id) || !isNonEmptyString(turn.client_turn_id)) {
    throw contractError('status_turn_invalid')
  }
  if (!Object.prototype.hasOwnProperty.call(TURN_STATUS_RANK, turn.status)) {
    throw contractError('status_unknown_status')
  }
  if (!Number.isInteger(input.poll_after_ms) || input.poll_after_ms < 0) {
    throw contractError('status_poll_invalid')
  }
  if (input.events_url !== undefined && !isNonEmptyString(input.events_url)) {
    throw contractError('status_events_url_invalid')
  }
  return {
    turnId: turn.id,
    clientTurnId: turn.client_turn_id,
    status: turn.status,
    pollAfterMs: input.poll_after_ms,
    // Capabilitate, nu adresă: prezența lui spune că serverul are SSE pornit pentru acest turn.
    sseOffered: input.events_url !== undefined,
  }
}

/**
 * Frame-ul SSE `status` are ALTĂ formă decât payloadul 202: `sse_frame("status", ord, {"turn": …})`
 * trimite doar `turn`, fără `schema_version`, `status_url` sau `poll_after_ms` (ordinalul e în
 * `id:`, iar cadența nu are sens pe un stream). Un singur decoder pentru amândouă ar respinge
 * fiecare frame real de status — deci sunt două contracte, nu unul.
 */
export function decodeSseStatus(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw contractError('sse_status_not_an_object')
  }
  for (const key of Object.keys(input)) {
    if (key !== 'turn') throw contractError('sse_status_unknown_field')
  }
  const turn = input.turn
  if (turn === null || typeof turn !== 'object' || Array.isArray(turn)) {
    throw contractError('sse_status_turn_invalid')
  }
  for (const key of Object.keys(turn)) {
    if (!TURN_KEYS.includes(key)) throw contractError('sse_status_unknown_field')
  }
  if (!isNonEmptyString(turn.id) || !isNonEmptyString(turn.client_turn_id)) {
    throw contractError('sse_status_turn_invalid')
  }
  if (!Object.prototype.hasOwnProperty.call(TURN_STATUS_RANK, turn.status)) {
    throw contractError('sse_status_unknown_status')
  }
  return {
    turnId: turn.id,
    clientTurnId: turn.client_turn_id,
    status: turn.status,
    // Pe stream nu există cadență de polling, iar SSE e prin definiție oferit.
    pollAfterMs: null,
    sseOffered: true,
  }
}

// ── Decoderul de view (NX-242), încărcat la cerere ──────────────────────────────────────────
// Import DINAMIC memoizat: validatorul generat e mare și NX-242 l-a ținut deliberat în afara
// chunkului principal. Toate call-site-urile de aici sunt oricum async.
let decoderPromise = null
function loadDecoder() {
  if (decoderPromise === null) decoderPromise = import('../contract/webViewV2.js')
  return decoderPromise
}

/** Testele injectează decoderul ca să nu depindă de ordinea import-urilor dinamice. */
export function __setViewDecoderForTests(mod) {
  decoderPromise = mod === null ? null : Promise.resolve(mod)
}

async function decodeView(payload, onDiagnostic) {
  const { decodeWebViewV2 } = await loadDecoder()
  try {
    return decodeWebViewV2(payload, { onDiagnostic })
  } catch (err) {
    throw new WebTurnTransportError(E.CONTRACT, {
      serverCode: err?.reason || err?.code || 'view_invalid',
      cause: err,
    })
  }
}

// ── HTTP ────────────────────────────────────────────────────────────────────────────────────

function retryAfterMs(response) {
  const raw = response.headers?.get?.('retry-after')
  if (!raw) return null
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000)
  const at = Date.parse(raw)
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null
}

/**
 * Corpul de eroare are DOUĂ forme pe server și amândouă sunt reale:
 *   • `{ error: { code, message, retryable? } }` — erorile terminale structurate (`_v2_error`);
 *   • `{ detail: "…" }` — `HTTPException` (403/429/404). `detail` e un text de protocol, NU copy
 *     pentru cumpărător, deci nu iese niciodată către UI.
 */
async function readErrorBody(response) {
  try {
    const body = await response.json()
    const error = body?.error
    if (error && typeof error === 'object') {
      return {
        serverCode: isNonEmptyString(error.code) ? error.code.slice(0, 60) : null,
        serverMessage: isNonEmptyString(error.message) ? error.message.slice(0, 2000) : null,
        retryable: error.retryable === true,
        activeTurn: body.active_turn,
      }
    }
  } catch {
    // Corp gol/ne-JSON: statusul HTTP rămâne singura informație. Nu inventăm un motiv.
  }
  return { serverCode: null, serverMessage: null, retryable: false, activeTurn: undefined }
}

function httpError(response, body) {
  const shared = {
    status: response.status,
    serverCode: body.serverCode,
    serverMessage: body.serverMessage,
    retryAfterMs: retryAfterMs(response),
  }
  if (response.status === 401) return new WebTurnTransportError(E.UNAUTHORIZED, shared)
  if (response.status === 403) return new WebTurnTransportError(E.SESSION_EXPIRED, shared)
  if (response.status === 429) {
    return new WebTurnTransportError(E.RATE_LIMITED, { ...shared, retryable: true })
  }
  if (response.status >= 500) return new WebTurnTransportError(E.SERVER, shared)
  if (body.serverCode === 'idempotency_conflict') {
    return new WebTurnTransportError(E.IDEMPOTENCY_CONFLICT, shared)
  }
  return new WebTurnTransportError(E.REJECTED, { ...shared, retryable: body.retryable })
}

/** Semnalul apelantului + timeoutul propriu, într-un singur `AbortSignal`. */
function withTimeout(signal, timeoutMs) {
  const controller = new AbortController()
  let timer = null
  let timedOut = false
  const onAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
  }
  return {
    signal: controller.signal,
    get timedOut() {
      return timedOut
    },
    dispose() {
      if (timer !== null) clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
    },
  }
}

/**
 * @param {{apiBase?: string, publicToken?: string, fetchImpl?: Function,
 *   eventSourceFactory?: ((url: string) => any)|null,
 *   onDiagnostic?: (diagnostic: object) => void}} [config]
 */
export function createWebTurnTransport({
  apiBase = '',
  publicToken,
  fetchImpl,
  eventSourceFactory,
  onDiagnostic,
} = {}) {
  const doFetch = fetchImpl || ((url, init) => globalThis.fetch(url, init))

  /** Singurul loc în care se compune un URL. Query-ul e mereu encodat. */
  const buildUrl = (path, params) => {
    const query = new URLSearchParams(params).toString()
    return `${apiBase}${path}${query ? `?${query}` : ''}`
  }

  const sessionParams = (session) => ({
    token: session.token,
    visitor_id: session.visitor_id,
    sig: session.sig,
  })

  async function request(url, { method = 'GET', body = null, signal, timeoutMs }) {
    const gate = withTimeout(signal, timeoutMs)
    let response
    try {
      response = await doFetch(url, {
        method,
        headers: body === null
          ? { Accept: 'application/json' }
          : { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: body === null ? undefined : JSON.stringify(body),
        signal: gate.signal,
      })
    } catch (err) {
      // Ordinea contează: un abort cauzat de timeoutul NOSTRU e `timeout` („outcome necunoscut"),
      // nu `aborted` („am renunțat deliberat") — cele două duc în stări diferite.
      if (gate.timedOut) throw new WebTurnTransportError(E.TIMEOUT, { cause: err })
      throw asTransportError(err)
    } finally {
      gate.dispose()
    }
    return response
  }

  /**
   * 200 → view decodat; 202 → status decodat. Orice altceva e eroare tipizată.
   * @returns {Promise<TurnResponse>}
   */
  async function readTurnResponse(response) {
    if (response.status === 200) {
      const view = await decodeView(await response.json(), onDiagnostic)
      return { outcome: /** @type {'terminal'} */ ('terminal'), view }
    }
    if (response.status === 202) {
      const status = decodeTurnStatus(await response.json())
      return { outcome: /** @type {'accepted'} */ ('accepted'), status }
    }
    throw httpError(response, await readErrorBody(response))
  }

  /**
   * Sesiune nouă de vizitator + copy-ul de shell. Nu întoarce nicio conversație și niciun turn
   * activ: backendul nu are (încă) un snapshot de conversație pe v2 — recovery-ul după refresh
   * pornește din `active_turn_id`-ul tehnic salvat local și se CONFIRMĂ cu `getTurn`.
   *
   * NX-244: `view_copy` e copy-ul RAMEI (chrome/composer/a11y), de care widgetul are nevoie
   * înainte să existe primul view. Absent = ruta v2 e stinsă pe server; invalid = defect de
   * contract, care oprește bootstrapul. Handle-ul rămâne separat de copy: `session` are EXACT
   * cele trei câmpuri opace, fiindcă exact atât se persistă și se retrimite.
   *
   * @returns {Promise<{session: {token: string, visitor_id: string, sig: string},
   *   shellCopy: object|null}>}
   */
  /** @param {RequestOptions} [options] */
  async function bootstrap({ signal, timeoutMs } = {}) {
    const response = await request(buildUrl('/web/bootstrap', { token: publicToken }), {
      signal,
      timeoutMs,
    })
    if (!response.ok) throw httpError(response, await readErrorBody(response))
    const data = await response.json()
    if (!isNonEmptyString(data?.token) || !isNonEmptyString(data?.visitor_id) || !isNonEmptyString(data?.sig)) {
      throw contractError('bootstrap_invalid')
    }
    let shellCopy
    try {
      shellCopy = decodeShellCopy(data?.view_copy)
    } catch (err) {
      throw contractError(err?.reason ? `bootstrap_${err.reason}` : 'bootstrap_shell_copy_invalid')
    }
    // Handle OPAC: cele trei câmpuri se retrimit ca atare, niciodată interpretate.
    return {
      session: { token: data.token, visitor_id: data.visitor_id, sig: data.sig },
      shellCopy,
    }
  }

  return {
    bootstrap,

    /**
     * Acceptul unui turn. Idempotent pe `clientTurnId`: același ID + același body → același
     * rezultat, fără al doilea apel LLM. De aceea replay-ul la outcome necunoscut e SIGUR, dar
     * numai cu body-ul identic — de asta `input`/`context`/`idToken` se transmit neschimbate.
     *
     * @returns {Promise<{outcome:'accepted', status:object} | {outcome:'terminal', view:object}
     *   | {outcome:'active_turn', status:object|null}>}
     */
    async createTurn({ session, clientTurnId, input, context, idToken, signal, timeoutMs }) {
      const body = {
        schema_version: WEB_TURN_REQUEST_SCHEMA_VERSION,
        client_turn_id: clientTurnId,
        input,
      }
      // Câmpuri opționale: absente, nu `null`. `extra="forbid"` acceptă lipsa, dar un `null`
      // explicit ar pica validarea — iar un body diferit ar schimba fingerprintul de idempotency.
      if (context !== undefined && context !== null) body.context = context
      if (idToken) body.id_token = idToken

      const response = await request(buildUrl('/web/v2/turns', sessionParams(session)), {
        method: 'POST',
        body,
        signal,
        timeoutMs,
      })
      if (response.status === 409) {
        const error = await readErrorBody(response)
        if (error.serverCode === 'conversation_turn_in_progress') {
          // Serverul spune AUTORIZAT care turn e activ. Dacă îl indică, ne atașăm la el.
          return {
            outcome: /** @type {'active_turn'} */ ('active_turn'),
            status: error.activeTurn === undefined ? null : decodeTurnStatus(error.activeTurn),
          }
        }
        throw httpError(response, error)
      }
      if (response.status === 404) {
        // Ruta nu există: `WEB_TURN_V2_ENABLED` e stins pe server.
        throw new WebTurnTransportError(E.UNSUPPORTED, { status: 404 })
      }
      return readTurnResponse(response)
    },

    /** Statusul sau rezultatul terminal al unui turn. 404 = inexistent SAU al altei sesiuni. */
    async getTurn({ session, turnId, signal, timeoutMs }) {
      const response = await request(
        buildUrl(`/web/v2/turns/${encodeURIComponent(turnId)}`, sessionParams(session)),
        { signal, timeoutMs },
      )
      if (response.status === 404) {
        throw new WebTurnTransportError(E.NOT_FOUND, { status: 404 })
      }
      return readTurnResponse(response)
    },

    /**
     * Abonare SSE. Întoarce funcția de oprire; `null` dacă mediul nu are `EventSource`.
     *
     * Cursorul (`Last-Event-ID`) e ținut de BROWSER pe reconectările proprii ale conexiunii —
     * `EventSource` nu permite headere, iar backendul citește exclusiv headerul, deci nu există
     * un parametru de query pe care l-am putea trimite. Nu inventăm unul: la o reconectare
     * completă (proces nou) cursorul se pierde, iar clientul respinge oricum evenimentele vechi
     * după rang, apoi confirmă cu `getTurn`. SSE e optimizare; GET rămâne autoritatea.
     */
    subscribe({ session, turnId, onStatus, onResult, onError }) {
      const factory = eventSourceFactory
        || (typeof EventSource === 'function' ? (url) => new EventSource(url) : null)
      if (factory === null) return null

      const url = buildUrl(`/web/v2/turns/${encodeURIComponent(turnId)}/events`, sessionParams(session))
      let source
      try {
        source = factory(url)
      } catch (err) {
        onError?.(asTransportError(err))
        return null
      }
      let closed = false

      const close = () => {
        if (closed) return
        closed = true
        try {
          source.close()
        } catch {
          // Un EventSource deja închis nu e o eroare.
        }
      }

      source.addEventListener('status', (event) => {
        if (closed) return
        try {
          onStatus?.(decodeSseStatus(JSON.parse(event.data)), event.lastEventId)
        } catch (err) {
          close()
          onError?.(asTransportError(err, E.CONTRACT))
        }
      })

      source.addEventListener('result', (event) => {
        if (closed) return
        // `result` e singurul frame care poartă un view; decodarea e async, deci închidem
        // conexiunea ÎNAINTE (turul e terminal — nu mai urmează nimic după el).
        const lastEventId = event.lastEventId
        let raw
        try {
          raw = JSON.parse(event.data)
        } catch (err) {
          close()
          onError?.(asTransportError(err, E.CONTRACT))
          return
        }
        close()
        decodeView(raw, onDiagnostic).then(
          (view) => onResult?.(view, lastEventId),
          (err) => onError?.(asTransportError(err, E.CONTRACT)),
        )
      })

      source.onerror = () => {
        if (closed) return
        // `EventSource` reconectează singur; raportăm ca deconectare, iar politica (poll fallback)
        // e a controllerului. Nu deblocăm nimic aici.
        onError?.(new WebTurnTransportError(E.NETWORK, { retryable: true }))
      }

      return close
    },

    /**
     * „Reînnoirea" sesiunii. Backendul NU are lineage de sesiune: nu există proof opac,
     * `session_family` sau outcome `continuity_preserved` (vezi `src/web/session.py`, NX-229) —
     * o sesiune expirată se înlocuiește cu un bootstrap nou, iar `visitor_id`-ul nou înseamnă
     * altă conversație. Deci singurul outcome onest e `new_session`, iar apelantul TREBUIE să
     * curețe corelația veche. Metoda există ca să existe UN singur loc care spune asta.
     */
    /** @param {RequestOptions} [options] */
    async renewSession({ signal, timeoutMs } = {}) {
      const { session, shellCopy } = await this.bootstrap({ signal, timeoutMs })
      return { outcome: 'new_session', session, shellCopy }
    },
  }
}
