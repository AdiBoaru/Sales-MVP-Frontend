// NX-243 — invarianții mașinii de stare, verificați unul câte unul pe reducerul PUR.
//
// Fiecare bloc de mai jos corespunde unui rând din matricea de race a cardului. Reducerul e locul
// unde se poate demonstra că un rezultat vechi nu poate regresa transcriptul și că deblocarea nu
// se întâmplă decât pe un terminal valid — fără rețea, fără timere, fără flakiness.

import { describe, expect, it } from 'vitest'
import validViews from './fixtures/web-v2/valid_views.json'
import {
  RECOVERY_REASONS,
  WEB_CHAT_EVENTS as A,
  WEB_CHAT_PHASES as P,
  canSubmit,
  correlationMismatch,
  initialWebChatState,
  latestView,
  webChatReducer as reduce,
} from '@/chat/state/webChatReducer.js'

const SESSION = { token: 't', visitor_id: 'v', sig: 's' }
const CLIENT_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

const run = (state, ...actions) => actions.reduce(reduce, state)

const ready = () =>
  reduce(initialWebChatState, { type: A.BOOTSTRAP_OK, session: SESSION, resumeTurn: null })

const status = (overrides = {}) => ({
  turnId: 'turn_1',
  clientTurnId: CLIENT_ID,
  status: 'accepted',
  pollAfterMs: 1000,
  sseOffered: false,
  ...overrides,
})

/** Un view terminal corelat cu turul urmărit. Fixturile reale poartă alte id-uri. */
const terminalView = (overrides = {}) => ({
  ...validViews.recommendation,
  conversation: { id: 'conv_1', revision: 5, ...(overrides.conversation || {}) },
  turn: { id: 'turn_1', client_turn_id: CLIENT_ID, status: 'completed', ...(overrides.turn || {}) },
})

describe('bootstrap', () => {
  it('fără turn activ → ready', () => {
    const state = ready()
    expect(state.phase).toBe(P.READY)
    expect(canSubmit(state)).toBe(true)
  })

  it('cu turn activ în record → RECOVERING, nu waiting: referința se confirmă cu serverul', () => {
    const state = reduce(initialWebChatState, {
      type: A.BOOTSTRAP_OK,
      session: SESSION,
      conversationId: 'conv_1',
      resumeTurn: { turnId: 'turn_1', clientTurnId: CLIENT_ID },
    })
    expect(state.phase).toBe(P.RECOVERING)
    expect(state.activeTurn).toEqual({ turnId: 'turn_1', clientTurnId: CLIENT_ID, rank: -1, sseOffered: false })
    expect(canSubmit(state)).toBe(false)
    expect(state.diagnostics).toContainEqual({
      name: 'web_turn_recovery_total',
      labels: { reason: RECOVERY_REASONS.REFRESH },
    })
  })

  it('eșecul de bootstrap e `unavailable`, nu „ready fără sesiune"', () => {
    const state = reduce(initialWebChatState, { type: A.BOOTSTRAP_FAILED, fault: { code: 'network' } })
    expect(state.phase).toBe(P.UNAVAILABLE)
    expect(canSubmit(state)).toBe(false)
  })
})

describe('invariantul 2 — numai `ready` pornește un turn', () => {
  it.each([
    ['uninitialized', initialWebChatState],
    ['submitting', run(ready(), { type: A.SUBMIT, clientTurnId: CLIENT_ID })],
    ['waiting', run(ready(), { type: A.SUBMIT, clientTurnId: CLIENT_ID }, { type: A.ACCEPTED, status: status() })],
  ])('din %s, SUBMIT e refuzat și numărat', (_label, state) => {
    const next = reduce(state, { type: A.SUBMIT, clientTurnId: 'alt-id', source: 'click' })
    expect(next.phase).toBe(state.phase)
    expect(next.activeTurn).toEqual(state.activeTurn)
    expect(next.diagnostics.at(-1)).toEqual({
      name: 'web_turn_duplicate_submit_blocked_total',
      labels: { source: 'click' },
    })
  })

  it('dublu SUBMIT nu produce niciodată două turnuri active', () => {
    const state = run(
      ready(),
      { type: A.SUBMIT, clientTurnId: CLIENT_ID, source: 'enter' },
      { type: A.SUBMIT, clientTurnId: 'al-doilea', source: 'click' },
    )
    expect(state.activeTurn.clientTurnId).toBe(CLIENT_ID)
  })
})

