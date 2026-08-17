// NX-243 — testele de contract ale transportului v2.
//
// Ce verifică: exact forma pe care o vorbește backendul real (`src/web/app.py`, NX-232/233) —
// query string-ul de sesiune, body-ul `web-turn.v2`, cele patru rezultate ale acceptului
// (202/200/409/4xx), decodarea strictă a statusului și faptul că un URL din payload nu devine
// niciodată ținta unui request.

import { describe, expect, it, vi } from 'vitest'
import validViews from './fixtures/web-v2/valid_views.json'
import {
  TURN_STATUS_RANK,
  createWebTurnTransport,
  decodeSseStatus,
  decodeTurnStatus,
  isTerminalStatus,
} from '@/chat/transport/webTurnTransport.js'
import { WEB_TURN_ERROR_CODES, WebTurnTransportError } from '@/chat/transport/webTurnErrors.js'

const SESSION = { token: 'pub_tok', visitor_id: 'web_abc', sig: 'v2.claims.mac' }
const CLIENT_TURN_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

function statusPayload(overrides = {}) {
  return {
    schema_version: 'web-turn-status.v2',
    turn: { id: 'opq_turn_1', client_turn_id: CLIENT_TURN_ID, status: 'accepted' },
    status_url: '/web/v2/turns/opq_turn_1',
    poll_after_ms: 1000,
    ...overrides,
  }
}

function jsonResponse(status, body, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  }
}

function makeTransport(handler, config = {}) {
  const calls = []
  const fetchImpl = vi.fn(async (url, init) => {
    calls.push({ url, init })
    return handler(url, init, calls.length)
  })
  const transport = createWebTurnTransport({
    apiBase: 'https://bot.example.invalid',
    publicToken: 'pub_tok',
    fetchImpl,
    ...config,
  })
  return { transport, calls, fetchImpl }
}

describe('decodeTurnStatus — validare, nu reparare', () => {
  it('acceptă payloadul canonic și expune numai ce e folosibil', () => {
    const status = decodeTurnStatus(statusPayload({ events_url: '/web/v2/turns/opq_turn_1/events' }))
    expect(status).toEqual({
      turnId: 'opq_turn_1',
      clientTurnId: CLIENT_TURN_ID,
      status: 'accepted',
      pollAfterMs: 1000,
      sseOffered: true,
    })
    // `status_url` nu iese din decoder: nimeni nu trebuie să poată folosi un URL din payload.
    expect(status).not.toHaveProperty('statusUrl')
  })

  it('fără `events_url` nu pretinde că SSE există', () => {
    expect(decodeTurnStatus(statusPayload()).sseOffered).toBe(false)
  })

  it.each([
    ['alt schema_version', statusPayload({ schema_version: 'web-turn-status.v1' })],
    ['câmp necunoscut', { ...statusPayload(), surprise: 1 }],
    ['câmp necunoscut în turn', {
      ...statusPayload(),
      turn: { id: 'a', client_turn_id: 'b', status: 'working', extra: 1 },
    }],
    ['status din afara enumului', {
      ...statusPayload(),
      turn: { id: 'a', client_turn_id: 'b', status: 'running' },
    }],
    ['poll_after_ms negativ', statusPayload({ poll_after_ms: -1 })],
    ['poll_after_ms ne-întreg', statusPayload({ poll_after_ms: 1.5 })],
    ['nu e obiect', 'web-turn-status.v2'],
  ])('respinge %s', (_label, payload) => {
    expect(() => decodeTurnStatus(payload)).toThrow(WebTurnTransportError)
    try {
      decodeTurnStatus(payload)
    } catch (err) {
      expect(err.code).toBe(WEB_TURN_ERROR_CODES.CONTRACT)
    }
  })

  it('`running` nu ajunge niciodată pe sârmă — proiecția backendului îl ascunde', () => {
    expect(TURN_STATUS_RANK).not.toHaveProperty('running')
  })

  it('rangul oglindește STATUS_ORDINAL: terminalele împart poziția finală', () => {
    expect(TURN_STATUS_RANK.accepted).toBeLessThan(TURN_STATUS_RANK.working)
    expect(TURN_STATUS_RANK.working).toBeLessThan(TURN_STATUS_RANK.validating)
    expect(TURN_STATUS_RANK.completed).toBe(TURN_STATUS_RANK.failed)
    expect(TURN_STATUS_RANK.failed).toBe(TURN_STATUS_RANK.cancelled)
    expect(['completed', 'failed', 'cancelled'].every(isTerminalStatus)).toBe(true)
    expect(isTerminalStatus('working')).toBe(false)
  })
})

