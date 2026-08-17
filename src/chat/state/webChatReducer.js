// NX-243 — mașina de stare a conversației v2. PURĂ: fără fetch, fără timere, fără `Date.now()`,
// fără `localStorage`. Tot ce e nedeterminist trăiește în controller; aici stau invarianții.
//
// De ce un reducer și nu încă un `useState`: în v1 turul era un singur boolean (`sending`).
// Un boolean nu poate exprima diferența dintre „am trimis și aștept", „nu știu dacă a ajuns" și
// „serverul are alt turn activ" — și exact în acea gaură intră dublul submit, turnul duplicat
// după timeout și răspunsul vechi lipit de conversația nouă.
//
// Invarianți impuși AICI (testele îi verifică unul câte unul):
//   1. cel mult un `activeTurn` per controller;
//   2. `ready` e singura stare din care poate porni un turn nou;
//   3. `clientTurnId` nu se schimbă din clipa dinaintea POST-ului până la un status terminal;
//   4. un snapshot mai vechi (rang de status sau revizie de conversație) nu îl înlocuiește pe
//      unul mai nou;
//   5. un rezultat cu alt `conversation.id`, `turn.id` sau `client_turn_id` e RESPINS și raportat;
//   6. deblocarea vine numai dintr-un terminal valid sau dintr-un refuz dovedit ÎNAINTE de accept;
//   7. închiderea/navigarea nu anulează turul — doar conexiunea, care se recuperează.

import { TURN_STATUS_RANK, isTerminalStatus } from '../transport/webTurnTransport.js'

export const WEB_CHAT_PHASES = Object.freeze({
  UNINITIALIZED: 'uninitialized',
  BOOTSTRAPPING: 'bootstrapping',
  READY: 'ready',
  SUBMITTING: 'submitting',
  WAITING: 'waiting',
  RECOVERING: 'recovering',
  RENEWING: 'renewing',
  UNAVAILABLE: 'unavailable',
})

export const WEB_CHAT_EVENTS = Object.freeze({
  BOOTSTRAP_STARTED: 'bootstrap_started',
  BOOTSTRAP_OK: 'bootstrap_ok',
  BOOTSTRAP_FAILED: 'bootstrap_failed',
  SUBMIT: 'submit',
  ACCEPTED: 'accepted',
  ATTACH: 'attach',
  ADOPT: 'adopt',
  PROGRESS: 'progress',
  TERMINAL: 'terminal',
  REJECTED: 'rejected',
  UNKNOWN_OUTCOME: 'unknown_outcome',
  DISCONNECTED: 'disconnected',
  RETRY_TICK: 'retry_tick',
  TURN_GONE: 'turn_gone',
  BUDGET_EXHAUSTED: 'budget_exhausted',
  SESSION_EXPIRED: 'session_expired',
  SESSION_RENEWED: 'session_renewed',
  FATAL: 'fatal',
  RETRY: 'retry',
  RESET: 'reset',
})

/** Motivele de recovery — low-cardinality, exact vocabularul metricii din card. */
export const RECOVERY_REASONS = Object.freeze({
  RESPONSE_LOST: 'response_lost',
  REFRESH: 'refresh',
  SSE_DISCONNECT: 'sse_disconnect',
  ACTIVE_TURN_UNKNOWN: 'active_turn_unknown',
  CORRELATION_MISMATCH: 'correlation_mismatch',
  SESSION_RENEW_PRESERVED: 'session_renew_preserved',
})

/** Câte view-uri server ținem în memorie. Nu se persistă niciunul (P: zero transcript local). */
const MAX_VIEWS = 20
/** Diagnostice nedrenate — mărginit, ca un flux de evenimente vechi să nu crească la infinit. */
const MAX_DIAGNOSTICS = 20