describe('invariantul 3 — `clientTurnId` nu se schimbă până la terminal', () => {
  it('rămâne același prin accept, progres, deconectare și recovery', () => {
    let state = run(
      ready(),
      { type: A.SUBMIT, clientTurnId: CLIENT_ID },
      { type: A.ACCEPTED, status: status() },
      { type: A.PROGRESS, status: status({ status: 'working' }) },
      { type: A.DISCONNECTED, reason: RECOVERY_REASONS.SSE_DISCONNECT },
      { type: A.RETRY_TICK },
    )
    expect(state.activeTurn.clientTurnId).toBe(CLIENT_ID)
    state = reduce(state, { type: A.TERMINAL, view: terminalView() })
    expect(state.activeTurn).toBeNull()
  })
})

describe('invariantul 4 — un snapshot vechi nu îl înlocuiește pe unul nou', () => {
  it('un `working` sosit după `validating` e ignorat', () => {
    const state = run(
      ready(),
      { type: A.SUBMIT, clientTurnId: CLIENT_ID },
      { type: A.ACCEPTED, status: status() },
      { type: A.PROGRESS, status: status({ status: 'validating' }) },
    )
    const stale = reduce(state, { type: A.PROGRESS, status: status({ status: 'working' }) })
    expect(stale.progressStatus).toBe('validating')
    expect(stale.diagnostics.at(-1)).toEqual({
      name: 'web_turn_stale_event_total',
      labels: { kind: 'status' },
    })
  })

  it('un view cu revizie mai mică nu rescrie unul deja aplicat', () => {
    let state = run(
      ready(),
      { type: A.SUBMIT, clientTurnId: CLIENT_ID },
      { type: A.ACCEPTED, status: status() },
      { type: A.TERMINAL, view: terminalView({ conversation: { id: 'conv_1', revision: 9 } }) },
    )
    expect(latestView(state).conversation.revision).toBe(9)

    // Același turn, revizie mai veche (SSE reluat, răspuns întârziat) — se ignoră.
    state = run(
      state,
      { type: A.SUBMIT, clientTurnId: 'c2' },
      { type: A.ACCEPTED, status: status({ clientTurnId: 'c2' }) },
      {
        type: A.TERMINAL,
        view: terminalView({ conversation: { id: 'conv_1', revision: 3 }, turn: { client_turn_id: 'c2' } }),
      },
    )
    expect(state.views).toHaveLength(1)
    expect(latestView(state).conversation.revision).toBe(9)
  })

  it('turnuri diferite se ADAUGĂ, nu se suprascriu', () => {
    let state = run(
      ready(),
      { type: A.SUBMIT, clientTurnId: CLIENT_ID },
      { type: A.ACCEPTED, status: status() },
      { type: A.TERMINAL, view: terminalView() },
    )
    state = run(
      state,
      { type: A.SUBMIT, clientTurnId: 'c2' },
      { type: A.ACCEPTED, status: status({ turnId: 'turn_2', clientTurnId: 'c2' }) },
      {
        type: A.TERMINAL,
        view: terminalView({
          conversation: { id: 'conv_1', revision: 6 },
          turn: { id: 'turn_2', client_turn_id: 'c2' },
        }),
      },
    )
    expect(state.views.map((v) => v.turn.id)).toEqual(['turn_1', 'turn_2'])
  })
})

