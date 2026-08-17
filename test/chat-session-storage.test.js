// NX-243 — recordul tehnic local: ce are voie să conțină, ce refuză și cum degradează.
//
// Testul central e negativ: NIMIC din conversație nu ajunge pe disc. Un sentinel plantat în text
// nu trebuie să apară nicăieri în `localStorage`, indiferent pe ce cale a trecut.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHAT_STORAGE_VERSION,
  createChatSessionStorage,
  parseRecord,
  storageNamespace,
} from '@/chat/session/chatSessionStorage.js'

const HANDLE = { token: 'pub_tok', visitor_id: 'web_abc', sig: 'v2.claims.mac' }

/** `Storage` în memorie: izolat între teste și capabil să simuleze quota/private mode. */
function memoryStorage({ failOnWrite = false } = {}) {
  const map = new Map()
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      if (failOnWrite) throw new DOMException('QuotaExceededError')
      map.set(key, value)
    },
    removeItem: (key) => map.delete(key),
  }
}

function makeStorage(options) {
  const backing = memoryStorage(options)
  return { backing, storage: createChatSessionStorage({ namespace: 'test1234', storage: backing }) }
}

describe('storageNamespace', () => {
  it('e stabil și separă integrările', () => {
    const a = storageNamespace(['https://bot.a', 'tok', 'https://shop.a'])
    expect(storageNamespace(['https://bot.a', 'tok', 'https://shop.a'])).toBe(a)
    expect(storageNamespace(['https://bot.b', 'tok', 'https://shop.a'])).not.toBe(a)
    expect(storageNamespace(['https://bot.a', 'tok', 'https://shop.b'])).not.toBe(a)
  })

  it('nu pune tokenul public în clar în numele cheii', () => {
    const { storage } = makeStorage()
    expect(storage.key).not.toContain('pub_tok')
    expect(storage.key).toContain(`v${CHAT_STORAGE_VERSION}`)
  })
})

describe('parseRecord — validare strictă', () => {
  const valid = {
    storage_version: CHAT_STORAGE_VERSION,
    session_handle: HANDLE,
    conversation_id: 'conv_1',
    active_turn_id: 'turn_1',
    client_turn_id: 'client_1',
    last_event_id: '2',
    // NX-244: copy-ul de shell e singurul conținut afișabil din record. `null` = record tehnic
    // pur, exact ca înainte.
    view_copy: null,
  }

  it('acceptă recordul canonic', () => {
    expect(parseRecord(valid)).toEqual(valid)
  })

  it.each([
    ['versiune veche (v1 avea transcript)', { ...valid, storage_version: 1 }],
    ['câmp străin', { ...valid, messages: [] }],
    ['handle incomplet', { ...valid, session_handle: { token: 'a', visitor_id: 'b' } }],
    ['handle cu câmp în plus', { ...valid, session_handle: { ...HANDLE, secret: 'x' } }],
    ['id ne-string', { ...valid, active_turn_id: 42 }],
    ['turn activ fără client_turn_id', { ...valid, client_turn_id: null }],
    ['nu e obiect', 'nope'],
  ])('respinge %s', (_label, raw) => {
    expect(parseRecord(raw)).toBeNull()
  })

  it('nu migrează semantic: un record v1 e ignorat, nu convertit', () => {
    const v1 = { storage_version: 1, messages: [{ role: 'user', content: 'secret-sentinel' }] }
    expect(parseRecord(v1)).toBeNull()
  })
})

describe('createChatSessionStorage', () => {
  let ctx
  beforeEach(() => {
    ctx = makeStorage()
  })

  it('start() scrie un record curat, fără corelație veche', () => {
    ctx.storage.write({ session_handle: HANDLE, active_turn_id: 'vechi', client_turn_id: 'c' })
    const record = ctx.storage.start(HANDLE)
    expect(record.active_turn_id).toBeNull()
    expect(record.client_turn_id).toBeNull()
    expect(record.conversation_id).toBeNull()
  })

  it('write() face patch peste recordul existent', () => {
    ctx.storage.start(HANDLE)
    ctx.storage.write({ client_turn_id: 'c1' })
    ctx.storage.write({ active_turn_id: 't1' })
    expect(ctx.storage.read()).toMatchObject({ client_turn_id: 'c1', active_turn_id: 't1' })
  })

  it('clearTurn() curăță ATOMIC corelația, dar păstrează sesiunea și conversația', () => {
    ctx.storage.start(HANDLE)
    ctx.storage.write({ conversation_id: 'conv_1', client_turn_id: 'c1', active_turn_id: 't1', last_event_id: '2' })
    ctx.storage.clearTurn()
    const record = ctx.storage.read()
    expect(record.active_turn_id).toBeNull()
    expect(record.client_turn_id).toBeNull()
    expect(record.last_event_id).toBeNull()
    expect(record.conversation_id).toBe('conv_1')
    expect(record.session_handle).toEqual(HANDLE)
  })

  it('REFUZĂ orice câmp în afara enumului — poarta care ține transcriptul afară', () => {
    ctx.storage.start(HANDLE)
    expect(() => ctx.storage.write({ messages: [{ role: 'user', content: 'x' }] })).toThrow(/nepermis/)
    expect(() => ctx.storage.write({ id_token: 'jwt' })).toThrow(/nepermis/)
    expect(() => ctx.storage.write({ view: {} })).toThrow(/nepermis/)
  })

  it('niciun sentinel de conversație nu ajunge pe disc', () => {
    ctx.storage.start(HANDLE)
    ctx.storage.write({ conversation_id: 'conv_1', client_turn_id: 'c1', active_turn_id: 't1' })
    const dump = JSON.stringify([...ctx.backing.map.entries()])
    for (const sentinel of ['SENTINEL-TEXT', 'ser pentru ten gras', 'opq.tok.', '89,00 lei']) {
      expect(dump).not.toContain(sentinel)
    }
  })

  it('fără record valid și fără handle în patch, nu scrie nimic pe jumătate', () => {
    expect(ctx.storage.write({ client_turn_id: 'c1' })).toBeNull()
    expect(ctx.storage.read()).toBeNull()
  })

  it('record corupt: se șterge și se raportează absent (bootstrap curat)', () => {
    ctx.backing.map.set(ctx.storage.key, '{nu e json')
    expect(ctx.storage.read()).toBeNull()
    expect(ctx.backing.map.has(ctx.storage.key)).toBe(false)
  })

  it('record valid JSON dar invalid structural: la fel', () => {
    ctx.backing.map.set(ctx.storage.key, JSON.stringify({ storage_version: 2, messages: [] }))
    expect(ctx.storage.read()).toBeNull()
    expect(ctx.backing.map.has(ctx.storage.key)).toBe(false)
  })

  it('quota depășită / private mode nu aruncă în afară', () => {
    const failing = makeStorage({ failOnWrite: true })
    expect(() => failing.storage.start(HANDLE)).not.toThrow()
    expect(failing.storage.start(HANDLE)).toBeNull()
    expect(failing.storage.read()).toBeNull()
  })

  it('storage indisponibil (null) degradează la „fără record"', () => {
    const none = createChatSessionStorage({ namespace: 'n', storage: null })
    expect(none.read()).toBeNull()
    expect(none.start(HANDLE)).toBeNull()
    expect(() => none.clear()).not.toThrow()
  })

  it('getItem care aruncă (politici de browser) nu rupe widgetul', () => {
    const hostile = {
      getItem: vi.fn(() => {
        throw new DOMException('SecurityError')
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }
    const storage = createChatSessionStorage({ namespace: 'n', storage: hostile })
    expect(storage.read()).toBeNull()
  })
})