export const initialWebChatState = Object.freeze({
  phase: WEB_CHAT_PHASES.UNINITIALIZED,
  /** Handle opac (token/visitor_id/sig). Niciodată interpretat. */
  session: null,
  /**
   * NX-244 — copy-ul RAMEI de la bootstrap (`{composer, chrome, a11y}`), server-owned. Ține
   * shell-ul cu nume înainte să existe primul view. Din primul view încolo, `view.chrome` are
   * prioritate: e copy-ul turului curent, în locale-ul lui. `null` = serverul nu l-a trimis.
   */
  shellCopy: null,
  conversationId: null,
  /** `{ turnId: string|null, clientTurnId: string, rank: number, sseOffered: boolean }` */
  activeTurn: null,
  /** View-urile `web-view.v2` livrate de server, în ordinea sosirii. Adevăr server, în memorie. */
  views: [],
  /** Ultimul status ne-terminal raportat de server (`accepted|working|validating`). */
  progressStatus: null,
  /** `null` | `'new_session'` — schimbare de sesiune care a rupt continuitatea, explicit în UI. */
  sessionOutcome: null,
  /** Eroare TEHNICĂ curentă: `{ code, serverCode, serverMessage, retryable }`. */
  fault: null,
  recovery: Object.freeze({ attempts: 0, reason: null }),
  /** Coadă drenată de controller pentru metrici. Numai etichete închise, niciun ID. */
  diagnostics: [],
})

// ── Ajutoare pure ───────────────────────────────────────────────────────────────────────────

function diag(state, name, labels = {}) {
  const next = [...state.diagnostics, { name, labels }]
  return next.length > MAX_DIAGNOSTICS ? next.slice(next.length - MAX_DIAGNOSTICS) : next
}

function revisionOf(view) {
  const revision = view?.conversation?.revision
  return Number.isInteger(revision) ? revision : 0
}

/**
 * Aplică un view peste lista de view-uri. Un view pentru un tur deja prezent îl ÎNLOCUIEȘTE doar
 * dacă e mai nou (rang de status ≥ și revizie ≥); altfel lista rămâne neschimbată — invariantul 4.
 * @returns {{views: Array, applied: boolean}}
 */
function mergeView(views, view) {
  const turnId = view.turn.id
  const index = views.findIndex((existing) => existing.turn.id === turnId)
  if (index === -1) {
    const next = [...views, view]
    return { views: next.length > MAX_VIEWS ? next.slice(next.length - MAX_VIEWS) : next, applied: true }
  }
  const current = views[index]
  const newer = TURN_STATUS_RANK[view.turn.status] >= TURN_STATUS_RANK[current.turn.status]
    && revisionOf(view) >= revisionOf(current)
  if (!newer) return { views, applied: false }
  const next = views.slice()
  next[index] = view
  return { views: next, applied: true }
}

/**
 * Corelația: un rezultat aparține turului pe care îl urmărim? Întoarce `null` dacă e în regulă,
 * altfel motivul respingerii. Fără activeTurn nu există corelație posibilă — deci e stale.
 */
export function correlationMismatch(state, { turnId, clientTurnId, conversationId = undefined }) {
  const active = state.activeTurn
  if (active === null) return 'no_active_turn'
  if (clientTurnId !== active.clientTurnId) return 'client_turn_id'
  if (active.turnId !== null && turnId !== active.turnId) return 'turn_id'
  if (state.conversationId !== null && conversationId !== undefined && conversationId !== state.conversationId) {
    return 'conversation_id'
  }
  return null
}

/** Poate porni un turn nou? Singura funcție pe care UI-ul are voie să o întrebe. */
export function canSubmit(state) {
  return state.phase === WEB_CHAT_PHASES.READY && state.session !== null
}

/** Ultimul view livrat de server — sursa copy-ului de composer/chrome/a11y. */
export function latestView(state) {
  return state.views.length === 0 ? null : state.views[state.views.length - 1]
}

const CLEARED_TURN = Object.freeze({ activeTurn: null, progressStatus: null, recovery: initialWebChatState.recovery })