describe('decodeSseStatus — alt contract decât payloadul 202', () => {
  it('acceptă frame-ul real, care are DOAR `turn`', () => {
    expect(decodeSseStatus({ turn: { id: 't', client_turn_id: 'c', status: 'validating' } })).toEqual({
      turnId: 't',
      clientTurnId: 'c',
      status: 'validating',
      pollAfterMs: null,
      sseOffered: true,
    })
  })

  it('payloadul 202 NU e un frame SSE valid (și invers) — două contracte, nu unul', () => {
    expect(() => decodeSseStatus(statusPayload())).toThrow(WebTurnTransportError)
    expect(() => decodeTurnStatus({ turn: { id: 't', client_turn_id: 'c', status: 'working' } })).toThrow(
      WebTurnTransportError,
    )
  })

  it.each([
    ['status necunoscut', { turn: { id: 't', client_turn_id: 'c', status: 'running' } }],
    ['câmp în plus', { turn: { id: 't', client_turn_id: 'c', status: 'working' }, extra: 1 }],
    ['fără turn', {}],
  ])('respinge %s', (_label, payload) => {
    expect(() => decodeSseStatus(payload)).toThrow(WebTurnTransportError)
  })
})

describe('bootstrap', () => {
  it('cere tokenul public și întoarce handle-ul opac', async () => {
    const { transport, calls } = makeTransport(() =>
      jsonResponse(200, { token: 'pub_tok', visitor_id: 'web_x', sig: 'v2.a.b', sse_url: '/web/stream' }),
    )
    const session = await transport.bootstrap({})
    expect(calls[0].url).toBe('https://bot.example.invalid/web/bootstrap?token=pub_tok')
    expect(session).toEqual({ token: 'pub_tok', visitor_id: 'web_x', sig: 'v2.a.b' })
  })

  it('un bootstrap fără semnătură e eroare de contract, nu o sesiune pe jumătate', async () => {
    const { transport } = makeTransport(() => jsonResponse(200, { token: 'a', visitor_id: 'b' }))
    await expect(transport.bootstrap({})).rejects.toMatchObject({
      code: WEB_TURN_ERROR_CODES.CONTRACT,
    })
  })
})