describe('invariantul 5 — corelația', () => {
  const waiting = () =>
    run(ready(), { type: A.SUBMIT, clientTurnId: CLIENT_ID }, { type: A.ACCEPTED, status: status() })

  // Respins ȘI recuperat: „doar respins" ar fi un blocaj — efectul care aștepta s-a consumat
  // deja, deci nimic nu ar mai cere adevărul, iar composerul ar rămâne inactiv pentru totdeauna.
  it.each([
    ['alt turn.id', terminalView({ turn: { id: 'turn_x' } })],
    ['alt client_turn_id', terminalView({ turn: { client_turn_id: 'alt' } })],
  ])('respinge un rezultat cu %s, NU îl randează și cere refetch', (_label, view) => {
    const state = waiting()
    const next = reduce(state, { type: A.TERMINAL, view })
    expect(next.views).toHaveLength(0)
    expect(next.phase).toBe(P.RECOVERING)
    expect(next.recovery.reason).toBe(RECOVERY_REASONS.CORRELATION_MISMATCH)
    expect(next.activeTurn).toEqual(state.activeTurn) // tot turul nostru, cu același ID
    expect(canSubmit(next)).toBe(false)
    expect(next.diagnostics.at(-1)).toEqual({
      name: 'web_turn_stale_event_total',
      labels: { kind: 'result' },
    })
  })

  it('respinge un rezultat din altă conversație și cere refetch', () => {
    let state = run(waiting(), { type: A.TERMINAL, view: terminalView() })
    expect(state.conversationId).toBe('conv_1')
    state = run(state, { type: A.SUBMIT, clientTurnId: 'c2' }, { type: A.ACCEPTED, status: status({ clientTurnId: 'c2' }) })
    const next = reduce(state, {
      type: A.TERMINAL,
      view: terminalView({ conversation: { id: 'conv_ALTA', revision: 7 }, turn: { client_turn_id: 'c2' } }),
    })
    expect(next.phase).toBe(P.RECOVERING)
    expect(next.views).toHaveLength(1)
  })

  it('un terminal mai VECHI pentru turul urmărit nu regresează view-ul și nu blochează', () => {
    const state = run(
      waiting(),
      { type: A.TERMINAL, view: terminalView({ conversation: { id: 'conv_1', revision: 9 } }) },
      { type: A.SUBMIT, clientTurnId: 'c2' },
      { type: A.ACCEPTED, status: status({ turnId: 'turn_1', clientTurnId: 'c2' }) },
    )
    const next = reduce(state, {
      type: A.TERMINAL,
      view: terminalView({ conversation: { id: 'conv_1', revision: 2 }, turn: { client_turn_id: 'c2' } }),
    })
    expect(latestView(next).conversation.revision).toBe(9)
    expect(next.phase).toBe(P.RECOVERING)
  })

  it('un rezultat fără turn activ (după reset/renewal) e stale, nu „mesaj nou"', () => {
    const state = ready()
    expect(correlationMismatch(state, { turnId: 't', clientTurnId: 'c' })).toBe('no_active_turn')
    const next = reduce(state, { type: A.TERMINAL, view: terminalView() })
    expect(next.views).toHaveLength(0)
  })

  it('ACCEPTED despre alt turn nu deturnează turul curent, dar nici nu îl agață', () => {
    const state = run(ready(), { type: A.SUBMIT, clientTurnId: CLIENT_ID })
    const next = reduce(state, { type: A.ACCEPTED, status: status({ clientTurnId: 'strain' }) })
    expect(next.activeTurn.clientTurnId).toBe(CLIENT_ID)
    expect(next.phase).toBe(P.RECOVERING)
    expect(next.diagnostics.at(-1)).toEqual({
      name: 'web_turn_stale_event_total',
      labels: { kind: 'accept' },
    })
  })
})