/**
 * Adoptă o REFERINȚĂ de turn (id-uri opace din storage sau de la alt tab) și intră în recovery.
 * `rank: -1` fiindcă statusul real încă nu e cunoscut — orice status primit de la server va fi
 * strict mai nou, deci nimic nu e respins ca stale din greșeală.
 */
function adopt(state, turn, reason) {
  return {
    ...state,
    phase: WEB_CHAT_PHASES.RECOVERING,
    activeTurn: { turnId: turn.turnId, clientTurnId: turn.clientTurnId, rank: -1, sseOffered: false },
    progressStatus: null,
    recovery: { attempts: 0, reason },
    fault: null,
    diagnostics: diag(state, 'web_turn_recovery_total', { reason }),
  }
}

/**
 * Un snapshot care nu se potrivește nu se randează — dar nici nu are voie să lase turul agățat.
 * Dacă mai urmărim un turn, trecem în recovery (GET-ul e autoritatea). Dacă nu urmărim niciunul
 * (`no_active_turn`: rezultat sosit după reset/renewal), nu există ce recupera: doar îl numărăm.
 */
function recoverAfterMismatch(state, mismatch, kind) {
  const diagnostics = diag(state, 'web_turn_stale_event_total', { kind })
  if (mismatch === 'no_active_turn' || state.activeTurn === null) {
    return { ...state, diagnostics }
  }
  return {
    ...state,
    phase: WEB_CHAT_PHASES.RECOVERING,
    recovery: { attempts: 0, reason: RECOVERY_REASONS.CORRELATION_MISMATCH },
    diagnostics,
  }
}

// ── Reducerul ───────────────────────────────────────────────────────────────────────────────

/**
 * @param {any} state
 * @param {{type: string} & Record<string, any>} action
 * @returns {any}
 */
