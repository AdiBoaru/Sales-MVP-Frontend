// NX-242 — suita de contract pentru `web-view.v2`.
//
// Ce apără, în ordinea în care contează:
//   1. un payload valid iese EXACT cum a intrat — zero mapare, zero default, zero sortare;
//   2. ce nu e în contract nu intră: tip de bloc necunoscut, câmp în plus, enum inventat;
//   3. `coerceTypes/useDefaults/removeAdditional` sunt `false` DOVEDIT, nu declarat în config;
//   4. erorile nu scurg payload, URL, token sau text — nici în `message`, nici în diagnostic;
//   5. driftul schemă ↔ validator ↔ fixturi rupe CI-ul;
//   6. ce NU acoperă schema e scris negru pe alb, nu descoperit în producție.
//
// Fără rețea, fără API, fără LLM.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  decodeWebViewV2,
  WebViewContractError,
  WEB_VIEW_CONTRACT_ERROR_CODES as CODES,
  WEB_VIEW_DECODE_REASONS as REASONS,
  WEB_VIEW_V2_SCHEMA_HASH,
  WEB_VIEW_V2_SCHEMA_VERSION,
} from '../src/chat/contract/webViewV2.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCHEMA_PATH = join(ROOT, 'src', 'chat', 'contract', 'schema', 'web-view.v2.schema.json')
const VALIDATOR_PATH = join(ROOT, 'src', 'chat', 'contract', 'generated', 'webViewV2Validator.js')
const FIXTURES = join(ROOT, 'test', 'fixtures', 'web-v2')

// Hashul PUBLICAT de backend (`tests/test_web_contract_v2.py::EXPECTED_VIEW_SCHEMA_HASH`, la
// `Sales Ass@685dd6b`). Pinuit aici ca să nu existe „drift prin resincronizare": dacă backendul
// schimbă contractul, testul pică și cineva decide conștient, nu copiază orbește.
const BACKEND_PUBLISHED_SCHEMA_HASH =
  '1ba3eb43d19de07f9ffe0489c9b90e8b9c0980d1583e559878da44728b11c172'

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const validFixtures = () =>
  Object.entries(readJson(join(FIXTURES, 'valid_views.json'))).filter(([k]) => !k.startsWith('_'))
const invalidCases = () => readJson(join(FIXTURES, 'invalid_views.json')).cases