describe('createTurn', () => {
  it('trimite exact contractul web-turn.v2 și autentifică prin query string', async () => {
    const { transport, calls } = makeTransport(() => jsonResponse(202, statusPayload()))
    const result = await transport.createTurn({
      session: SESSION,
      clientTurnId: CLIENT_TURN_ID,
      input: { type: 'text', text: 'ce cremă îmi recomanzi?' },
    })

    expect(result.outcome).toBe('accepted')
    expect(result.status.turnId).toBe('opq_turn_1')

    const { url, init } = calls[0]
    expect(url).toBe(
      'https://bot.example.invalid/web/v2/turns?token=pub_tok&visitor_id=web_abc&sig=v2.claims.mac',
    )
    expect(init.method).toBe('POST')
    // Body-ul e EXACT contractul: `extra="forbid"` pe server respinge orice câmp în plus, iar un
    // body diferit ar schimba fingerprintul de idempotency și ar rupe replay-ul.
    expect(JSON.parse(init.body)).toEqual({
      schema_version: 'web-turn.v2',
      client_turn_id: CLIENT_TURN_ID,
      input: { type: 'text', text: 'ce cremă îmi recomanzi?' },
    })
  })

  it('câmpurile opționale lipsesc, nu sunt `null`', async () => {
    const { transport, calls } = makeTransport(() => jsonResponse(202, statusPayload()))
    await transport.createTurn({
      session: SESSION,
      clientTurnId: CLIENT_TURN_ID,
      input: { type: 'text', text: 'x' },
      context: undefined,
      idToken: undefined,
    })
    const body = JSON.parse(calls[0].init.body)
    expect(body).not.toHaveProperty('context')
    expect(body).not.toHaveProperty('id_token')
  })

  it('acțiunea opacă traversează transportul BYTE-IDENTIC', async () => {
    const { transport, calls } = makeTransport(() => jsonResponse(202, statusPayload()))
    const token = 'opq.tok.add.pv1'
    await transport.createTurn({
      session: SESSION,
      clientTurnId: CLIENT_TURN_ID,
      input: { type: 'action', action_token: token },
    })
    const body = JSON.parse(calls[0].init.body)
    expect(body.input).toEqual({ type: 'action', action_token: token })
    // Tokenul nu e citit, decodat, prescurtat sau transformat în text.
    expect(body.input.action_token).toBe(token)
    expect(body).not.toHaveProperty('message')
  })

  it('200 = replay al aceluiași client_turn_id → view decodat prin NX-242', async () => {
    const { transport } = makeTransport(() => jsonResponse(200, validViews.recommendation))
    const result = await transport.createTurn({
      session: SESSION,
      clientTurnId: validViews.recommendation.turn.client_turn_id,
      input: { type: 'text', text: 'x' },
    })
    expect(result.outcome).toBe('terminal')
    expect(result.view).toBe(validViews.recommendation) // aceeași referință: zero normalizare
  })

  it('un view care nu trece contractul NU iese din transport', async () => {
    const broken = { ...validViews.recommendation, conversation: { id: 'x' } } // fără `revision`
    const { transport } = makeTransport(() => jsonResponse(200, broken))
    await expect(
      transport.createTurn({ session: SESSION, clientTurnId: CLIENT_TURN_ID, input: { type: 'text', text: 'x' } }),
    ).rejects.toMatchObject({ code: WEB_TURN_ERROR_CODES.CONTRACT })
  })

  it('409 conversation_turn_in_progress: ne atașăm la turnul indicat de server', async () => {
    const active = statusPayload({
      turn: { id: 'opq_turn_other', client_turn_id: 'other-client-id', status: 'working' },
    })
    const { transport } = makeTransport(() =>
      jsonResponse(409, {
        error: { code: 'conversation_turn_in_progress', message: 'conversația are deja un turn activ' },
        active_turn: active,
      }),
    )
    const result = await transport.createTurn({
      session: SESSION,
      clientTurnId: CLIENT_TURN_ID,
      input: { type: 'text', text: 'x' },
    })
    expect(result.outcome).toBe('active_turn')
    expect(result.status.turnId).toBe('opq_turn_other')
  })

  it('409 fără referință: nu inventăm un turn', async () => {
    const { transport } = makeTransport(() =>
      jsonResponse(409, { error: { code: 'conversation_turn_in_progress', message: 'x' } }),
    )
    const result = await transport.createTurn({
      session: SESSION,
      clientTurnId: CLIENT_TURN_ID,
      input: { type: 'text', text: 'x' },
    })
    expect(result).toEqual({ outcome: 'active_turn', status: null })
  })

  it('409 idempotency_conflict e o eroare distinctă (același ID, alt conținut)', async () => {
    const { transport } = makeTransport(() =>
      jsonResponse(409, { error: { code: 'idempotency_conflict', message: 'același ID cu alt conținut' } }),
    )
    await expect(
      transport.createTurn({ session: SESSION, clientTurnId: CLIENT_TURN_ID, input: { type: 'text', text: 'x' } }),
    ).rejects.toMatchObject({ code: WEB_TURN_ERROR_CODES.IDEMPOTENCY_CONFLICT })
  })

  it.each([
    [403, WEB_TURN_ERROR_CODES.SESSION_EXPIRED],
    [401, WEB_TURN_ERROR_CODES.UNAUTHORIZED],
    [429, WEB_TURN_ERROR_CODES.RATE_LIMITED],
    [500, WEB_TURN_ERROR_CODES.SERVER],
    [404, WEB_TURN_ERROR_CODES.UNSUPPORTED],
  ])('HTTP %i → %s', async (status, code) => {
    const { transport } = makeTransport(() => jsonResponse(status, { detail: 'x' }))
    await expect(
      transport.createTurn({ session: SESSION, clientTurnId: CLIENT_TURN_ID, input: { type: 'text', text: 'x' } }),
    ).rejects.toMatchObject({ code })
  })

  it('`detail` de la HTTPException nu devine copy pentru cumpărător', async () => {
    const { transport } = makeTransport(() => jsonResponse(429, { detail: 'rate limited' }))
    const error = await transport
      .createTurn({ session: SESSION, clientTurnId: CLIENT_TURN_ID, input: { type: 'text', text: 'x' } })
      .catch((err) => err)
    expect(error.serverMessage).toBeNull()
  })

  it('429 respectă `Retry-After`', async () => {
    const { transport } = makeTransport(() =>
      jsonResponse(429, { detail: 'rate limited' }, { 'retry-after': '3' }),
    )
    const error = await transport
      .createTurn({ session: SESSION, clientTurnId: CLIENT_TURN_ID, input: { type: 'text', text: 'x' } })
      .catch((err) => err)
    expect(error.retryAfterMs).toBe(3000)
  })

  it('eroarea structurată păstrează codul stabil + copy-ul SERVER-OWNED', async () => {
    const { transport } = makeTransport(() =>
      jsonResponse(410, { error: { code: 'action_expired', message: 'Butonul a expirat.', retryable: true } }),
    )
    const error = await transport
      .createTurn({ session: SESSION, clientTurnId: CLIENT_TURN_ID, input: { type: 'action', action_token: 't' } })
      .catch((err) => err)
    expect(error.code).toBe(WEB_TURN_ERROR_CODES.REJECTED)
    expect(error.serverCode).toBe('action_expired')
    expect(error.serverMessage).toBe('Butonul a expirat.')
    expect(error.retryable).toBe(true)
  })

  it('timeoutul e „outcome necunoscut", nu „turn eșuat"', async () => {
    const { transport } = makeTransport(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const err = new Error('aborted')
            err.name = 'AbortError'
            reject(err)
          })
        }),
    )
    const error = await transport
      .createTurn({
        session: SESSION,
        clientTurnId: CLIENT_TURN_ID,
        input: { type: 'text', text: 'x' },
        timeoutMs: 5,
      })
      .catch((err) => err)
    expect(error.code).toBe(WEB_TURN_ERROR_CODES.TIMEOUT)
    expect(error.unknownOutcome).toBe(true)
  })

  it('anularea deliberată NU e outcome necunoscut', async () => {
    const controller = new AbortController()
    const { transport } = makeTransport(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const err = new Error('aborted')
            err.name = 'AbortError'
            reject(err)
          })
        }),
    )
    const promise = transport.createTurn({
      session: SESSION,
      clientTurnId: CLIENT_TURN_ID,
      input: { type: 'text', text: 'x' },
      signal: controller.signal,
    })
    controller.abort()
    const error = await promise.catch((err) => err)
    expect(error.code).toBe(WEB_TURN_ERROR_CODES.ABORTED)
    expect(error.unknownOutcome).toBe(false)
  })
})