export function webChatReducer(state, action) {
  const P = WEB_CHAT_PHASES
  const A = WEB_CHAT_EVENTS

  switch (action.type) {
    case A.BOOTSTRAP_STARTED:
      return { ...state, phase: P.BOOTSTRAPPING, fault: null }

    case A.BOOTSTRAP_OK: {
      // Un record tehnic care pomenește un turn activ NU e o dovadă: e un indiciu care se
      // confirmă cu serverul. De aceea intrăm în `recovering`, nu direct în `waiting`.
      const resumed = action.resumeTurn
      // `?? state.shellCopy`: o sesiune restaurată dintr-un record fără copy nu are voie să
      // ȘTEARGĂ un copy deja obținut — ar lăsa shell-ul fără nume după un simplu remount.
      const shellCopy = action.shellCopy ?? state.shellCopy
      if (resumed) {
        return adopt(
          {
            ...state,
            session: action.session,
            shellCopy,
            conversationId: action.conversationId ?? null,
          },
          resumed,
          RECOVERY_REASONS.REFRESH,
        )
      }
      return {
        ...state,
        ...CLEARED_TURN,
        phase: P.READY,
        session: action.session,
        shellCopy,
        conversationId: action.conversationId ?? null,
        fault: null,
      }
    }

    case A.ADOPT:
      // Un turn pornit de alt tab. Adoptăm REFERINȚA opacă (id + client_turn_id) și trecem prin
      // `recovering`: adevărul vine de la server, nu de la celălalt tab.
      if (state.activeTurn !== null) return state
      return adopt(state, action.turn, action.reason)

    case A.BOOTSTRAP_FAILED:
      return {
        ...state,
        phase: P.UNAVAILABLE,
        fault: action.fault,
        diagnostics: diag(state, 'web_widget_bootstrap_total', { outcome: 'error' }),
      }

    case A.SUBMIT: {
      // Invariantul 2: numai `ready` pornește un turn. Orice altă fază înseamnă că guardul
      // sincron din controller a fost ocolit — se numără, nu se execută.
      if (!canSubmit(state)) {
        return {
          ...state,
          diagnostics: diag(state, 'web_turn_duplicate_submit_blocked_total', {
            source: action.source || 'unknown',
          }),
        }
      }
      return {
        ...state,
        phase: P.SUBMITTING,
        activeTurn: { turnId: null, clientTurnId: action.clientTurnId, rank: -1, sseOffered: false },
        progressStatus: null,
        sessionOutcome: null,
        fault: null,
        recovery: initialWebChatState.recovery,
      }
    }

    case A.ACCEPTED:
    case A.ATTACH: {
      const { turnId, clientTurnId, status, sseOffered } = action.status
      // La `ATTACH` (409 / cross-tab) adoptăm turul indicat de server: el e autoritatea, iar
      // `client_turn_id`-ul nostru nu a fost acceptat niciodată. La `ACCEPTED` corelația trebuie
      // să se potrivească — altfel serverul ne-a răspuns despre alt turn.
      if (action.type === A.ACCEPTED) {
        const mismatch = correlationMismatch(state, { turnId, clientTurnId })
        if (mismatch !== null) {
          // Respins ȘI recuperat. „Respins" singur ar însemna blocaj: efectul de accept s-a
          // consumat deja, nicio dependență nu se schimbă, iar composerul ar rămâne inactiv la
          // nesfârșit. Adevărul se cere de la server (matricea de race: „respins + refetch").
          return recoverAfterMismatch(state, mismatch, 'accept')
        }
      }
      const rank = TURN_STATUS_RANK[status]
      return {
        ...state,
        phase: P.WAITING,
        activeTurn: { turnId, clientTurnId, rank, sseOffered: sseOffered === true },
        progressStatus: isTerminalStatus(status) ? null : status,
        fault: null,
        recovery: initialWebChatState.recovery,
      }
    }

    case A.PROGRESS: {
      const { turnId, clientTurnId, status, sseOffered } = action.status
      const mismatch = correlationMismatch(state, { turnId, clientTurnId })
      if (mismatch !== null) {
        return { ...state, diagnostics: diag(state, 'web_turn_stale_event_total', { kind: 'status' }) }
      }
      const rank = TURN_STATUS_RANK[status]
      // Invariantul 4 pe lifecycle: un `working` sosit după `validating` nu dă ceasul înapoi.
      if (rank <= state.activeTurn.rank) {
        return { ...state, diagnostics: diag(state, 'web_turn_stale_event_total', { kind: 'status' }) }
      }
      return {
        ...state,
        phase: P.WAITING,
        activeTurn: {
          ...state.activeTurn,
          turnId,
          rank,
          sseOffered: sseOffered === true ? true : state.activeTurn.sseOffered,
        },
        progressStatus: status,
        fault: null,
        recovery: initialWebChatState.recovery,
      }
    }

    case A.TERMINAL: {
      const view = action.view
      const mismatch = correlationMismatch(state, {
        turnId: view.turn.id,
        clientTurnId: view.turn.client_turn_id,
        conversationId: view.conversation.id,
      })
      if (mismatch !== null) {
        // Invariantul 5: nu se randează, se raportează — și se REFETCHUIEȘTE.
        return recoverAfterMismatch(state, mismatch, 'result')
      }
      const { views, applied } = mergeView(state.views, view)
      if (!applied) {
        // Un terminal mai vechi pentru turul urmărit: nu îl aplicăm, dar nici nu rămânem blocați.
        return recoverAfterMismatch(state, 'stale_view', 'result')
      }
      // Invariantul 6: ABIA aici se deblochează, și numai pe un terminal valid.
      return {
        ...state,
        ...CLEARED_TURN,
        phase: P.READY,
        conversationId: view.conversation.id,
        views,
        fault: null,
      }
    }

    case A.REJECTED:
      // Refuz DOVEDIT înainte de accept (4xx structurat, 429, conflict de idempotency): turul nu
      // există pe server, deci deblocarea e corectă și nu poate produce o a doua execuție.
      return {
        ...state,
        ...CLEARED_TURN,
        phase: P.READY,
        fault: action.fault,
        diagnostics: diag(state, 'web_turn_submit_total', { outcome: 'rejected' }),
      }

    case A.UNKNOWN_OUTCOME:
    case A.DISCONNECTED: {
      if (state.activeTurn === null) return state
      const reason = action.reason
      return {
        ...state,
        phase: P.RECOVERING,
        recovery: { attempts: 0, reason },
        fault: null,
        diagnostics: diag(state, 'web_turn_recovery_total', { reason }),
      }
    }

    case A.RETRY_TICK:
      if (state.phase !== P.RECOVERING) return state
      return { ...state, recovery: { ...state.recovery, attempts: state.recovery.attempts + 1 } }

    case A.TURN_GONE:
      // Serverul spune că turul nu există pentru această sesiune (404). Nu-l mai urmărim; nu
      // pornim altul în locul lui.
      return {
        ...state,
        ...CLEARED_TURN,
        phase: P.READY,
        fault: action.fault ?? null,
        diagnostics: diag(state, 'web_turn_recovery_total', { reason: 'turn_gone' }),
      }

    case A.BUDGET_EXHAUSTED:
      // Bugetul de recovery s-a terminat. Turul rămâne al serverului și rămâne URMĂRIT: NU
      // deblocăm composerul și NU pornim un turn nou. UI-ul oferă doar reîncercare tehnică.
      return { ...state, phase: P.UNAVAILABLE, fault: action.fault }

    case A.SESSION_EXPIRED:
      return { ...state, phase: P.RENEWING, fault: null }

    case A.SESSION_RENEWED:
      // Backendul nu are lineage de sesiune (NX-229): singurul outcome posibil e `new_session`.
      // Corelația veche se curăță ATOMIC — nu se cere niciodată vechiul `conversation_id` sub
      // sesiunea nouă și nu se păstrează niciun view din conversația anterioară.
      return {
        ...state,
        ...CLEARED_TURN,
        phase: P.READY,
        session: action.session,
        // Copy-ul vine din bootstrapul NOU (sesiunea nouă poate fi pe alt locale); dacă serverul
        // nu l-a trimis, îl păstrăm pe cel curent în loc să rămânem cu un shell fără nume.
        shellCopy: action.shellCopy ?? state.shellCopy,
        conversationId: null,
        views: [],
        sessionOutcome: 'new_session',
        fault: null,
        diagnostics: diag(state, 'web_widget_session_transition_total', { outcome: 'new_session' }),
      }

    case A.FATAL:
      return { ...state, phase: P.UNAVAILABLE, fault: action.fault }

    case A.RETRY:
      // Reîncercare TEHNICĂ: reia exact ce urmărea, fără ID nou.
      if (state.activeTurn !== null) {
        return {
          ...state,
          phase: P.RECOVERING,
          recovery: { attempts: 0, reason: state.recovery.reason || RECOVERY_REASONS.RESPONSE_LOST },
          fault: null,
        }
      }
      return { ...state, phase: state.session === null ? P.BOOTSTRAPPING : P.READY, fault: null }

    case A.RESET:
      // „Conversație nouă": permis DOAR fără turn activ (guardul e în controller + UI).
      // Copy-ul de shell SUPRAVIEȚUIEȘTE: e rama, nu conversația. Aruncarea lui ar lăsa widgetul
      // fără titlu și fără placeholder exact în secunda de după apăsarea butonului.
      if (state.activeTurn !== null) return state
      return {
        ...initialWebChatState,
        phase: P.BOOTSTRAPPING,
        shellCopy: state.shellCopy,
        diagnostics: state.diagnostics,
      }

    case 'diagnostics_drained':
      return state.diagnostics.length === 0 ? state : { ...state, diagnostics: [] }

    default:
      return state
  }
}
