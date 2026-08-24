// NX-243 — controllerul: partea nedeterministă (rețea, timere, storage, taburi) în jurul unui
// reducer pur. Aici trăiesc exact lucrurile pe care testul unui reducer nu le poate prinde:
// guardul SINCRON dinaintea primului `await`, bugetele de recovery și curățarea la unmount.
//
// Regula care ține corectitudinea: `client_turn_id` se generează și se PERSISTĂ înainte de orice
// I/O, iar din acel moment nu se mai schimbă până la un status terminal. Toate căile de
// recuperare — timeout, offline, refresh, SSE căzut, alt tab — refolosesc același ID. Un ID nou
// la retry ar însemna al doilea apel LLM plătit pentru același mesaj al clientului.
//
// Ce NU face: nu compune text, nu inventează progres, nu ține transcript, nu interpretează
// acțiuni și nu tratează un lock local ca pe o garanție. Single-flight-ul REAL e în ledgerul
// backend (NX-232/233); ce e aici e UX și reducere de trafic.

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { createWebTurnTransport, isTerminalStatus } from '../transport/webTurnTransport.js'
import { WEB_TURN_ERROR_CODES as E } from '../transport/webTurnErrors.js'
import { createChatSessionStorage, storageNamespace } from '../session/chatSessionStorage.js'
import { exceedsComposerLimit } from '../composerLimits.js'
import {
  RECOVERY_REASONS,
  WEB_CHAT_EVENTS as A,
  WEB_CHAT_PHASES as P,
  canSubmit,
  initialWebChatState,
  latestView,
  webChatReducer,
} from './webChatReducer.js'

/**
 * Praguri de transport. Derivate din configurația reală a backendului, nu ghicite:
 * `WEB_TURN_DEADLINE_S=120` (deadline-ul de tur), `WEB_TURN_POLL_AFTER_MS=1000` (serverul își
 * spune singur cadența, iar noi o respectăm), `WEB_TURN_SSE_MAX_S=600`.
 *
 * Acceptul NU rulează pipeline-ul (scrie ledgerul și răspunde), deci are un timeout scurt; un
 * timeout aici înseamnă „nu știu dacă a ajuns", nu „a eșuat".
 */
export const DEFAULT_TURN_POLICY = Object.freeze({
  bootstrapTimeoutMs: 10_000,
  acceptTimeoutMs: 15_000,
  statusTimeoutMs: 10_000,
  pollMinMs: 1_000,
  pollMaxMs: 8_000,
  /** Câte încercări de recovery înainte de `unavailable`. Nu deblochează nimic la epuizare. */
  recoveryMaxAttempts: 8,
  /** Cât așteptăm un terminal peste deadline-ul serverului, înainte de retragere tehnică. */
  turnWaitBudgetMs: 150_000,
})

const BROADCAST_KINDS = Object.freeze(['turn_started', 'snapshot_stale', 'turn_terminal'])