describe('invariantul 6 — deblocarea', () => {
  it('un terminal valid deblochează', () => {
    const state = run(
      ready(),
      { type: A.SUBMIT, clientTurnId: CLIENT_ID },
      { type: A.ACCEPTED, status: status() },
      { type: A.TERMINAL, view: terminalView() },
    )
    expect(state.phase).toBe(P.READY)
    expect(canSubmit(state)).toBe(true)
    expect(state.activeTurn).toBeNull()
  })

  it('un refuz DOVEDIT înainte de accept deblochează (turul nu există pe server)', () => {
    const state = run(
      ready(),
      { type: A.SUBMIT, clientTurnId: CLIENT_ID },
      { type: A.REJECTED, fault: { code: 'rejected', serverCode: 'schema_invalid' } },
    )
    expect(state.phase).toBe(P.READY)
    expect(state.activeTurn).toBeNull()
    expect(state.fault.serverCode).toBe('schema_invalid')
  })

  it('un outcome NECUNOSCUT nu deblochează — trece în recovery', () => {
    const state = run(
      ready(),
      { type: A.SUBMIT, clientTurnId: CLIENT_ID },
      { type: A.UNKNOWN_OUTCOME, reason: RECOVERY_REASONS.RESPONSE_LOST },
    )
    expect(state.phase).toBe(P.RECOVERING)
    expect(canSubmit(state)).toBe(false)
    expect(state.activeTurn.clientTurnId).toBe(CLIENT_ID)
  })

  it('bugetul epuizat NU deblochează: `unavailable` păstrează turul urmărit', () => {
    const state = run(
      ready(),
      { type: A.SUBMIT, clientTurnId: CLIENT_ID },
      { type: A.UNKNOWN_OUTCOME, reason: RECOVERY_REASONS.RESPONSE_LOST },
      { type: A.BUDGET_EXHAUSTED, fault: { code: 'network', retryable: true } },
    )
    expect(state.phase).toBe(P.UNAVAILABLE)
    expect(canSubmit(state)).toBe(false)
    expect(state.activeTurn).not.toBeNull()
  })

  it('RETRY din `unavailable` reia ACELAȘI turn, fără ID nou', () => {
    const state = run(
      ready(),
      { type: A.SUBMIT, clientTurnId: CLIENT_ID },
      { type: A.UNKNOWN_OUTCOME, reason: RECOVERY_REASONS.RESPONSE_LOST },
      { type: A.BUDGET_EXHAUSTED, fault: { code: 'network' } },
      { type: A.RETRY },
    )
    expect(state.phase).toBe(P.RECOVERING)
    expect(state.activeTurn.clientTurnId).toBe(CLIENT_ID)
    expect(state.recovery.attempts).toBe(0)
  })
})

describe('409 activ / cross-tab', () => {
  it('ATTACH adoptă turnul indicat de server, chiar cu alt client_turn_id', () => {
    const state = run(
      ready(),
      { type: A.SUBMIT, clientTurnId: CLIENT_ID },
      { type: A.ATTACH, status: status({ turnId: 'turn_altul', clientTurnId: 'client_altul', status: 'working' }) },
    )
    expect(state.phase).toBe(P.WAITING)
    expect(state.activeTurn).toEqual({
      turnId: 'turn_altul',
      clientTurnId: 'client_altul',
      rank: 1,
      sseOffered: false,
    })
  })

  it('ADOPT preia o referință opacă de la alt tab și o CONFIRMĂ prin recovery', () => {
    const state = reduce(ready(), {
      type: A.ADOPT,
      turn: { turnId: 'turn_altul', clientTurnId: 'client_altul' },
      reason: RECOVERY_REASONS.ACTIVE_TURN_UNKNOWN,
    })
    expect(state.phase).toBe(P.RECOVERING)
    expect(state.activeTurn.rank).toBe(-1)
  })

  it('ADOPT nu poate deturna un turn deja urmărit', () => {
    const state = run(ready(), { type: A.SUBMIT, clientTurnId: CLIENT_ID })
    const next = reduce(state, {
      type: A.ADOPT,
      turn: { turnId: 'x', clientTurnId: 'y' },
      reason: RECOVERY_REASONS.ACTIVE_TURN_UNKNOWN,
    })
    expect(next.activeTurn.clientTurnId).toBe(CLIENT_ID)
  })

  it('după ADOPT, statusul serverului e acceptat (rangul -1 nu respinge nimic)', () => {
    const state = run(
      ready(),
      { type: A.ADOPT, turn: { turnId: 'turn_1', clientTurnId: CLIENT_ID }, reason: 'x' },
      { type: A.PROGRESS, status: status({ status: 'accepted' }) },
    )
    expect(state.phase).toBe(P.WAITING)
    expect(state.progressStatus).toBe('accepted')
  })
})

