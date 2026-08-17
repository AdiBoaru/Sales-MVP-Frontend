// NX-243 — controllerul, pe matricea de race și recovery din card.
//
// Transportul e injectat și numără apelurile: fiecare test spune explicit CÂTE requesturi au
// plecat și cu ce ID-uri. Regula pe care o apără aproape toate: un turn acceptat de server se
// recuperează, nu se retrimite cu alt `client_turn_id` — altfel același mesaj costă două execuții.

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import validViews from './fixtures/web-v2/valid_views.json'
import { useWebChatController } from '@/chat/state/useWebChatController.js'
import { WEB_TURN_ERROR_CODES, WebTurnTransportError } from '@/chat/transport/webTurnErrors.js'
import { createChatSessionStorage } from '@/chat/session/chatSessionStorage.js'

const SESSION = { token: 'pub_tok', visitor_id: 'web_abc', sig: 'v2.a.b' }
/** NX-244 — copy-ul ramei, derivat dintr-o fixtură de view sincronizată din backend. */
const SHELL_COPY = {
  composer: validViews.greeting.composer,
  chrome: validViews.greeting.chrome,
  a11y: validViews.greeting.a11y,
}

function memoryStorage() {
  const map = new Map()
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  }
}

function statusOf(overrides = {}) {
  return {
    turnId: 'turn_1',
    clientTurnId: null, // completat de fake cu ID-ul primit, ca serverul real
    status: 'accepted',
    pollAfterMs: 5,
    sseOffered: false,
    ...overrides,
  }
}

function viewOf({ turnId = 'turn_1', clientTurnId, status = 'completed', revision = 1 } = {}) {
  return {
    ...validViews.recommendation,
    conversation: { id: 'conv_1', revision },
    turn: { id: turnId, client_turn_id: clientTurnId, status },
  }
}

/**
 * Transport fake: fiecare metodă e o coadă de răspunsuri programate. Ce nu e programat cade pe
 * comportamentul implicit (accept → 202, getTurn → status curent).
 */
function makeTransport() {
  const calls = { bootstrap: [], createTurn: [], getTurn: [], subscribe: [], renew: [] }
  const queues = { createTurn: [], getTurn: [] }
  let subscription = null

  const next = (name, fallback) => (queues[name].length > 0 ? queues[name].shift() : fallback)

  const transport = {
    calls,
    queues,
    get subscription() {
      return subscription
    },
    async bootstrap() {
      calls.bootstrap.push(true)
      // NX-244: bootstrapul livrează handle-ul ȘI copy-ul ramei (chrome/composer/a11y).
      return { session: SESSION, shellCopy: SHELL_COPY }
    },
    async renewSession() {
      calls.renew.push(true)
      const session = { ...SESSION, visitor_id: `web_new_${calls.renew.length}`, sig: 'v2.new' }
      return { outcome: 'new_session', session, shellCopy: SHELL_COPY }
    },
    async createTurn({ clientTurnId, input }) {
      calls.createTurn.push({ clientTurnId, input })
      const programmed = next('createTurn', null)
      if (programmed instanceof Error) throw programmed
      if (typeof programmed === 'function') return programmed({ clientTurnId, input })
      if (programmed !== null) return programmed
      return { outcome: 'accepted', status: { ...statusOf(), clientTurnId } }
    },
    async getTurn({ turnId }) {
      calls.getTurn.push({ turnId })
      const programmed = next('getTurn', null)
      if (programmed instanceof Error) throw programmed
      if (typeof programmed === 'function') return programmed({ turnId })
      if (programmed !== null) return programmed
      const clientTurnId = calls.createTurn.at(-1)?.clientTurnId ?? null
      return { outcome: 'accepted', status: { ...statusOf({ status: 'working' }), turnId, clientTurnId } }
    },
    subscribe({ turnId, onStatus, onResult, onError }) {
      calls.subscribe.push({ turnId })
      subscription = { turnId, onStatus, onResult, onError, closed: false }
      return () => {
        subscription.closed = true
      }
    },
  }
  return transport
}