/** Envelope minim VALID — copiat din `_shell` al backendului, ca fiecare test să schimbe UN lucru. */
const shell = (over = {}) => ({
  schema_version: 'web-view.v2',
  conversation: { id: 'c', revision: 1 },
  turn: { id: 't', client_turn_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', status: 'completed' },
  messages: [{ id: 'm', role: 'assistant', blocks: [{ id: 'b', type: 'text', text: 'ok' }] }],
  composer: { enabled: true, label: 'Mesaj', placeholder: 'Scrie…', send_label: 'Trimite' },
  chrome: {
    launcher_label: 'L',
    dialog_title: 'T',
    dialog_description: 'D',
    close_label: 'C',
    new_chat_label: 'N',
  },
  a11y: {
    announcements: {
      accepted: 'a',
      working: 'w',
      validating: 'v',
      completed: 'c',
      failed: 'f',
      cancelled: 'x',
    },
  },
  ...over,
})

/** Envelope cu un singur bloc, ca limitele să se testeze fără zgomot în jur. */
const withBlock = (block) => shell({ messages: [{ id: 'm', role: 'assistant', blocks: [block] }] })

const decodeError = (payload, options) => {
  try {
    decodeWebViewV2(payload, options)
  } catch (err) {
    if (err instanceof WebViewContractError) return err
    throw err
  }
  throw new Error('payload acceptat, deși testul îl aștepta respins')
}

// ── 1. Fixturile backendului ───────────────────────────────────────────────────────────────
describe('fixturi valide (NX-228)', () => {
  it.each(validFixtures())('%s trece prin decoder', (_name, payload) => {
    expect(decodeWebViewV2(payload)).toBe(payload)
  })

  it('outputul e structural identic cu inputul, inclusiv ordinea colecțiilor', () => {
    const payload = readJson(join(FIXTURES, 'valid_views.json')).recommendation
    const before = structuredClone(payload)
    const decoded = decodeWebViewV2(payload)
    expect(decoded).toEqual(before)
    expect(decoded).toBe(payload)
    const items = decoded.messages.flatMap((m) => m.blocks).find((b) => b.type === 'product_list')
      .items
    expect(items.map((i) => i.view_id)).toEqual(
      before.messages.flatMap((m) => m.blocks).find((b) => b.type === 'product_list').items.map((i) => i.view_id)
    )
  })

  it('nu adaugă și nu șterge chei nicăieri în arbore', () => {
    for (const [, payload] of validFixtures()) {
      const before = JSON.stringify(payload)
      decodeWebViewV2(payload)
      expect(JSON.stringify(payload)).toBe(before)
    }
  })
})

// Împărțirea fixturilor invalide în DOUĂ mulțimi explicite. Un caz nou din backend nu intră în
// niciuna → testul pică și obligă la o decizie, în loc să fie înghițit tăcut.
const REJECTED_BY_DECODER = [
  'terminal_completed_with_empty_blocks',
  'unknown_block_type',
  'extra_field_in_block',
  'extra_field_in_envelope',
  'javascript_url_in_action',
  'data_url_in_image',
  'protocol_relative_url',
  'plain_http_url',
  'url_scheme_obfuscated_with_newline',
  'missing_chrome_label',
  'missing_announcement',
  'comparison_single_column',
  'unknown_tone',
  'unknown_icon',
  'action_without_activation',
  'unknown_major_version',
  'image_without_alt',
  'product_list_empty',
  'numeric_price_instead_of_display_text',
]

// Invarianți pe care JSON Schema NU îi poate exprima: trăiesc în `model_validator`-ele backendului
// (NX-228 îi documentează explicit). Sunt SEMANTICI — „e un răspuns?", „se aliniază tabelul?",
// „are sens `error` pe `completed`?" — iar reimplementarea lor în browser ar reface exact al doilea
// motor pe care cardul îl interzice. Rămân server-owned; NX-247 îi verifică cross-repo, pe serverul
// real. Lista e PINUITĂ ca să fie zgomotoasă, nu tăcută.
const SERVER_OWNED_GAPS = [
  'terminal_completed_without_messages',
  'terminal_failed_without_blocks',
  'terminal_cancelled_without_blocks',
  'terminal_with_only_a_divider',
  'blank_announcement',
  'comparison_misaligned',
  'failed_without_error',
  'error_on_completed',
  'progress_on_terminal',
]

describe('fixturi invalide (NX-228)', () => {
  it('fiecare caz din backend e clasificat explicit', () => {
    const names = invalidCases().map((c) => c.name).sort()
    expect([...REJECTED_BY_DECODER, ...SERVER_OWNED_GAPS].sort()).toEqual(names)
  })

  it.each(invalidCases().filter((c) => REJECTED_BY_DECODER.includes(c.name)).map((c) => [c.name, c]))(
    '%s e respins',
    (_name, testCase) => {
      const err = decodeError(testCase.payload)
      expect(Object.values(CODES)).toContain(err.code)
    }
  )

  it.each(invalidCases().filter((c) => SERVER_OWNED_GAPS.includes(c.name)).map((c) => [c.name, c]))(
    '%s trece de schemă — invariant server-owned, nu regresie',
    (_name, testCase) => {
      expect(decodeWebViewV2(testCase.payload)).toBe(testCase.payload)
    }
  )

  it('URL-urile periculoase sunt respinse, deși schema singură le-ar accepta', () => {
    for (const name of ['javascript_url_in_action', 'data_url_in_image', 'plain_http_url']) {
      const testCase = invalidCases().find((c) => c.name === name)
      const err = decodeError(testCase.payload)
      expect(err.code).toBe(CODES.INVALID_PAYLOAD)
      expect(err.reason).toBe(REASONS.FORBIDDEN_URL)
    }
  })

  it('un tip de bloc necunoscut e clasificat ca atare, fără să expună tipul brut', () => {
    const testCase = invalidCases().find((c) => c.name === 'unknown_block_type')
    const err = decodeError(testCase.payload)
    expect(err.reason).toBe(REASONS.UNKNOWN_BLOCK)
    expect(JSON.stringify(err.issues)).not.toContain('holo')
  })
})

// ── 2. Versiune și hash ────────────────────────────────────────────────────────────────────
describe('envelope și versiune', () => {
  it.each([
    ['fără schema_version', (p) => delete p.schema_version],
    ['major necunoscut', (p) => (p.schema_version = 'web-view.v3')],
    ['versiune non-string', (p) => (p.schema_version = 2)],
  ])('%s → unsupported_version', (_label, mutate) => {
    const payload = shell()
    mutate(payload)
    expect(decodeError(payload).code).toBe(CODES.UNSUPPORTED_VERSION)
  })

  it('un payload v1 nu e convertit și nu e detectat euristic', () => {
    const v1 = {
      content: 'Îți recomand serul X.',
      products: [{ id: 'p1', name: 'Ser X', price: '89,00 lei' }],
      suggestions: ['Vreau altceva'],
    }
    const err = decodeError(v1)
    expect(err.code).toBe(CODES.UNSUPPORTED_VERSION)
  })

  it.each([
    ['null', null],
    ['array', []],
    ['string', '{}'],
    ['number', 7],
  ])('input %s → invalid_payload', (_label, input) => {
    const err = decodeError(input)
    expect(err.code).toBe(CODES.INVALID_PAYLOAD)
    expect(err.reason).toBe(REASONS.NOT_AN_OBJECT)
  })

  it('hashul buildului e cel publicat de backend', () => {
    expect(WEB_VIEW_V2_SCHEMA_HASH).toBe(BACKEND_PUBLISHED_SCHEMA_HASH)
    expect(WEB_VIEW_V2_SCHEMA_VERSION).toBe('web-view.v2')
  })

  it('sha256 al fișierului de schemă ESTE hashul contractului', () => {
    const bytes = readFileSync(SCHEMA_PATH)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(BACKEND_PUBLISHED_SCHEMA_HASH)
  })

  it('hash anunțat diferit → schema_hash_mismatch, fără fallback pe v1', () => {
    const err = decodeError(shell(), { expectedSchemaHash: 'f'.repeat(64) })
    expect(err.code).toBe(CODES.SCHEMA_HASH_MISMATCH)
  })

  it('hash anunțat identic → acceptat; hash absent → nenegociat, acceptat', () => {
    expect(decodeWebViewV2(shell(), { expectedSchemaHash: WEB_VIEW_V2_SCHEMA_HASH })).toBeTruthy()
    expect(decodeWebViewV2(shell())).toBeTruthy()
  })

  it('hashul se verifică ÎNAINTE de conținut: un payload stricat cu hash greșit raportează hashul', () => {
    const err = decodeError({ ...shell(), conversation: { id: 'c' } }, { expectedSchemaHash: 'x' })
    expect(err.code).toBe(CODES.SCHEMA_HASH_MISMATCH)
  })
})

// ── 3. Opțiunile validatorului, dovedite ───────────────────────────────────────────────────
describe('coerceTypes / useDefaults / removeAdditional sunt false', () => {
  it('nu convertește tipuri: număr-ca-string și string-ca-număr pică', () => {
    expect(decodeError(shell({ conversation: { id: 'c', revision: '1' } })).code).toBe(
      CODES.INVALID_PAYLOAD
    )
    expect(
      decodeError(withBlock({ id: 'b', type: 'text', text: 12 })).code
    ).toBe(CODES.INVALID_PAYLOAD)
  })

  it('nu parsează prețuri: „49,90 RON" rămâne text, iar 49.9 e respins', () => {
    const priced = (current) =>
      withBlock({
        id: 'b',
        type: 'product_list',
        items: [{ view_id: 'v', title: 'Ser', price: { current } }],
      })
    const decoded = decodeWebViewV2(priced('49,90 RON'))
    expect(decoded.messages[0].blocks[0].items[0].price.current).toBe('49,90 RON')
    expect(decodeError(priced(49.9)).code).toBe(CODES.INVALID_PAYLOAD)
  })

  it('nu completează defaults: `variant` omis rămâne absent după decodare', () => {
    const payload = withBlock({ id: 'b', type: 'text', text: 'ok' })
    const decoded = decodeWebViewV2(payload)
    expect('variant' in decoded.messages[0].blocks[0]).toBe(false)
    expect('tone' in decoded).toBe(false)
  })

  it('nu șterge proprietăți în plus: le respinge și le lasă în obiectul original', () => {
    const payload = withBlock({ id: 'b', type: 'text', text: 'ok', className: 'x' })
    expect(decodeError(payload).code).toBe(CODES.INVALID_PAYLOAD)
    expect(payload.messages[0].blocks[0].className).toBe('x')
  })
})

// ── 4. Enumuri vizuale ─────────────────────────────────────────────────────────────────────
describe('vocabulare închise', () => {
  const enumCases = [
    ['tone', (v) => withBlock({ id: 'b', type: 'product_list', items: [{ view_id: 'v', title: 'T', badges: [{ label: 'B', tone: v }] }] }), 'success', 'promo'],
    ['appearance', (v) => withBlock({ id: 'b', type: 'action_row', actions: [{ id: 'a', label: 'L', appearance: v, activation: { type: 'submit', token: 'tk' } }] }), 'primary', 'ghost'],
    ['icon', (v) => withBlock({ id: 'b', type: 'action_row', actions: [{ id: 'a', label: 'L', icon: v, activation: { type: 'submit', token: 'tk' } }] }), 'truck', 'rocket'],
    ['variant', (v) => withBlock({ id: 'b', type: 'text', text: 'ok', variant: v }), 'lead', 'hero'],
    ['level', (v) => withBlock({ id: 'b', type: 'notice', level: v, text: 'ok' }), 'warning', 'critical'],
    ['role', (v) => shell({ messages: [{ id: 'm', role: v, blocks: [{ id: 'b', type: 'text', text: 'ok' }] }] }), 'user', 'system'],
    ['status', (v) => shell({ turn: { id: 't', client_turn_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', status: v } }), 'working', 'thinking'],
    ['target', (v) => withBlock({ id: 'b', type: 'action_row', actions: [{ id: 'a', label: 'L', activation: { type: 'navigate', href: '/p/x', target: v } }] }), '_blank', '_top'],
  ]

  it.each(enumCases)('%s: valoarea din vocabular trece, cea inventată pică', (_name, build, ok, bad) => {
    expect(decodeWebViewV2(build(ok))).toBeTruthy()
    expect(decodeError(build(bad)).code).toBe(CODES.INVALID_PAYLOAD)
  })
})

// ── 5. Limite: limit-1 / limit / limit+1 ───────────────────────────────────────────────────
describe('limitele contractului', () => {
  const at = (n, char = 'a') => char.repeat(n)

  const limitCases = [
    ['text (2000)', 2000, (n) => withBlock({ id: 'b', type: 'text', text: at(n) })],
    ['action label (40)', 40, (n) =>
      withBlock({ id: 'b', type: 'action_row', actions: [{ id: 'a', label: at(n), activation: { type: 'submit', token: 'tk' } }] })],
    ['url (2048)', 2048, (n) =>
      withBlock({ id: 'b', type: 'action_row', actions: [{ id: 'a', label: 'L', activation: { type: 'navigate', href: `https://x.ro/${at(n - 'https://x.ro/'.length)}` } }] })],
    ['opaque id (128)', 128, (n) => withBlock({ id: at(n), type: 'text', text: 'ok' })],
  ]

  it.each(limitCases)('%s: limită-1 și limită trec, limită+1 pică', (_name, limit, build) => {
    expect(decodeWebViewV2(build(limit - 1))).toBeTruthy()
    expect(decodeWebViewV2(build(limit))).toBeTruthy()
    expect(decodeError(build(limit + 1)).code).toBe(CODES.INVALID_PAYLOAD)
  })

  const arrayCases = [
    ['produse (max 6)', 6, (n) =>
      withBlock({ id: 'b', type: 'product_list', items: Array.from({ length: n }, (_, i) => ({ view_id: `v${i}`, title: 'T' })) })],
    ['blocuri/mesaj (max 12)', 12, (n) =>
      shell({ messages: [{ id: 'm', role: 'assistant', blocks: Array.from({ length: n }, (_, i) => ({ id: `b${i}`, type: 'text', text: 'ok' })) }] })],
    ['mesaje (max 4)', 4, (n) =>
      shell({ messages: Array.from({ length: n }, (_, i) => ({ id: `m${i}`, role: 'assistant', blocks: [{ id: `b${i}`, type: 'text', text: 'ok' }] })) })],
    ['badge-uri (max 3)', 3, (n) =>
      withBlock({ id: 'b', type: 'product_list', items: [{ view_id: 'v', title: 'T', badges: Array.from({ length: n }, (_, i) => ({ label: `b${i}` })) }] })],
    ['acțiuni/rând (max 4)', 4, (n) =>
      withBlock({ id: 'b', type: 'action_row', actions: Array.from({ length: n }, (_, i) => ({ id: `a${i}`, label: 'L', activation: { type: 'submit', token: 'tk' } })) })],
  ]

  it.each(arrayCases)('%s: la limită trece, peste limită pică', (_name, limit, build) => {
    expect(decodeWebViewV2(build(limit))).toBeTruthy()
    expect(decodeError(build(limit + 1)).code).toBe(CODES.INVALID_PAYLOAD)
  })

  it('colecțiile cu minim nu pot fi goale', () => {
    expect(decodeError(withBlock({ id: 'b', type: 'product_list', items: [] })).code).toBe(
      CODES.INVALID_PAYLOAD
    )
    expect(
      decodeError(shell({ messages: [{ id: 'm', role: 'assistant', blocks: [] }] })).code
    ).toBe(CODES.INVALID_PAYLOAD)
  })

  it('lungimea se măsoară în coduri punct, nu în unități UTF-16', () => {
    // 2000 emoji = 4000 unități UTF-16. Dacă `maxLength` ar număra unități, textul ar fi respins
    // greșit — e testul care dovedește că helperul `ucs2length` inline funcționează.
    expect(decodeWebViewV2(withBlock({ id: 'b', type: 'text', text: '😀'.repeat(2000) }))).toBeTruthy()
    expect(decodeError(withBlock({ id: 'b', type: 'text', text: '😀'.repeat(2001) })).code).toBe(
      CODES.INVALID_PAYLOAD
    )
  })
})

// ── 6. Adversarial ─────────────────────────────────────────────────────────────────────────
describe('adversarial', () => {
  it('`javascript:` și `data:` sunt respinse oriunde apar în contract', () => {
    const hostile = ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<script>', 'vbscript:x', 'blob:https://x', 'about:blank', '//evil.ro/x', 'http://evil.ro', 'java\nscript:alert(1)', 'https:/\\evil.ro']
    for (const href of hostile) {
      const err = decodeError(
        withBlock({ id: 'b', type: 'action_row', actions: [{ id: 'a', label: 'L', activation: { type: 'navigate', href } }] })
      )
      expect(err.code).toBe(CODES.INVALID_PAYLOAD)
    }
    for (const src of ['data:image/svg+xml,<svg onload=alert(1)>', 'javascript:0']) {
      const err = decodeError(
        withBlock({ id: 'b', type: 'product_list', items: [{ view_id: 'v', title: 'T', image: { src, alt: 'A' } }] })
      )
      expect(err.code).toBe(CODES.INVALID_PAYLOAD)
    }
  })

  it('URL-urile permise de contract trec neschimbate', () => {
    for (const href of ['https://demo.nativextech.com/p/ser', '/cart', '/p/ser?ref=abc#top']) {
      const decoded = decodeWebViewV2(
        withBlock({ id: 'b', type: 'action_row', actions: [{ id: 'a', label: 'L', activation: { type: 'navigate', href } }] })
      )
      expect(decoded.messages[0].blocks[0].actions[0].activation.href).toBe(href)
    }
  })

  it('`<script>` în TEXT rămâne text — escaparea e treaba rendererului, nu a decoderului', () => {
    const raw = '<script>alert(1)</script> & "citat"'
    const decoded = decodeWebViewV2(withBlock({ id: 'b', type: 'text', text: raw }))
    expect(decoded.messages[0].blocks[0].text).toBe(raw)
  })

  it('`__proto__` și `constructor` nu poluează și nu trec', () => {
    const payload = JSON.parse('{"schema_version":"web-view.v2","__proto__":{"polluted":true}}')
    expect(decodeError(payload).code).toBe(CODES.INVALID_PAYLOAD)
    expect({}.polluted).toBeUndefined()
    const withCtor = JSON.parse(JSON.stringify(withBlock({ id: 'b', type: 'text', text: 'ok' })))
    withCtor.messages[0].blocks[0].constructor = 'x'
    expect(decodeError(withCtor).code).toBe(CODES.INVALID_PAYLOAD)
  })

  it('NaN, Infinity, null-în-loc-de-array și nesting excesiv pică', () => {
    expect(decodeError(shell({ conversation: { id: 'c', revision: NaN } })).code).toBe(CODES.INVALID_PAYLOAD)
    expect(decodeError(shell({ conversation: { id: 'c', revision: Infinity } })).code).toBe(CODES.INVALID_PAYLOAD)
    expect(decodeError(shell({ conversation: { id: 'c', revision: -1 } })).code).toBe(CODES.INVALID_PAYLOAD)
    expect(decodeError(shell({ messages: null })).code).toBe(CODES.INVALID_PAYLOAD)
    let deep = { id: 'b', type: 'text', text: 'ok' }
    for (let i = 0; i < 200; i += 1) deep = { id: 'b', type: 'text', text: 'ok', nested: deep }
    expect(decodeError(withBlock(deep)).code).toBe(CODES.INVALID_PAYLOAD)
  })

  it('o acțiune nu poate fi simultan `submit` și `navigate`', () => {
    const both = withBlock({
      id: 'b',
      type: 'action_row',
      actions: [{ id: 'a', label: 'L', activation: { type: 'submit', token: 'tk', href: '/x' } }],
    })
    expect(decodeError(both).code).toBe(CODES.INVALID_PAYLOAD)
  })

  it('`client_turn_id` respectă formatul uuid', () => {
    const bad = shell({ turn: { id: 't', client_turn_id: 'nu-e-uuid', status: 'completed' } })
    expect(decodeError(bad).code).toBe(CODES.INVALID_PAYLOAD)
  })

  it('niciun sentinel din payload nu iese în eroare, în issues sau în diagnostic', () => {
    const S = 'SENTINEL-9d3f-secret'
    const payloads = [
      shell({ conversation: { id: S, revision: S } }),
      withBlock({ id: 'b', type: 'action_row', actions: [{ id: 'a', label: 'L', activation: { type: 'navigate', href: `javascript:${S}` } }] }),
      withBlock({ id: 'b', type: 'action_row', actions: [{ id: 'a', label: 'L', activation: { type: 'submit', token: S, extra: S } }] }),
      withBlock({ id: 'b', type: 'text', text: S, unknown_field: S }),
    ]
    for (const payload of payloads) {
      const diagnostics = []
      const err = decodeError(payload, { onDiagnostic: (d) => diagnostics.push(d) })
      const surface = [err.message, err.name, err.code, err.reason, JSON.stringify(err.issues), JSON.stringify(diagnostics), String(err.stack)].join('|')
      expect(surface).not.toContain(S)
      expect(surface).not.toContain('SENTINEL')
    }
  })

  it('diagnosticul e low-cardinality: doar outcome, reason, major și durată', () => {
    const seen = []
    decodeWebViewV2(shell(), { onDiagnostic: (d) => seen.push(d) })
    decodeError(shell({ messages: null }), { onDiagnostic: (d) => seen.push(d) })
    expect(seen.map((d) => Object.keys(d).sort())).toEqual([
      ['durationMs', 'outcome', 'reason', 'schemaMajor'],
      ['durationMs', 'outcome', 'reason', 'schemaMajor'],
    ])
    expect(seen.map((d) => d.outcome)).toEqual(['ok', 'error'])
    for (const d of seen) {
      expect(Object.values(REASONS)).toContain(d.reason)
      expect(d.schemaMajor).toBe('web-view.v2')
      expect(typeof d.durationMs).toBe('number')
    }
  })

  it('un callback de telemetrie stricat nu schimbă rezultatul', () => {
    const payload = shell()
    expect(
      decodeWebViewV2(payload, {
        onDiagnostic: () => {
          throw new Error('telemetria a crăpat')
        },
      })
    ).toBe(payload)
  })

  it('decodările succesive sunt independente: fără cache, fără stare globală', () => {
    const good = shell()
    expect(decodeWebViewV2(good)).toBe(good)

    const mutated = structuredClone(good)
    mutated.messages[0].blocks[0].type = 'holo_projection'
    expect(decodeError(mutated).reason).toBe(REASONS.UNKNOWN_BLOCK)

    // același obiect, reparat între apeluri: rezultatul urmează starea curentă, nu memoria
    mutated.messages[0].blocks[0].type = 'text'
    expect(decodeWebViewV2(mutated)).toBe(mutated)

    const second = decodeError(shell({ messages: null }))
    expect(second.issues.length).toBeGreaterThan(0)
    expect(decodeWebViewV2(good)).toBe(good)
  })
})

// ── 7. Artifacte generate și drift ─────────────────────────────────────────────────────────
describe('artifacte generate', () => {
  const generate = (args = []) =>
    execFileSync('node', ['scripts/generate-chat-contract-validator.mjs', ...args], {
      cwd: ROOT,
      encoding: 'utf8',
    })

  it('validatorul de pe disc corespunde schemei versionate', () => {
    expect(generate(['--check'])).toContain('corespunde schemei versionate')
  })

  it('generarea rulată de două ori produce byte-identic', () => {
    const before = readFileSync(VALIDATOR_PATH)
    try {
      generate()
      const first = readFileSync(VALIDATOR_PATH)
      generate()
      const second = readFileSync(VALIDATOR_PATH)
      expect(first.equals(second)).toBe(true)
      expect(first.equals(before)).toBe(true)
    } finally {
      writeFileSync(VALIDATOR_PATH, before)
    }
  })

  it('editarea schemei fără regenerare rupe check-ul', () => {
    const original = readFileSync(SCHEMA_PATH)
    try {
      const tampered = JSON.parse(original.toString('utf8'))
      tampered.properties.conversation = { type: 'object' }
      writeFileSync(SCHEMA_PATH, JSON.stringify(tampered), 'utf8')
      expect(() => generate(['--check'])).toThrow()
    } finally {
      writeFileSync(SCHEMA_PATH, original)
    }
    expect(generate(['--check'])).toContain('corespunde schemei versionate')
  })

  it('validatorul generat nu depinde de `ajv` la runtime', () => {
    const source = readFileSync(VALIDATOR_PATH, 'utf8')
    expect(source).not.toMatch(/\brequire\s*\(/)
    expect(source).not.toMatch(/from\s*['"]ajv/)
    expect(source).not.toMatch(/import\s+.*['"]ajv/)
  })

  it('fixturile sunt copii nemodificate ale celor din backend', () => {
    const manifest = readJson(join(FIXTURES, 'manifest.json'))
    expect(manifest.schema_sha256).toBe(BACKEND_PUBLISHED_SCHEMA_HASH)
    for (const [name, expected] of Object.entries(manifest.fixtures)) {
      const actual = createHash('sha256').update(readFileSync(join(FIXTURES, name))).digest('hex')
      expect(actual, `${name} a fost editat manual`).toBe(expected)
    }
  })
})