describe('getTurn', () => {
  it('construiește URL-ul din apiBase, NU din `status_url`-ul primit', async () => {
    // Payloadul precedent conține un `status_url` ostil; nu are voie să devină ținta requestului.
    const { transport, calls } = makeTransport(() => jsonResponse(202, statusPayload({
      status_url: 'https://evil.example.invalid/steal',
    })))
    await transport.getTurn({ session: SESSION, turnId: 'opq turn/../x' })
    expect(calls[0].url).toBe(
      'https://bot.example.invalid/web/v2/turns/opq%20turn%2F..%2Fx?token=pub_tok&visitor_id=web_abc&sig=v2.claims.mac',
    )
    expect(calls[0].url).not.toContain('evil.example.invalid')
  })

  it('404 = inexistent SAU al altei sesiuni — aceeași reacție, fără oracol', async () => {
    const { transport } = makeTransport(() => jsonResponse(404, { detail: 'not found' }))
    await expect(transport.getTurn({ session: SESSION, turnId: 't' })).rejects.toMatchObject({
      code: WEB_TURN_ERROR_CODES.NOT_FOUND,
    })
  })

  it('terminalul se decodează prin contract', async () => {
    const { transport } = makeTransport(() => jsonResponse(200, validViews.terminal_failed))
    const result = await transport.getTurn({ session: SESSION, turnId: 'opq_turn_9' })
    expect(result.outcome).toBe('terminal')
    expect(result.view.turn.status).toBe('failed')
  })
})