describe('sesiune expirată fără lineage', () => {
  it('SESSION_RENEWED curăță ATOMIC conversația, turul și toate view-urile', () => {
    let state = run(
      ready(),
      { type: A.SUBMIT, clientTurnId: CLIENT_ID },
      { type: A.ACCEPTED, status: status() },
      { type: A.TERMINAL, view: terminalView() },
      { type: A.SUBMIT, clientTurnId: 'c2' },
      { type: A.SESSION_EXPIRED },
    )
    expect(state.phase).toBe(P.RENEWING)

    state = reduce(state, { type: A.SESSION_RENEWED, session: { token: 't', visitor_id: 'v2', sig: 's2' } })
    expect(state.phase).toBe(P.READY)
    expect(state.conversationId).toBeNull()
    expect(state.activeTurn).toBeNull()
    expect(state.views).toEqual([]) // istoricul vechi nu se atașează sesiunii noi
    expect(state.sessionOutcome).toBe('new_session')
    expect(state.diagnostics.at(-1)).toEqual({
      name: 'web_widget_session_transition_total',
      labels: { outcome: 'new_session' },
    })
  })

  it('un rezultat al conversației vechi nu mai poate fi randat după new_session', () => {
    const state = run(
      ready(),
      { type: A.SUBMIT, clientTurnId: CLIENT_ID },
      { type: A.ACCEPTED, status: status() },
      { type: A.SESSION_EXPIRED },
      { type: A.SESSION_RENEWED, session: { token: 't', visitor_id: 'v2', sig: 's2' } },
      { type: A.TERMINAL, view: terminalView() },
    )
    expect(state.views).toHaveLength(0)
  })
})

describe('turn dispărut și reset', () => {
  it('TURN_GONE (404) oprește urmărirea fără să pornească altceva', () => {
    const state = run(
      ready(),
      { type: A.SUBMIT, clientTurnId: CLIENT_ID },
      { type: A.ACCEPTED, status: status() },
      { type: A.TURN_GONE, fault: { code: 'not_found' } },
    )
    expect(state.phase).toBe(P.READY)
    expect(state.activeTurn).toBeNull()
  })

  it('RESET e IGNORAT cât timp există un turn activ', () => {
    const state = run(
      ready(),
      { type: A.SUBMIT, clientTurnId: CLIENT_ID },
      { type: A.ACCEPTED, status: status() },
    )
    expect(reduce(state, { type: A.RESET })).toBe(state)
  })

  it('RESET fără turn activ repornește bootstrapul', () => {
    const state = reduce(ready(), { type: A.RESET })
    expect(state.phase).toBe(P.BOOTSTRAPPING)
    expect(state.session).toBeNull()
    expect(state.views).toEqual([])
  })
})

describe('puritate', () => {
  it('nu mută starea inițială și nu o mutează niciodată', () => {
    const before = JSON.stringify(initialWebChatState)
    run(
      ready(),
      { type: A.SUBMIT, clientTurnId: CLIENT_ID },
      { type: A.ACCEPTED, status: status() },
      { type: A.TERMINAL, view: terminalView() },
    )
    expect(JSON.stringify(initialWebChatState)).toBe(before)
  })

  it('o acțiune necunoscută întoarce exact aceeași stare', () => {
    const state = ready()
    expect(reduce(state, { type: 'nu_exista' })).toBe(state)
  })

  it('diagnosticele sunt mărginite', () => {
    let state = ready()
    for (let i = 0; i < 50; i += 1) {
      state = reduce(state, { type: A.SUBMIT, clientTurnId: 'x', source: 'click' })
      state = { ...state, phase: P.READY, activeTurn: null }
    }
    expect(state.diagnostics.length).toBeLessThanOrEqual(20)
  })
})