function mount(transport, options = {}) {
  const backing = options.backing || memoryStorage()
  const storage = createChatSessionStorage({ namespace: 'ctrl', storage: backing })
  const metrics = []
  const hook = renderHook(() =>
    useWebChatController({
      enabled: true,
      transport,
      storage,
      broadcastFactory: options.broadcastFactory ?? null,
      policy: { pollMinMs: 5, pollMaxMs: 10, statusTimeoutMs: 50, acceptTimeoutMs: 50, ...(options.policy || {}) },
      onMetric: (name, labels) => metrics.push({ name, labels }),
    }),
  )
  return { ...hook, storage, backing, metrics }
}

const readyHook = async (transport, options) => {
  const ctx = mount(transport, options)
  await waitFor(() => expect(ctx.result.current.canSubmit).toBe(true))
  return ctx
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('happy path', () => {
  it('bootstrap fără turn activ → ready, sesiunea e persistată', async () => {
    const transport = makeTransport()
    const ctx = await readyHook(transport)
    expect(transport.calls.bootstrap).toHaveLength(1)
    expect(ctx.storage.read().session_handle).toEqual(SESSION)
    expect(ctx.result.current.canSubmit).toBe(true)
  })

  it('submit → un POST → accepted → completed → composer reactivat', async () => {
    const transport = makeTransport()
    const ctx = await readyHook(transport)

    await act(async () => {
      ctx.result.current.sendText('ser pentru ten gras')
    })
    await waitFor(() => expect(transport.calls.createTurn).toHaveLength(1))
    expect(transport.calls.createTurn[0].input).toEqual({ type: 'text', text: 'ser pentru ten gras' })
    expect(ctx.result.current.canSubmit).toBe(false)

    const clientTurnId = transport.calls.createTurn[0].clientTurnId
    transport.queues.getTurn.push({ outcome: 'terminal', view: viewOf({ clientTurnId }) })

    await waitFor(() => expect(ctx.result.current.canSubmit).toBe(true))
    expect(ctx.result.current.views).toHaveLength(1)
    expect(ctx.storage.read().active_turn_id).toBeNull()
  })

  it('acțiunea opacă traversează același drum, byte-identic', async () => {
    const transport = makeTransport()
    const ctx = await readyHook(transport)
    await act(async () => {
      ctx.result.current.sendAction('opq.tok.add.pv1')
    })
    await waitFor(() => expect(transport.calls.createTurn).toHaveLength(1))
    expect(transport.calls.createTurn[0].input).toEqual({
      type: 'action',
      action_token: 'opq.tok.add.pv1',
    })
  })

  it('textul gol nu pornește niciun turn', async () => {
    const transport = makeTransport()
    const ctx = await readyHook(transport)
    await act(async () => {
      expect(ctx.result.current.sendText('   ')).toBe(false)
    })
    expect(transport.calls.createTurn).toHaveLength(0)
  })
})

describe('dublu submit', () => {
  it('două apeluri în ACELAȘI tick produc un singur POST și un singur ID', async () => {
    const transport = makeTransport()
    const ctx = await readyHook(transport)

    await act(async () => {
      // Enter + click în același microtask: guardul e sincron, deci al doilea nu are ce prinde.
      const first = ctx.result.current.sendText('primul', { source: 'enter' })
      const second = ctx.result.current.sendText('al doilea', { source: 'click' })
      expect(first).toBe(true)
      expect(second).toBe(false)
    })

    await waitFor(() => expect(transport.calls.createTurn).toHaveLength(1))
    expect(transport.calls.createTurn[0].input.text).toBe('primul')
    const blocked = ctx.metrics.filter((m) => m.name === 'web_turn_duplicate_submit_blocked_total')
    expect(blocked).toHaveLength(1)
    expect(blocked[0].labels.source).toBe('click')
  })

  it('un submit în timpul turului e refuzat, fără al doilea POST', async () => {
    const transport = makeTransport()
    const ctx = await readyHook(transport)
    await act(async () => {
      ctx.result.current.sendText('primul')
    })
    await waitFor(() => expect(transport.calls.createTurn).toHaveLength(1))
    await act(async () => {
      expect(ctx.result.current.sendText('al doilea')).toBe(false)
    })
    expect(transport.calls.createTurn).toHaveLength(1)
  })
})

describe('response loss și timeout', () => {
  it('răspunsul pierdut la accept → REJUCĂ același ID/body, niciodată unul nou', async () => {
    const transport = makeTransport()
    transport.queues.createTurn.push(new WebTurnTransportError(WEB_TURN_ERROR_CODES.TIMEOUT))
    const ctx = await readyHook(transport)

    await act(async () => {
      ctx.result.current.sendText('mesajul meu')
    })

    // A doua încercare e tot un accept, cu ACELAȘI client_turn_id și același body.
    await waitFor(() => expect(transport.calls.createTurn.length).toBeGreaterThanOrEqual(2))
    const ids = new Set(transport.calls.createTurn.map((c) => c.clientTurnId))
    expect(ids.size).toBe(1)
    expect(transport.calls.createTurn.every((c) => c.input.text === 'mesajul meu')).toBe(true)
    // Composerul rămâne blocat cât timp nu știm ce s-a întâmplat cu turul.
    expect(ctx.result.current.canSubmit).toBe(false)
  })

  it('serverul ACCEPTASE: replay-ul întoarce rezultatul deja comis, fără a doua execuție', async () => {
    const transport = makeTransport()
    let capturedId = null
    transport.queues.createTurn.push(({ clientTurnId }) => {
      capturedId = clientTurnId
      throw new WebTurnTransportError(WEB_TURN_ERROR_CODES.NETWORK)
    })
    transport.queues.createTurn.push(({ clientTurnId }) => ({
      outcome: 'terminal',
      view: viewOf({ clientTurnId }),
    }))
    const ctx = await readyHook(transport)

    await act(async () => {
      ctx.result.current.sendText('mesajul meu')
    })
    await waitFor(() => expect(ctx.result.current.views).toHaveLength(1))
    expect(transport.calls.createTurn).toHaveLength(2)
    expect(transport.calls.createTurn[1].clientTurnId).toBe(capturedId)
    expect(ctx.result.current.canSubmit).toBe(true)
  })

  it('5xx e outcome necunoscut, nu un turn eșuat', async () => {
    const transport = makeTransport()
    transport.queues.createTurn.push(new WebTurnTransportError(WEB_TURN_ERROR_CODES.SERVER, { status: 500 }))
    const ctx = await readyHook(transport)
    await act(async () => {
      ctx.result.current.sendText('x')
    })
    await waitFor(() => expect(transport.calls.createTurn.length).toBeGreaterThanOrEqual(2))
    expect(ctx.result.current.canSubmit).toBe(false)
  })

  it('bugetul de recovery epuizat → `unavailable`, tot fără turn nou și fără deblocare', async () => {
    const transport = makeTransport()
    for (let i = 0; i < 6; i += 1) {
      transport.queues.createTurn.push(new WebTurnTransportError(WEB_TURN_ERROR_CODES.NETWORK))
    }
    const ctx = await readyHook(transport, { policy: { recoveryMaxAttempts: 3 } })
    await act(async () => {
      ctx.result.current.sendText('x')
    })
    await waitFor(() => expect(ctx.result.current.state.phase).toBe('unavailable'))
    expect(ctx.result.current.canSubmit).toBe(false)
    const ids = new Set(transport.calls.createTurn.map((c) => c.clientTurnId))
    expect(ids.size).toBe(1)
  })
})

describe('refresh și reatașare', () => {
  it('un controller nou pornește din storage + server, NU dintr-un transcript', async () => {
    const transport = makeTransport()
    const backing = memoryStorage()
    const first = await readyHook(transport, { backing })

    await act(async () => {
      first.result.current.sendText('întrebarea mea')
    })
    await waitFor(() => expect(first.storage.read().active_turn_id).toBe('turn_1'))
    const clientTurnId = transport.calls.createTurn[0].clientTurnId
    first.unmount()

    // „Refresh": alt controller, același storage. Nu există niciun mesaj local de restaurat.
    const second = mount(transport, { backing })
    await waitFor(() => expect(transport.calls.getTurn.length).toBeGreaterThanOrEqual(1))
    expect(transport.calls.getTurn[0].turnId).toBe('turn_1')
    expect(second.result.current.canSubmit).toBe(false)
    expect(second.result.current.views).toHaveLength(0)

    transport.queues.getTurn.push({ outcome: 'terminal', view: viewOf({ clientTurnId }) })
    await waitFor(() => expect(second.result.current.views).toHaveLength(1))
    // Un singur POST în toată povestea: refresh-ul nu retrimite mesajul.
    expect(transport.calls.createTurn).toHaveLength(1)
  })

  it('turnul dispărut (404) oprește urmărirea fără să retrimită mesajul', async () => {
    const transport = makeTransport()
    const backing = memoryStorage()
    const storage = createChatSessionStorage({ namespace: 'ctrl', storage: backing })
    storage.start(SESSION)
    storage.write({ active_turn_id: 'turn_vechi', client_turn_id: 'c_vechi' })
    transport.queues.getTurn.push(new WebTurnTransportError(WEB_TURN_ERROR_CODES.NOT_FOUND, { status: 404 }))

    const ctx = mount(transport, { backing })
    await waitFor(() => expect(ctx.result.current.canSubmit).toBe(true))
    expect(transport.calls.createTurn).toHaveLength(0)
    expect(ctx.storage.read().active_turn_id).toBeNull()
  })
})

describe('409 — turn activ pe conversație', () => {
  it('ne atașăm la turnul indicat de server, fără mesaj local', async () => {
    const transport = makeTransport()
    transport.queues.createTurn.push({
      outcome: 'active_turn',
      status: { ...statusOf({ turnId: 'turn_altul', status: 'working' }), clientTurnId: 'client_altul' },
    })
    const ctx = await readyHook(transport)
    await act(async () => {
      ctx.result.current.sendText('x')
    })
    await waitFor(() => expect(ctx.result.current.state.activeTurn?.turnId).toBe('turn_altul'))
    expect(ctx.storage.read().active_turn_id).toBe('turn_altul')
    expect(ctx.result.current.views).toHaveLength(0)
    expect(ctx.result.current.canSubmit).toBe(false)
  })

  it('409 fără referință: reluăm ACELAȘI accept, nu deblocăm', async () => {
    const transport = makeTransport()
    transport.queues.createTurn.push({ outcome: 'active_turn', status: null })
    const ctx = await readyHook(transport)
    await act(async () => {
      ctx.result.current.sendText('x')
    })
    await waitFor(() => expect(transport.calls.createTurn.length).toBeGreaterThanOrEqual(2))
    expect(new Set(transport.calls.createTurn.map((c) => c.clientTurnId)).size).toBe(1)
    expect(ctx.result.current.canSubmit).toBe(false)
  })
})

describe('erori dovedite înainte de accept', () => {
  it.each([
    ['422 schema_invalid', WEB_TURN_ERROR_CODES.REJECTED, 'schema_invalid'],
    ['429 rate limited', WEB_TURN_ERROR_CODES.RATE_LIMITED, null],
    ['409 idempotency', WEB_TURN_ERROR_CODES.IDEMPOTENCY_CONFLICT, 'idempotency_conflict'],
  ])('%s deblochează (turul nu există pe server) și NU compune replică locală', async (_l, code, serverCode) => {
    const transport = makeTransport()
    transport.queues.createTurn.push(
      new WebTurnTransportError(code, { serverCode, serverMessage: 'copy server-owned' }),
    )
    const ctx = await readyHook(transport)
    await act(async () => {
      ctx.result.current.sendText('x')
    })
    await waitFor(() => expect(ctx.result.current.canSubmit).toBe(true))
    expect(transport.calls.createTurn).toHaveLength(1)
    expect(ctx.result.current.views).toHaveLength(0) // zero mesaje inventate
    expect(ctx.result.current.fault.serverMessage).toBe('copy server-owned')
  })

  it('ruta v2 stinsă pe server (404) e stare tehnică `unavailable`, nu retry infinit', async () => {
    const transport = makeTransport()
    transport.queues.createTurn.push(new WebTurnTransportError(WEB_TURN_ERROR_CODES.UNSUPPORTED, { status: 404 }))
    const ctx = await readyHook(transport)
    await act(async () => {
      ctx.result.current.sendText('x')
    })
    await waitFor(() => expect(ctx.result.current.state.phase).toBe('unavailable'))
    expect(transport.calls.createTurn).toHaveLength(1)
  })
})

describe('SSE', () => {
  it('se abonează doar când serverul OFERĂ stream, altfel face polling', async () => {
    const transport = makeTransport()
    transport.queues.createTurn.push(({ clientTurnId }) => ({
      outcome: 'accepted',
      status: { ...statusOf({ sseOffered: true }), clientTurnId },
    }))
    const ctx = await readyHook(transport)
    await act(async () => {
      ctx.result.current.sendText('x')
    })
    await waitFor(() => expect(transport.calls.subscribe).toHaveLength(1))
    expect(transport.calls.getTurn).toHaveLength(0)
  })

  it('progresul vine din server, iar rezultatul terminal închide turul', async () => {
    const transport = makeTransport()
    transport.queues.createTurn.push(({ clientTurnId }) => ({
      outcome: 'accepted',
      status: { ...statusOf({ sseOffered: true }), clientTurnId },
    }))
    const ctx = await readyHook(transport)
    await act(async () => {
      ctx.result.current.sendText('x')
    })
    await waitFor(() => expect(transport.subscription).not.toBeNull())
    const clientTurnId = transport.calls.createTurn[0].clientTurnId

    await act(async () => {
      transport.subscription.onStatus({
        turnId: 'turn_1',
        clientTurnId,
        status: 'validating',
        pollAfterMs: null,
        sseOffered: true,
      })
    })
    expect(ctx.result.current.progressStatus).toBe('validating')

    // Un status VECHI sosit după cel nou nu dă ceasul înapoi.
    await act(async () => {
      transport.subscription.onStatus({
        turnId: 'turn_1',
        clientTurnId,
        status: 'working',
        pollAfterMs: null,
        sseOffered: true,
      })
    })
    expect(ctx.result.current.progressStatus).toBe('validating')

    await act(async () => {
      transport.subscription.onResult(viewOf({ clientTurnId }))
    })
    await waitFor(() => expect(ctx.result.current.canSubmit).toBe(true))
    expect(ctx.result.current.views).toHaveLength(1)
  })

  it('un rezultat cu alt turn NU e randat, dar nici nu agață widgetul: cere adevărul serverului', async () => {
    const transport = makeTransport()
    transport.queues.createTurn.push(({ clientTurnId }) => ({
      outcome: 'accepted',
      status: { ...statusOf({ sseOffered: true }), clientTurnId },
    }))
    const ctx = await readyHook(transport)
    await act(async () => {
      ctx.result.current.sendText('x')
    })
    await waitFor(() => expect(transport.subscription).not.toBeNull())
    const clientTurnId = transport.calls.createTurn[0].clientTurnId

    // Frame-ul `result` închide conexiunea SSE. Dacă respingerea ar fi doar „ignoră", nimic nu
    // ar mai cere rezultatul: fără stream și fără poll, composerul ar rămâne blocat pe veci.
    transport.queues.getTurn.push({ outcome: 'terminal', view: viewOf({ clientTurnId }) })
    await act(async () => {
      transport.subscription.onResult(viewOf({ turnId: 'ALT_TURN', clientTurnId: 'ALT_CLIENT' }))
    })

    expect(ctx.metrics.some((m) => m.name === 'web_turn_stale_event_total')).toBe(true)
    // Refetch: GET-ul e autoritatea și aduce rezultatul CORECT.
    await waitFor(() => expect(ctx.result.current.views).toHaveLength(1))
    expect(ctx.result.current.views[0].turn.id).toBe('turn_1')
    expect(ctx.result.current.canSubmit).toBe(true)
    expect(transport.calls.createTurn).toHaveLength(1) // zero turnuri noi
  })

  it('SSE căzut → recovery pe GET, fără deblocare prematură', async () => {
    const transport = makeTransport()
    transport.queues.createTurn.push(({ clientTurnId }) => ({
      outcome: 'accepted',
      status: { ...statusOf({ sseOffered: true }), clientTurnId },
    }))
    const ctx = await readyHook(transport)
    await act(async () => {
      ctx.result.current.sendText('x')
    })
    await waitFor(() => expect(transport.subscription).not.toBeNull())

    await act(async () => {
      transport.subscription.onError(new WebTurnTransportError(WEB_TURN_ERROR_CODES.NETWORK))
    })
    await waitFor(() => expect(transport.calls.getTurn.length).toBeGreaterThanOrEqual(1))
    expect(ctx.result.current.canSubmit).toBe(false)
    expect(transport.calls.createTurn).toHaveLength(1)
  })
})

describe('stări tehnice vizibile și reversibile', () => {
  it('un bootstrap picat pe rețea oferă reîncercare (nu lasă widgetul mort)', async () => {
    const transport = makeTransport()
    const failing = {
      ...transport,
      bootstrap: async () => {
        transport.calls.bootstrap.push(true)
        if (transport.calls.bootstrap.length === 1) {
          throw new WebTurnTransportError(WEB_TURN_ERROR_CODES.NETWORK)
        }
        return SESSION
      },
    }
    const ctx = mount(failing)
    await waitFor(() => expect(ctx.result.current.state.phase).toBe('unavailable'))
    // `retryable` de la server e despre RESPINGERI; un defect de transport nu îl setează, deci
    // afordanța de reîncercare nu are voie să depindă de el.
    expect(ctx.result.current.fault.retryable).toBe(false)
    expect(ctx.result.current.canRetry).toBe(true)

    await act(async () => {
      ctx.result.current.retry()
    })
    await waitFor(() => expect(ctx.result.current.canSubmit).toBe(true))
  })

  it('ruta v2 stinsă pe server NU oferă reîncercare: nu se repară reîncercând', async () => {
    const transport = makeTransport()
    transport.queues.createTurn.push(new WebTurnTransportError(WEB_TURN_ERROR_CODES.UNSUPPORTED, { status: 404 }))
    const ctx = await readyHook(transport)
    await act(async () => {
      ctx.result.current.sendText('x')
    })
    await waitFor(() => expect(ctx.result.current.state.phase).toBe('unavailable'))
    expect(ctx.result.current.canRetry).toBe(false)
  })

  it('bugetul epuizat oferă reîncercare pe ACELAȘI turn', async () => {
    const transport = makeTransport()
    for (let i = 0; i < 8; i += 1) {
      transport.queues.createTurn.push(new WebTurnTransportError(WEB_TURN_ERROR_CODES.NETWORK))
    }
    const ctx = await readyHook(transport, { policy: { recoveryMaxAttempts: 2 } })
    await act(async () => {
      ctx.result.current.sendText('x')
    })
    await waitFor(() => expect(ctx.result.current.state.phase).toBe('unavailable'))
    expect(ctx.result.current.canRetry).toBe(true)
    const idsBefore = new Set(transport.calls.createTurn.map((c) => c.clientTurnId))
    expect(idsBefore.size).toBe(1)

    const clientTurnId = transport.calls.createTurn[0].clientTurnId
    transport.queues.createTurn.length = 0
    transport.queues.createTurn.push({ outcome: 'terminal', view: viewOf({ clientTurnId }) })
    await act(async () => {
      ctx.result.current.retry()
    })
    await waitFor(() => expect(ctx.result.current.views).toHaveLength(1))
    expect(new Set(transport.calls.createTurn.map((c) => c.clientTurnId)).size).toBe(1)
  })
})

describe('sesiune expirată', () => {
  it('403 → bootstrap nou, conversație nouă, ZERO lookup pe turnul vechi', async () => {
    const transport = makeTransport()
    const ctx = await readyHook(transport)

    await act(async () => {
      ctx.result.current.sendText('x')
    })
    await waitFor(() => expect(ctx.storage.read().active_turn_id).toBe('turn_1'))

    const getTurnsBefore = transport.calls.getTurn.length
    transport.queues.getTurn.push(
      new WebTurnTransportError(WEB_TURN_ERROR_CODES.SESSION_EXPIRED, { status: 403 }),
    )

    await waitFor(() => expect(ctx.result.current.sessionOutcome).toBe('new_session'))
    expect(transport.calls.renew).toHaveLength(1)
    // Recordul vechi e curățat ATOMIC: nicio corelație veche nu supraviețuiește.
    const record = ctx.storage.read()
    expect(record.active_turn_id).toBeNull()
    expect(record.conversation_id).toBeNull()
    expect(record.session_handle.visitor_id).toBe('web_new_1')
    expect(ctx.result.current.views).toHaveLength(0)
    // Nu se mai cere turnul vechi sub sesiunea nouă.
    const after = transport.calls.getTurn.slice(getTurnsBefore + 1)
    expect(after.filter((c) => c.turnId === 'turn_1')).toHaveLength(0)
    expect(ctx.result.current.canSubmit).toBe(true)
  })
})

describe('conversație nouă', () => {
  it('e REFUZATĂ cât timp există un turn activ', async () => {
    const transport = makeTransport()
    const ctx = await readyHook(transport)
    await act(async () => {
      ctx.result.current.sendText('x')
    })
    await waitFor(() => expect(ctx.result.current.canSubmit).toBe(false))
    await act(async () => {
      expect(ctx.result.current.reset()).toBe(false)
    })
    expect(ctx.storage.read().active_turn_id).toBe('turn_1')
  })

  it('fără turn activ șterge recordul și re-bootstrap-ează', async () => {
    const transport = makeTransport()
    const ctx = await readyHook(transport)
    await act(async () => {
      expect(ctx.result.current.reset()).toBe(true)
    })
    await waitFor(() => expect(transport.calls.bootstrap.length).toBe(2))
    expect(ctx.result.current.views).toHaveLength(0)
  })
})

describe('cross-tab', () => {
  function fakeChannel() {
    const channel = {
      name: null,
      posted: [],
      onmessage: null,
      postMessage: (data) => channel.posted.push(data),
      close: () => {},
    }
    return channel
  }

  it('transmite doar invalidări tehnice — fără text, fără ViewModel', async () => {
    const transport = makeTransport()
    const channel = fakeChannel()
    const ctx = await readyHook(transport, { broadcastFactory: () => channel })

    await act(async () => {
      ctx.result.current.sendText('mesaj-sentinel')
    })
    await waitFor(() => expect(channel.posted.length).toBeGreaterThanOrEqual(1))
    expect(channel.posted[0]).toEqual({ kind: 'turn_started' })
    expect(JSON.stringify(channel.posted)).not.toContain('mesaj-sentinel')
  })

  it('la o invalidare, tabul cere snapshotul SERVERULUI (nu acceptă payloadul altui tab)', async () => {
    const transport = makeTransport()
    const channel = fakeChannel()
    const backing = memoryStorage()
    const storage = createChatSessionStorage({ namespace: 'ctrl', storage: backing })
    storage.start(SESSION)

    const ctx = await readyHook(transport, { backing, broadcastFactory: () => channel })
    // Alt tab a pornit un turn: în storage apare referința opacă.
    storage.write({ active_turn_id: 'turn_altul', client_turn_id: 'client_altul' })

    await act(async () => {
      channel.onmessage({ data: { kind: 'turn_started' } })
    })
    await waitFor(() => expect(transport.calls.getTurn.some((c) => c.turnId === 'turn_altul')).toBe(true))
    expect(ctx.result.current.canSubmit).toBe(false)
    expect(transport.calls.createTurn).toHaveLength(0) // nu pornim un turn concurent
  })

  it('un mesaj cu `kind` necunoscut e ignorat', async () => {
    const transport = makeTransport()
    const channel = fakeChannel()
    const ctx = await readyHook(transport, { broadcastFactory: () => channel })
    await act(async () => {
      channel.onmessage({ data: { kind: 'evil', view: viewOf({}) } })
    })
    expect(ctx.result.current.views).toHaveLength(0)
    expect(ctx.result.current.canSubmit).toBe(true)
  })

  it('lipsa BroadcastChannel nu rupe nimic', async () => {
    const transport = makeTransport()
    const ctx = await readyHook(transport, { broadcastFactory: null })
    await act(async () => {
      ctx.result.current.sendText('x')
    })
    await waitFor(() => expect(transport.calls.createTurn).toHaveLength(1))
  })
})

describe('privacy — nimic sensibil nu părăsește memoria', () => {
  it('textul, tokenul de acțiune și view-ul nu ajung în storage sau în etichetele de metrici', async () => {
    const transport = makeTransport()
    const backing = memoryStorage()
    const ctx = await readyHook(transport, { backing })

    await act(async () => {
      ctx.result.current.sendText('SENTINEL-TEXT-cauT un ser')
    })
    await waitFor(() => expect(transport.calls.createTurn).toHaveLength(1))
    const clientTurnId = transport.calls.createTurn[0].clientTurnId
    transport.queues.getTurn.push({ outcome: 'terminal', view: viewOf({ clientTurnId }) })
    await waitFor(() => expect(ctx.result.current.views).toHaveLength(1))

    await act(async () => {
      ctx.result.current.sendAction('SENTINEL-TOKEN-opq')
    })
    await waitFor(() => expect(transport.calls.createTurn).toHaveLength(2))

    const persisted = JSON.stringify([...backing.map.entries()])
    const labels = JSON.stringify(ctx.metrics)
    for (const sentinel of ['SENTINEL-TEXT', 'SENTINEL-TOKEN', '89,00 lei', 'Petala']) {
      expect(persisted).not.toContain(sentinel)
      expect(labels).not.toContain(sentinel)
    }
    // Storage-ul ține DOAR identificatori tehnici din enumul închis — plus, de la NX-244,
    // copy-ul de shell emis de server. Enumul rămâne ÎNCHIS: un câmp nou cere o decizie.
    const record = JSON.parse(backing.map.get(ctx.storage.key))
    expect(Object.keys(record).sort()).toEqual([
      'active_turn_id',
      'client_turn_id',
      'conversation_id',
      'last_event_id',
      'session_handle',
      'storage_version',
      'view_copy',
    ])
    // Iar `view_copy` e RAMA, nu conversația: exact cele trei secțiuni server-owned, niciun
    // mesaj, niciun produs, niciun token de acțiune. (Sentinelele de mai sus acoperă deja
    // conținutul; asta ține forma sub control ca nimeni să nu strecoare un transcript aici.)
    expect(Object.keys(record.view_copy).sort()).toEqual(['a11y', 'chrome', 'composer'])
  })

  it('etichetele de metrici nu conțin id-uri de turn/conversație', async () => {
    const transport = makeTransport()
    const ctx = await readyHook(transport)
    await act(async () => {
      ctx.result.current.sendText('x')
    })
    await waitFor(() => expect(ctx.metrics.length).toBeGreaterThan(0))
    for (const entry of ctx.metrics) {
      const values = Object.values(entry.labels || {}).map(String)
      expect(values.some((v) => v.includes('turn_1') || v.includes('conv_1'))).toBe(false)
    }
  })
})

describe('curățare și inerție', () => {
  it('cu `enabled: false` nu face NIMIC: zero requesturi, zero storage', async () => {
    const transport = makeTransport()
    const backing = memoryStorage()
    const storage = createChatSessionStorage({ namespace: 'ctrl', storage: backing })
    const hook = renderHook(() => useWebChatController({ enabled: false, transport, storage }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(transport.calls.bootstrap).toHaveLength(0)
    expect(backing.map.size).toBe(0)
    expect(hook.result.current.canSubmit).toBe(false)
    expect(hook.result.current.sendText('x')).toBe(false)
  })

  it('unmount închide streamul și nu mai face setState', async () => {
    const transport = makeTransport()
    transport.queues.createTurn.push(({ clientTurnId }) => ({
      outcome: 'accepted',
      status: { ...statusOf({ sseOffered: true }), clientTurnId },
    }))
    const ctx = await readyHook(transport)
    await act(async () => {
      ctx.result.current.sendText('x')
    })
    await waitFor(() => expect(transport.subscription).not.toBeNull())

    ctx.unmount()
    expect(transport.subscription.closed).toBe(true)
    // Un rezultat sosit după unmount nu produce warning de setState pe componentă demontată.
    await act(async () => {
      transport.subscription.onResult(viewOf({ clientTurnId: transport.calls.createTurn[0].clientTurnId }))
    })
    expect(console.error).not.toHaveBeenCalled()
  })

  it('turul serverului NU e anulat de unmount — se reia din storage', async () => {
    const transport = makeTransport()
    const backing = memoryStorage()
    const first = await readyHook(transport, { backing })
    await act(async () => {
      first.result.current.sendText('x')
    })
    await waitFor(() => expect(first.storage.read().active_turn_id).toBe('turn_1'))
    first.unmount()
    expect(first.storage.read().active_turn_id).toBe('turn_1')
  })
})