/** UUID v4. Backendul cere un UUID real pentru `client_turn_id` (cheia de idempotency). */
function newUuid() {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID()
  if (c?.getRandomValues) {
    const bytes = c.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  // Ultimul resort (jsdom vechi/medii exotice): tot forma unui UUID v4, calitate de entropie mai
  // slabă. Coliziunea ar produce un 409 `idempotency_conflict`, nu o execuție dublă.
  const rand = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')
  return `${rand()}${rand()}-${rand()}-4${rand().slice(1)}-a${rand().slice(1)}-${rand()}${rand()}${rand()}`
}

/** Backoff exponențial cu jitter, plafonat. `Retry-After` are prioritate dacă serverul îl dă. */
function backoffMs(attempt, { pollMinMs, pollMaxMs }, retryAfterMs) {
  if (Number.isFinite(retryAfterMs) && retryAfterMs !== null && retryAfterMs >= 0) {
    return Math.min(retryAfterMs, 60_000)
  }
  const base = Math.min(pollMinMs * 2 ** attempt, pollMaxMs)
  return Math.round(base * (0.75 + Math.random() * 0.5))
}

function faultOf(error) {
  return {
    code: error?.code || E.NETWORK,
    serverCode: error?.serverCode || null,
    serverMessage: error?.serverMessage || null,
    retryable: error?.retryable === true,
  }
}

/**
 * `enabled: false` = hook complet inert (zero requesturi, zero storage, zero timere).
 * `getContext` = contextul de pagină NX-234, dacă hostul îl oferă: controllerul îl FORWARDEAZĂ
 * opac și nu derivă nimic din rută/produs/coș.
 *
 * @param {{enabled?: boolean, apiBase?: string, publicToken?: string, transport?: any,
 *   eventSourceFactory?: ((url: string) => any)|null, fetchImpl?: Function, storage?: any,
 *   broadcastFactory?: ((name: string) => any)|null, policy?: any,
 *   onMetric?: (name: string, labels: object) => void, getContext?: () => any}} [options]
 */
export function useWebChatController({
  enabled = false,
  apiBase = '',
  publicToken = '',
  transport: injectedTransport,
  eventSourceFactory,
  fetchImpl,
  storage: injectedStorage,
  broadcastFactory,
  policy: policyOverride,
  onMetric,
  getContext,
} = {}) {
  const [state, dispatch] = useReducer(webChatReducer, initialWebChatState)

  // ATENȚIE — identitatea contează mai mult decât pare. Efectele de mai jos pornesc requesturi de
  // lungă durată (accept, polling, recovery) și se ANULEAZĂ la fiecare schimbare de dependență.
  // Dacă `policy`, `onMetric` sau `getContext` sosesc ca literal inline (cum le scrie orice
  // apelant normal), ele sunt obiecte NOI la fiecare render, efectele reponesc, iar recovery-ul
  // în zbor e tăiat exact înainte să aplice rezultatul. De aceea: politica se memoizează pe
  // VALOARE, iar callback-urile trăiesc în ref-uri și sunt apelate prin funcții stabile.
  const policyKey = JSON.stringify(policyOverride || {})
  const policy = useMemo(
    () => ({ ...DEFAULT_TURN_POLICY, ...(policyOverride || {}) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- memo pe valoare, nu pe identitate
    [policyKey],
  )

  const onMetricRef = useRef(onMetric)
  onMetricRef.current = onMetric
  const metric = useCallback((name, labels = {}) => onMetricRef.current?.(name, labels), [])

  const getContextRef = useRef(getContext)
  getContextRef.current = getContext

  // Aceeași grijă pentru primitivele injectate: transportul se creează o dată pe integrare, iar
  // `fetchImpl`/`eventSourceFactory` se citesc prin ref, ca un literal inline să nu-l recreeze.
  const fetchImplRef = useRef(fetchImpl)
  fetchImplRef.current = fetchImpl
  const eventSourceFactoryRef = useRef(eventSourceFactory)
  eventSourceFactoryRef.current = eventSourceFactory

  const transport = useMemo(
    () =>
      injectedTransport
      || createWebTurnTransport({
        apiBase,
        publicToken,
        fetchImpl: fetchImplRef.current ? (url, init) => fetchImplRef.current(url, init) : undefined,
        eventSourceFactory: eventSourceFactoryRef.current
          ? (url) => eventSourceFactoryRef.current(url)
          : undefined,
      }),
    [injectedTransport, apiBase, publicToken],
  )

  const storage = useMemo(() => {
    if (injectedStorage !== undefined && injectedStorage !== null && typeof injectedStorage.read === 'function') {
      return injectedStorage
    }
    const origin = typeof location !== 'undefined' ? location.origin : ''
    return createChatSessionStorage({
      namespace: storageNamespace([apiBase, publicToken, origin]),
      storage: injectedStorage === undefined ? undefined : injectedStorage,
    })
  }, [injectedStorage, apiBase, publicToken])

  // Referințe: efectele citesc mereu ultima stare fără să se re-lege la fiecare render.
  const stateRef = useRef(state)
  stateRef.current = state
  const disposedRef = useRef(false)
  /** Guardul SINCRON: setat înainte de orice `await`, deci două click-uri în același tick văd al doilea. */
  const inFlightRef = useRef(false)
  // Guardul OGLINDEȘTE starea și se eliberează în render, nu într-un efect: un `ref` schimbat în
  // efect nu produce re-render, iar UI-ul ar rămâne blocat după un turn încheiat până la un render
  // întâmplător. Fără turn activ nu există nimic în zbor — atribuirea e idempotentă și derivată.
  if (state.activeTurn === null) inFlightRef.current = false
  /** Body-ul exact al turului curent — replay-ul TREBUIE să fie identic (fingerprint idempotency). */
  const pendingRef = useRef(null)
  const abortRef = useRef(null)
  const timerRef = useRef(null)
  const unsubscribeRef = useRef(null)
  const waitStartedRef = useRef(0)
  const recoveryStartedRef = useRef(0)
  const bootstrapStartedRef = useRef(false)
  const channelRef = useRef(null)
  const broadcastFactoryRef = useRef(broadcastFactory)
  broadcastFactoryRef.current = broadcastFactory

  const safeDispatch = useCallback((action) => {
    if (disposedRef.current) return
    dispatch(action)
  }, [])

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const closeStream = useCallback(() => {
    if (unsubscribeRef.current !== null) {
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }
  }, [])

  const newAbort = useCallback(() => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    return controller.signal
  }, [])

  const broadcast = useCallback((kind) => {
    if (!BROADCAST_KINDS.includes(kind)) return
    try {
      // Doar invalidare: niciun text, niciun ViewModel, niciun ID. Celălalt tab întreabă serverul.
      channelRef.current?.postMessage({ kind })
    } catch {
      // Canalul e o optimizare; absența lui nu schimbă corectitudinea (fiecare tab are backendul).
    }
  }, [])

  // ── Curățare globală ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    disposedRef.current = false
    return () => {
      disposedRef.current = true
      clearTimer()
      closeStream()
      abortRef.current?.abort()
    }
  }, [clearTimer, closeStream])

  // ── Cross-tab: numai invalidări tehnice ───────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return undefined
    const factory = broadcastFactoryRef.current
      || (typeof BroadcastChannel === 'function' ? (name) => new BroadcastChannel(name) : null)
    if (factory === null) return undefined
    let channel
    try {
      channel = factory(`nx-chat.v2.${storage.key}`)
    } catch {
      return undefined // private mode / mediu fără suport: rămânem pe backend, ca înainte
    }
    channelRef.current = channel
    channel.onmessage = (event) => {
      const kind = event?.data?.kind
      if (!BROADCAST_KINDS.includes(kind)) return
      const current = stateRef.current
      if (current.phase !== P.READY && current.phase !== P.WAITING) return
      // Mesajul nu poartă adevăr, doar „ceva s-a schimbat". Adevărul se cere de la server.
      if (current.activeTurn !== null) {
        safeDispatch({ type: A.DISCONNECTED, reason: RECOVERY_REASONS.ACTIVE_TURN_UNKNOWN })
        return
      }
      const record = storage.read()
      if (!record?.active_turn_id || !record.client_turn_id) return
      // Turn pornit de alt tab: adoptăm doar referința opacă și o confirmăm cu `getTurn`.
      safeDispatch({
        type: A.ADOPT,
        turn: { turnId: record.active_turn_id, clientTurnId: record.client_turn_id },
        reason: RECOVERY_REASONS.ACTIVE_TURN_UNKNOWN,
      })
    }
    return () => {
      channelRef.current = null
      try {
        channel.close()
      } catch {
        // deja închis
      }
    }
  }, [enabled, storage, safeDispatch])

  // ── Pornire ───────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return
    if (state.phase !== P.UNINITIALIZED) return
    if (bootstrapStartedRef.current) return
    bootstrapStartedRef.current = true
    safeDispatch({ type: A.BOOTSTRAP_STARTED })
  }, [enabled, state.phase, safeDispatch])

  useEffect(() => {
    if (!enabled || state.phase !== P.BOOTSTRAPPING) return undefined
    let cancelled = false
    const startedAt = Date.now()

    const run = async () => {
      const record = storage.read()
      if (record !== null) {
        // Sesiune deja emisă: o refolosim fără round-trip. Dacă a expirat, primul request va
        // răspunde 403 și intrăm pe calea de renewal — nu ghicim expirarea din `sig` (e opac).
        if (cancelled) return
        metric('web_widget_bootstrap_total', { outcome: 'restored' })
        safeDispatch({
          type: A.BOOTSTRAP_OK,
          session: record.session_handle,
          // NX-244: copy-ul persistat odată cu sesiunea. Bootstrapul e rate-limitat pe server,
          // deci o sesiune restaurată nu-l mai poate cere — fără el, shell-ul ar fi fără nume.
          shellCopy: record.view_copy,
          conversationId: record.conversation_id,
          resumeTurn: record.active_turn_id !== null
            ? { turnId: record.active_turn_id, clientTurnId: record.client_turn_id }
            : null,
        })
        return
      }
      try {
        const { session, shellCopy } = await transport.bootstrap({
          signal: newAbort(),
          timeoutMs: policy.bootstrapTimeoutMs,
        })
        if (cancelled || disposedRef.current) return
        storage.start(session, shellCopy)
        metric('web_widget_bootstrap_total', { outcome: 'ok' })
        metric('web_widget_bootstrap_ms', { ms: Date.now() - startedAt })
        safeDispatch({
          type: A.BOOTSTRAP_OK,
          session,
          shellCopy,
          conversationId: null,
          resumeTurn: null,
        })
      } catch (error) {
        if (cancelled || disposedRef.current || error?.code === E.ABORTED) return
        safeDispatch({ type: A.BOOTSTRAP_FAILED, fault: faultOf(error) })
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [enabled, state.phase, storage, transport, policy, newAbort, safeDispatch, metric])

  // ── Accept ────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || state.phase !== P.SUBMITTING) return undefined
    const pending = pendingRef.current
    if (pending === null) return undefined
    let cancelled = false

    const run = async () => {
      try {
        const result = await transport.createTurn({
          session: state.session,
          clientTurnId: pending.clientTurnId,
          input: pending.input,
          context: pending.context,
          idToken: pending.idToken,
          signal: newAbort(),
          timeoutMs: policy.acceptTimeoutMs,
        })
        if (cancelled || disposedRef.current) return
        if (result.outcome === 'accepted') {
          storage.write({ active_turn_id: result.status.turnId, client_turn_id: result.status.clientTurnId })
          metric('web_turn_submit_total', { outcome: 'accepted' })
          broadcast('turn_started')
          safeDispatch({ type: A.ACCEPTED, status: result.status })
          return
        }
        if (result.outcome === 'terminal') {
          // Replay exact al aceluiași `client_turn_id` (NX-232): rezultatul era deja comis.
          metric('web_turn_submit_total', { outcome: 'replayed' })
          storage.write({ active_turn_id: result.view.turn.id })
          safeDispatch({ type: A.TERMINAL, view: result.view })
          return
        }
        // 409: conversația are deja un turn activ. Ne atașăm la CE SPUNE SERVERUL.
        metric('web_turn_submit_total', { outcome: 'active_turn' })
        if (result.status !== null) {
          storage.write({
            active_turn_id: result.status.turnId,
            client_turn_id: result.status.clientTurnId,
          })
          safeDispatch({ type: A.ATTACH, status: result.status })
        } else {
          // Serverul nu ne-a spus care e turul activ. Nu inventăm unul și nu deblocăm: reluăm
          // ACELAȘI accept idempotent cu backoff — e singura cale prin care aflăm.
          safeDispatch({ type: A.UNKNOWN_OUTCOME, reason: RECOVERY_REASONS.ACTIVE_TURN_UNKNOWN })
        }
      } catch (error) {
        if (cancelled || disposedRef.current || error?.code === E.ABORTED) return
        if (error.code === E.SESSION_EXPIRED) {
          safeDispatch({ type: A.SESSION_EXPIRED })
          return
        }
        if (error.unknownOutcome) {
          // Nu știm dacă serverul a acceptat. NU deblocăm și NU generăm alt ID.
          metric('web_turn_submit_total', { outcome: 'unknown' })
          safeDispatch({ type: A.UNKNOWN_OUTCOME, reason: RECOVERY_REASONS.RESPONSE_LOST })
          return
        }
        if (error.code === E.UNSUPPORTED || error.code === E.CONTRACT) {
          safeDispatch({ type: A.FATAL, fault: faultOf(error) })
          return
        }
        // 4xx dovedit înainte de accept (schema, rate limit, buget, acțiune consumată).
        safeDispatch({ type: A.REJECTED, fault: faultOf(error) })
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [enabled, state.phase, state.session, transport, storage, policy, newAbort, safeDispatch, metric, broadcast])

  // ── Așteptare: SSE dacă serverul îl oferă, altfel polling ─────────────────────────────────
  // Dependențele sunt PRIMITIVE (`turnId`, `sseOffered`), nu obiectul `activeTurn`: altfel
  // fiecare `PROGRESS` ar produce un obiect nou, iar efectul ar închide și ar redeschide SSE-ul
  // la fiecare schimbare de status — exact reconectarea pe care încercăm să o evităm.
  const activeTurnId = state.activeTurn === null ? null : state.activeTurn.turnId
  const activeSseOffered = state.activeTurn !== null && state.activeTurn.sseOffered

  useEffect(() => {
    if (!enabled || state.phase !== P.WAITING) return undefined
    if (activeTurnId === null) return undefined
    if (waitStartedRef.current === 0) waitStartedRef.current = Date.now()
    let cancelled = false

    const applyResult = (view) => {
      if (cancelled || disposedRef.current) return
      storage.clearTurn()
      broadcast('turn_terminal')
      safeDispatch({ type: A.TERMINAL, view })
    }

    const poll = async (attempt) => {
      if (cancelled || disposedRef.current) return
      if (Date.now() - waitStartedRef.current > policy.turnWaitBudgetMs) {
        safeDispatch({
          type: A.BUDGET_EXHAUSTED,
          fault: { code: E.TIMEOUT, serverCode: 'wait_budget', serverMessage: null, retryable: true },
        })
        return
      }
      try {
        const result = await transport.getTurn({
          session: state.session,
          turnId: activeTurnId,
          signal: newAbort(),
          timeoutMs: policy.statusTimeoutMs,
        })
        if (cancelled || disposedRef.current) return
        if (result.outcome === 'terminal') {
          applyResult(result.view)
          return
        }
        safeDispatch({ type: A.PROGRESS, status: result.status })
        clearTimer()
        timerRef.current = setTimeout(
          () => poll(0),
          Math.max(result.status.pollAfterMs, policy.pollMinMs),
        )
      } catch (error) {
        if (cancelled || disposedRef.current || error?.code === E.ABORTED) return
        if (error.code === E.SESSION_EXPIRED) {
          safeDispatch({ type: A.SESSION_EXPIRED })
          return
        }
        if (error.code === E.NOT_FOUND) {
          storage.clearTurn()
          safeDispatch({ type: A.TURN_GONE, fault: faultOf(error) })
          return
        }
        metric('web_turn_transport_retry_total', { operation: 'get_turn', reason: error.code })
        if (attempt + 1 >= policy.recoveryMaxAttempts) {
          safeDispatch({ type: A.DISCONNECTED, reason: RECOVERY_REASONS.SSE_DISCONNECT })
          return
        }
        clearTimer()
        timerRef.current = setTimeout(
          () => poll(attempt + 1),
          backoffMs(attempt, policy, error.retryAfterMs),
        )
      }
    }

    if (activeSseOffered) {
      closeStream()
      unsubscribeRef.current = transport.subscribe({
        session: state.session,
        turnId: activeTurnId,
        onStatus: (status) => {
          if (cancelled || disposedRef.current) return
          if (isTerminalStatus(status.status)) return // rezultatul vine pe frame-ul `result`
          safeDispatch({ type: A.PROGRESS, status })
        },
        onResult: applyResult,
        onError: () => {
          if (cancelled || disposedRef.current) return
          // Conexiunea a căzut; NU deblocăm nimic — trecem pe calea autoritativă (GET).
          closeStream()
          safeDispatch({ type: A.DISCONNECTED, reason: RECOVERY_REASONS.SSE_DISCONNECT })
        },
      })
      if (unsubscribeRef.current === null) poll(0) // fără EventSource în mediu → polling direct
    } else {
      clearTimer()
      timerRef.current = setTimeout(() => poll(0), policy.pollMinMs)
    }

    return () => {
      cancelled = true
      clearTimer()
      closeStream()
    }
  }, [
    enabled, state.phase, activeTurnId, activeSseOffered, state.session, transport, storage,
    policy, newAbort, safeDispatch, metric, clearTimer, closeStream, broadcast,
  ])

  // ── Recovery: același ID, mereu ───────────────────────────────────────────────────────────
  const hasActiveTurn = state.activeTurn !== null

  useEffect(() => {
    if (!enabled || state.phase !== P.RECOVERING) return undefined
    if (!hasActiveTurn) return undefined
    if (recoveryStartedRef.current === 0) recoveryStartedRef.current = Date.now()
    let cancelled = false

    const attempt = state.recovery.attempts
    if (attempt >= policy.recoveryMaxAttempts) {
      safeDispatch({
        type: A.BUDGET_EXHAUSTED,
        fault: { code: E.NETWORK, serverCode: 'recovery_budget', serverMessage: null, retryable: true },
      })
      return undefined
    }

    const finish = (outcome) => {
      metric('web_turn_recovery_ms', { ms: Date.now() - recoveryStartedRef.current, outcome })
      recoveryStartedRef.current = 0
    }

    const run = async () => {
      try {
        // Turnul e cunoscut ⇒ îl întrebăm pe server. Nu e cunoscut (răspunsul la accept s-a
        // pierdut) ⇒ REJUCĂM exact același accept: idempotency-ul NX-232 întoarce fie statusul,
        // fie rezultatul deja comis. Un POST nou cu alt ID ar fi a doua execuție plătită.
        let result
        if (activeTurnId !== null) {
          result = await transport.getTurn({
            session: state.session,
            turnId: activeTurnId,
            signal: newAbort(),
            timeoutMs: policy.statusTimeoutMs,
          })
        } else {
          const pending = pendingRef.current
          if (pending === null) {
            safeDispatch({ type: A.TURN_GONE, fault: null })
            return
          }
          const accepted = await transport.createTurn({
            session: state.session,
            clientTurnId: pending.clientTurnId,
            input: pending.input,
            context: pending.context,
            idToken: pending.idToken,
            signal: newAbort(),
            timeoutMs: policy.acceptTimeoutMs,
          })
          if (accepted.outcome === 'active_turn') {
            if (accepted.status === null) throw new Error('active_turn_without_reference')
            result = { outcome: 'accepted', status: accepted.status }
          } else {
            result = accepted
          }
        }
        if (cancelled || disposedRef.current) return
        if (result.outcome === 'terminal') {
          storage.clearTurn()
          finish('terminal')
          broadcast('turn_terminal')
          safeDispatch({ type: A.TERMINAL, view: result.view })
          return
        }
        storage.write({
          active_turn_id: result.status.turnId,
          client_turn_id: result.status.clientTurnId,
        })
        finish('attached')
        safeDispatch({ type: A.ATTACH, status: result.status })
      } catch (error) {
        if (cancelled || disposedRef.current || error?.code === E.ABORTED) return
        if (error.code === E.SESSION_EXPIRED) {
          safeDispatch({ type: A.SESSION_EXPIRED })
          return
        }
        if (error.code === E.NOT_FOUND) {
          storage.clearTurn()
          finish('gone')
          safeDispatch({ type: A.TURN_GONE, fault: faultOf(error) })
          return
        }
        if (error.code === E.IDEMPOTENCY_CONFLICT || error.code === E.REJECTED) {
          storage.clearTurn()
          finish('rejected')
          safeDispatch({ type: A.REJECTED, fault: faultOf(error) })
          return
        }
        metric('web_turn_transport_retry_total', {
          operation: activeTurnId === null ? 'create_turn' : 'get_turn',
          reason: error.code,
        })
        clearTimer()
        timerRef.current = setTimeout(
          () => safeDispatch({ type: A.RETRY_TICK }),
          backoffMs(attempt, policy, error.retryAfterMs),
        )
      }
    }

    run()
    return () => {
      cancelled = true
      clearTimer()
    }
  }, [
    enabled, state.phase, hasActiveTurn, activeTurnId, state.session, state.recovery.attempts,
    transport, storage, policy, newAbort, safeDispatch, metric, clearTimer, broadcast,
  ])

  // ── Sesiune expirată: bootstrap nou, corelație veche ștearsă atomic ────────────────────────
  useEffect(() => {
    if (!enabled || state.phase !== P.RENEWING) return undefined
    let cancelled = false

    const run = async () => {
      try {
        const { session, shellCopy } = await transport.renewSession({
          signal: newAbort(),
          timeoutMs: policy.bootstrapTimeoutMs,
        })
        if (cancelled || disposedRef.current) return
        // Ordinea contează: întâi ștergem TOT recordul vechi, abia apoi scriem sesiunea nouă.
        // Un record parțial ar putea lăsa un `active_turn_id` din sesiunea moartă, iar clientul
        // ar cere serverului un turn care nu îi mai aparține.
        storage.clear()
        storage.start(session, shellCopy)
        pendingRef.current = null
        inFlightRef.current = false
        metric('web_widget_session_transition_total', { outcome: 'new_session' })
        safeDispatch({ type: A.SESSION_RENEWED, session, shellCopy })
      } catch (error) {
        if (cancelled || disposedRef.current || error?.code === E.ABORTED) return
        metric('web_widget_session_transition_total', { outcome: 'unauthorized' })
        safeDispatch({ type: A.BOOTSTRAP_FAILED, fault: faultOf(error) })
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [enabled, state.phase, transport, storage, policy, newAbort, safeDispatch, metric])

  // ── Resetul cronometrelor când turul s-a încheiat ─────────────────────────────────────────
  useEffect(() => {
    if (state.activeTurn === null) {
      pendingRef.current = null
      waitStartedRef.current = 0
      recoveryStartedRef.current = 0
    }
  }, [state.activeTurn])

  // ── Reconectare de rețea: reluăm imediat, fără să așteptăm backoff-ul ─────────────────────
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined
    const onOnline = () => {
      if (stateRef.current.phase === P.RECOVERING) {
        clearTimer()
        safeDispatch({ type: A.RETRY_TICK })
      }
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [enabled, clearTimer, safeDispatch])

  // ── Drenarea diagnosticelor emise de reducer ──────────────────────────────────────────────
  useEffect(() => {
    if (state.diagnostics.length === 0) return
    for (const entry of state.diagnostics) metric(entry.name, entry.labels)
    dispatch({ type: 'diagnostics_drained' })
  }, [state.diagnostics, metric])

  // ── API pentru UI ─────────────────────────────────────────────────────────────────────────

  /**
   * Trimite un input. Întoarce `true` dacă turul a pornit. TOT ce blochează al doilea submit se
   * întâmplă SINCRON, înainte de primul `await`: `inFlightRef`, ID-ul persistat, dispatch-ul.
   */
  const submit = useCallback((input, { source = 'unknown' } = {}) => {
    if (!enabled) return false
    if (inFlightRef.current || !canSubmit(stateRef.current)) {
      metric('web_turn_duplicate_submit_blocked_total', { source })
      return false
    }
    inFlightRef.current = true
    const clientTurnId = newUuid()
    // Persistat ÎNAINTE de I/O: dacă tabul moare imediat după POST, recovery-ul are de la ce porni.
    storage.write({ client_turn_id: clientTurnId, active_turn_id: null })
    pendingRef.current = {
      clientTurnId,
      input,
      context: typeof getContextRef.current === 'function' ? getContextRef.current() : undefined,
      idToken: undefined,
    }
    safeDispatch({ type: A.SUBMIT, clientTurnId, source })
    return true
  }, [enabled, storage, safeDispatch, metric])

  const sendText = useCallback((text, options) => {
    const value = typeof text === 'string' ? text.trim() : ''
    if (value.length === 0) return false
    // Guardul dublu, aceeași logică ca la single-flight: `disabled` pe buton oprește omul, nu un
    // `dispatchEvent` programatic sau un apelant care sare peste composer. Se REFUZĂ, nu se taie —
    // un mesaj trunchiat în tăcere e mai rău decât unul netrimis. Metrica e cea care ne va spune
    // dacă 2.000 e prea strâmt: dacă `too_long` crește, plafonul se ridică, nu presupunem acum.
    if (exceedsComposerLimit(value)) {
      metric('web_turn_submit_total', { outcome: 'too_long' })
      return false
    }
    return submit({ type: 'text', text: value }, options)
  }, [submit, metric])

  /** Acțiune opacă: tokenul se retrimite NESCHIMBAT, fără să fie citit sau interpretat. */
  const sendAction = useCallback((token, options) => {
    if (typeof token !== 'string' || token.length === 0) return false
    return submit({ type: 'action', action_token: token }, { source: 'action', ...(options || {}) })
  }, [submit])

  /** Reîncercare TEHNICĂ din `unavailable` — reia același turn, nu pornește altul. */
  const retry = useCallback(() => {
    clearTimer()
    safeDispatch({ type: A.RETRY })
  }, [clearTimer, safeDispatch])

  /** „Conversație nouă": inactiv cât timp există un turn activ. Sesiune nouă = conversație nouă. */
  const reset = useCallback(() => {
    if (stateRef.current.activeTurn !== null) return false
    clearTimer()
    closeStream()
    storage.clear()
    inFlightRef.current = false
    pendingRef.current = null
    bootstrapStartedRef.current = true
    safeDispatch({ type: A.RESET })
    return true
  }, [clearTimer, closeStream, storage, safeDispatch])

  const view = latestView(state)

  // Reîncercarea TEHNICĂ are sens pentru orice defect de transport (rețea, timeout, buget epuizat,
  // frame corupt): GET-ul e autoritatea și poate reuși data viitoare. NU are sens pentru cele două
  // fapte de configurare — ruta v2 stinsă pe server și accesul respins — pe care o reîncercare nu
  // le schimbă. Fără distincția asta, un bootstrap picat pe rețea ar lăsa widgetul mort, fiindcă
  // `retryable` de la server e despre RESPINGERI, nu despre defecte de transport.
  const canRetry = state.phase === P.UNAVAILABLE
    && state.fault?.code !== E.UNSUPPORTED
    && state.fault?.code !== E.UNAUTHORIZED

  return {
    state,
    /** Ultimul view server (copy de composer/chrome/a11y + progres). Niciodată compus local. */
    view,
    /**
     * NX-244 — copy-ul ramei, cu precedență EXPLICITĂ: view-ul curent bate bootstrapul, fiindcă
     * e copy-ul turului real. UN singur loc decide asta, ca shell-ul să nu aleagă altfel decât
     * composerul. `null` peste tot = serverul n-a trimis nimic; FE-ul NU inventează un înlocuitor.
     */
    chrome: view?.chrome ?? state.shellCopy?.chrome ?? null,
    composer: view?.composer ?? state.shellCopy?.composer ?? null,
    announcements: view?.a11y?.announcements ?? state.shellCopy?.a11y?.announcements ?? null,
    /** Toate view-urile livrate în sesiunea curentă, în ordinea sosirii. Nepersistate. */
    views: state.views,
    // Derivat EXCLUSIV din stare: e singurul lucru pe care React îl re-randează.
    canSubmit: canSubmit(state),
    busy: state.phase === P.SUBMITTING || state.phase === P.WAITING || state.phase === P.RECOVERING,
    progressStatus: state.progressStatus,
    sessionOutcome: state.sessionOutcome,
    fault: state.fault,
    canRetry,
    sendText,
    sendAction,
    retry,
    reset,
  }
}
