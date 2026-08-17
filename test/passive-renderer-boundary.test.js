// NX-244 — boundary-ul, ca test. ESLint prinde importurile scrise cu alias; aici verificăm ce un
// tipar de cale nu poate: importuri relative care ies din `src/chat/**` (rezolvate, nu potrivite
// textual) și urmele de logică de domeniu în sursă.
//
// De ce test și nu doar review: fiecare regulă de mai jos a fost, în v1, cod real care părea
// rezonabil în momentul scrierii. `inferBadgeTone` a apărut fiindcă un badge arăta gri și cineva a
// vrut să-l facă roșu. Calculul procentului a apărut fiindcă backendul nu trimitea `discount`.
// Nimeni nu s-a trezit dimineața hotărât să pună regulile comerciale în browser — au intrat câte
// una, ca fix mic. Un test le refuză pe toate deodată, inclusiv pe cea de săptămâna viitoare.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BLOCK_RENDERERS } from '@/chat/components/BlockRenderer.jsx'
import { WEB_VIEW_V2_BLOCK_TYPES } from '@/chat/contract/generated/webViewV2SchemaHash.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CHAT_DIR = join(ROOT, 'src', 'chat')
/** Cod emis de AJV: verificat prin regenerare, nu prin lint/scan. */
const GENERATED = join(CHAT_DIR, 'contract', 'generated')

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (full === GENERATED) continue
      out.push(...walk(full))
    } else if (/\.(js|jsx)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

const FILES = walk(CHAT_DIR).map((path) => ({
  path,
  rel: relative(ROOT, path).replace(/\\/g, '/'),
  source: readFileSync(path, 'utf8'),
}))

/**
 * Codul EXECUTABIL: fără comentarii și fără string-uri. Fișierele astea își documentează pe larg
 * ce NU fac („nu se reintroduce `dangerouslySetInnerHTML`"), iar un scan pe sursa brută ar
 * raporta exact comentariul care promite contrariul.
 */
function strippedCode(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
}

/** `import … from '…'` / `export … from '…'` / `import('…')`, specifierul brut. */
function importSpecifiers(source) {
  const specifiers = []
  const patterns = [
    /(?:^|\n)\s*import[^'"\n]*?from\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*export[^'"\n]*?from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const pattern of patterns) {
    let match = pattern.exec(source)
    while (match !== null) {
      specifiers.push(match[1])
      match = pattern.exec(source)
    }
  }
  return specifiers
}

describe('frontiera src/chat/** — zero domeniu', () => {
  it('are fișiere de verificat (un scan gol ar trece degeaba)', () => {
    expect(FILES.length).toBeGreaterThan(10)
  })

  it('niciun import nu iese din src/chat/** către domeniu', () => {
    const escapes = []
    for (const file of FILES) {
      for (const specifier of importSpecifiers(file.source)) {
        if (specifier.startsWith('@/')) {
          // Aliasul e literal: orice `@/…` în afara `@/chat/` e domeniu.
          if (!specifier.startsWith('@/chat/')) escapes.push(`${file.rel} → ${specifier}`)
          continue
        }
        if (!specifier.startsWith('.')) continue // pachet npm (react, lucide-react)
        // Relativ: îl REZOLVĂM față de fișier. Asta prinde `../../components/store/ChatMessage`
        // fără să interzică `../components/WebViewRenderer.jsx`, care e tot în `src/chat`.
        const target = resolve(dirname(file.path), specifier)
        if (!target.startsWith(CHAT_DIR)) escapes.push(`${file.rel} → ${specifier}`)
      }
    }
    expect(escapes).toEqual([])
  })

  it('nu importă coșul, wishlistul, catalogul sau componentele v1', () => {
    const forbidden = [
      '@/lib/cart',
      '@/lib/wishlist',
      '@/lib/brand',
      '@/lib/productContent',
      '@/api/catalog',
      '@/api/chatClient',
      '@/utils',
      'chatDemo',
      'ChatProductCard',
      'ChatMessage',
      'RichText',
      'ChatOffer',
    ]
    const hits = []
    for (const file of FILES) {
      for (const specifier of importSpecifiers(file.source)) {
        if (forbidden.some((needle) => specifier.includes(needle))) {
          hits.push(`${file.rel} → ${specifier}`)
        }
      }
    }
    expect(hits).toEqual([])
  })
})

describe('frontiera src/chat/** — zero calcul comercial', () => {
  /**
   * Fiecare tipar e o linie de cod care CHIAR a existat în v1, cu locul ei. Comentariile pot
   * pomeni numele (ăsta e un fișier de test care le enumeră), deci scanăm codul fără comentarii.
   */
  const FORBIDDEN_CODE = [
    ['Intl.NumberFormat', /\bIntl\s*\.\s*NumberFormat\b/],
    ['Number( — parsare de preț', /\bNumber\s*\(/],
    ['parseFloat/parseInt pe date comerciale', /\bparse(?:Float|Int)\s*\(/],
    ['Math.round — procent de reducere calculat local', /\bMath\s*\.\s*(?:round|floor|ceil)\s*\(/],
    ['toLocaleString — formatare de bani', /\btoLocaleString\s*\(/],
    ['toFixed — zecimale de preț', /\btoFixed\s*\(/],
    ['inferBadgeTone — ton dedus din etichetă', /inferBadgeTone/],
    ['discountPct — reducere derivată', /discountPct/],
    ['THINKING_STEPS — progres simulat', /THINKING_STEPS/],
    ['addToCart — mutație locală', /\baddToCart\b/],
    ['toggleWish — mutație locală', /\btoggleWish\b/],
    ['localStorage direct în renderer', /\blocalStorage\b/],
  ]

  // `session/` și `state/` țin timere, backoff și storage — au voie la aritmetică și la
  // `localStorage`; ele nu randează nimic. Frontiera comercială e a rendererului.
  const RENDER_FILES = FILES.filter(
    (file) => file.rel.startsWith('src/chat/components/') || file.rel.startsWith('src/chat/v2/'),
  )

  it('acoperă chiar fișierele de randare', () => {
    expect(RENDER_FILES.length).toBeGreaterThan(12)
  })

  for (const [label, pattern] of FORBIDDEN_CODE) {
    it(`nu conține ${label}`, () => {
      const hits = RENDER_FILES.filter((file) => pattern.test(strippedCode(file.source))).map(
        (file) => file.rel,
      )
      expect(hits).toEqual([])
    })
  }

  it('nu inventează copy comercial (monedă, stoc, rută de coș)', () => {
    // Defaults pe care cardul le numește explicit. Le căutăm în TEXTUL afișabil, deci în string-uri.
    const FORBIDDEN_COPY = [/['"]RON['"]/, /['"]\/Cart['"]/, /În stoc/, /Adaugă în coș/]
    const hits = []
    for (const file of RENDER_FILES) {
      const code = file.source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
      for (const pattern of FORBIDDEN_COPY) {
        if (pattern.test(code)) hits.push(`${file.rel} → ${pattern}`)
      }
    }
    expect(hits).toEqual([])
  })

  it('nu folosește dangerouslySetInnerHTML', () => {
    const hits = FILES.filter((file) => strippedCode(file.source).includes('dangerouslySetInnerHTML'))
    expect(hits.map((file) => file.rel)).toEqual([])
  })
})

describe('registryul e exhaustiv pentru schema negociată', () => {
  it('acoperă exact tipurile din allowlistul generat din schemă', () => {
    // Sursa de adevăr e schema, nu schița din card (care omitea `divider`). Un tip valid fără
    // componentă ar fi invariant error în producție — aici pică la build.
    expect(Object.keys(BLOCK_RENDERERS).sort()).toEqual([...WEB_VIEW_V2_BLOCK_TYPES].sort())
  })

  it('fiecare intrare e o componentă, nu un nume primit din rețea', () => {
    for (const [type, Component] of Object.entries(BLOCK_RENDERERS)) {
      expect(typeof Component, `block.type=${type}`).toBe('function')
    }
  })
})