describe('subscribe (SSE)', () => {
  function fakeEventSource() {
    const listeners = {}
    const source = {
      closed: false,
      url: null,
      addEventListener: (name, fn) => {
        listeners[name] = fn
      },
      close: () => {
        source.closed = true
      },
      emit: (name, data, lastEventId) => listeners[name]?.({ data: JSON.stringify(data), lastEventId }),
      emitRaw: (name, data) => listeners[name]?.({ data, lastEventId: '0' }),
    }
    return source
  }

  it('trimite sesiunea în query (mecanismul semnat server-side, nu un workaround)', () => {
    const source = fakeEventSource()
    const { transport } = makeTransport(() => jsonResponse(200, {}), {
      eventSourceFactory: (url) => {
        source.url = url
        return source
      },
    })
    transport.subscribe({ session: SESSION, turnId: 'opq_turn_1', onStatus: () => {} })
    expect(source.url).toBe(
      'https://bot.example.invalid/web/v2/turns/opq_turn_1/events?token=pub_tok&visitor_id=web_abc&sig=v2.claims.mac',
    )
  })

  it('`status` decodat, `result` decodat prin NX-242, conexiunea se închide la terminal', async () => {
    const source = fakeEventSource()
    const { transport } = makeTransport(() => jsonResponse(200, {}), {
      eventSourceFactory: () => source,
    })
    const onStatus = vi.fn()
    const onResult = vi.fn()
    transport.subscribe({ session: SESSION, turnId: 'opq_turn_1', onStatus, onResult })

    // Frame-ul REAL de status e doar `{turn}` — fără `schema_version`/`poll_after_ms`.
    source.emit('status', { turn: { id: 'opq_turn_1', client_turn_id: CLIENT_TURN_ID, status: 'working' } }, '1')
    expect(onStatus).toHaveBeenCalledWith(
      { turnId: 'opq_turn_1', clientTurnId: CLIENT_TURN_ID, status: 'working', pollAfterMs: null, sseOffered: true },
      '1',
    )

    source.emit('result', validViews.greeting, '3')
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledWith(validViews.greeting, '3'))
    expect(source.closed).toBe(true)
  })

  it('un frame `result` corupt raportează eroare, nu randează nimic', async () => {
    const source = fakeEventSource()
    const { transport } = makeTransport(() => jsonResponse(200, {}), {
      eventSourceFactory: () => source,
    })
    const onError = vi.fn()
    const onResult = vi.fn()
    transport.subscribe({ session: SESSION, turnId: 't', onResult, onError })
    source.emitRaw('result', '{nu e json')
    expect(onError).toHaveBeenCalled()
    expect(onResult).not.toHaveBeenCalled()
  })

  it('funcția de oprire închide sursa și devine idempotentă', () => {
    const source = fakeEventSource()
    const { transport } = makeTransport(() => jsonResponse(200, {}), {
      eventSourceFactory: () => source,
    })
    const stop = transport.subscribe({ session: SESSION, turnId: 't', onStatus: () => {} })
    stop()
    stop()
    expect(source.closed).toBe(true)
  })

  it('fără EventSource în mediu întoarce null (controllerul cade pe polling)', () => {
    const { transport } = makeTransport(() => jsonResponse(200, {}), { eventSourceFactory: null })
    const previous = globalThis.EventSource
    // eslint-disable-next-line no-global-assign
    delete globalThis.EventSource
    expect(transport.subscribe({ session: SESSION, turnId: 't', onStatus: () => {} })).toBeNull()
    if (previous) globalThis.EventSource = previous
  })
})

describe('renewSession', () => {
  it('backendul nu are lineage: singurul outcome onest e `new_session`', async () => {
    const { transport } = makeTransport(() =>
      jsonResponse(200, { token: 'pub_tok', visitor_id: 'web_new', sig: 'v2.new.mac' }),
    )
    const result = await transport.renewSession({})
    expect(result.outcome).toBe('new_session')
    expect(result.session.visitor_id).toBe('web_new')
  })
})
