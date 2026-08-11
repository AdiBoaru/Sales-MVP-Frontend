#!/usr/bin/env node
// NX-242 — generează validatorul `web-view.v2` din JSON Schema publicată de backend (NX-228).
//
// De ce un generator și nu o schemă rescrisă de mână (Zod/Yup): o a doua definiție a
// contractului e o a doua sursă de adevăr, care diverge tăcut la primul câmp nou. Aici există
// un singur artifact — `schema/web-view.v2.schema.json`, copiat byte-cu-byte din backend — iar
// tot ce consumă runtime-ul e DERIVAT din el, determinist.
//
// Rulare:
//   node scripts/generate-chat-contract-validator.mjs           # scrie fișierele generate
//   node scripts/generate-chat-contract-validator.mjs --check    # eșuează dacă diferă de disc
//
// Fără rețea, fără API, fără LLM. Singurul input e fișierul de schemă versionat.

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import Ajv2020 from 'ajv/dist/2020.js'
import standaloneCode from 'ajv/dist/standalone/index.js'
import { fullFormats } from 'ajv-formats/dist/formats.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONTRACT_DIR = join(ROOT, 'src', 'chat', 'contract')
const SCHEMA_PATH = join(CONTRACT_DIR, 'schema', 'web-view.v2.schema.json')
const GENERATED_DIR = join(CONTRACT_DIR, 'generated')
const VALIDATOR_PATH = join(GENERATED_DIR, 'webViewV2Validator.js')
const HASH_PATH = join(GENERATED_DIR, 'webViewV2SchemaHash.js')

// Versiunea majoră e în NUME (NX-228: `VIEW_SCHEMA_VERSION`), nu într-un câmp numeric.
const SCHEMA_VERSION = 'web-view.v2'

// Numele proprietăților care poartă un URL în contractul v2. Sunt DECLARATE aici și verificate
// contra schemei mai jos: dacă backendul redenumește/adaugă un câmp de URL, generarea pică în loc
// să livreze un guard care nu mai acoperă nimic.
const URL_PROPERTY_NAMES = ['href', 'src']

const die = (msg) => {
  console.error(`generate-chat-contract-validator: ${msg}`)
  process.exit(1)
}

// ── Canonicalizare identică cu backendul ───────────────────────────────────────────────────
// `json.dumps(schema, sort_keys=True, separators=(",", ":"), ensure_ascii=False)`
// (`src/web/contracts_v2.py::_canonical`). Cheile se sortează pe COD PUNCT, ca în Python —
// `Array.prototype.sort` compară unități UTF-16, ceea ce diferă pentru chei din afara BMP.
function compareCodePoints(a, b) {
  const ca = Array.from(a)
  const cb = Array.from(b)
  for (let i = 0; i < Math.min(ca.length, cb.length); i += 1) {
    const d = ca[i].codePointAt(0) - cb[i].codePointAt(0)
    if (d !== 0) return d
  }
  return ca.length - cb.length
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const keys = Object.keys(value).sort(compareCodePoints)
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`
}

// ── Introspecția schemei ───────────────────────────────────────────────────────────────────
function collectStringProps(node, path, out) {
  if (Array.isArray(node)) {
    node.forEach((item, i) => collectStringProps(item, `${path}/${i}`, out))
    return
  }
  if (!node || typeof node !== 'object') return
  if (node.properties && typeof node.properties === 'object') {
    for (const [name, sub] of Object.entries(node.properties)) {
      if (sub && typeof sub === 'object' && typeof sub.maxLength === 'number') {
        out.push({ name, maxLength: sub.maxLength, path: `${path}/properties/${name}` })
      }
    }
  }
  for (const [key, sub] of Object.entries(node)) {
    collectStringProps(sub, `${path}/${key}`, out)
  }
}

function knownBlockTypes(schema) {
  const items = schema?.$defs?.MessageView?.properties?.blocks?.items
  const mapping = items?.discriminator?.mapping
  if (!mapping || typeof mapping !== 'object') {
    die('schema: nu am găsit `$defs.MessageView.properties.blocks.items.discriminator.mapping`')
  }
  if (!Array.isArray(items.oneOf) || items.oneOf.length !== Object.keys(mapping).length) {
    die('schema: `oneOf`-ul blocurilor nu corespunde 1:1 cu `discriminator.mapping`')
  }
  return Object.keys(mapping).sort(compareCodePoints)
}

// Suprafața de URL: fiecare nume declarat trebuie să existe, toate ocurențele lui trebuie să aibă
// aceeași limită, iar acea limită nu are voie să apară pe alt nume de proprietate — altfel un câmp
// de URL nou ar trece pe lângă guard fără ca nimeni să observe.
function urlSurface(schema) {
  const props = []
  collectStringProps(schema, '#', props)
  const limits = new Set()
  for (const name of URL_PROPERTY_NAMES) {
    const hits = props.filter((p) => p.name === name)
    if (hits.length === 0) die(`schema: proprietatea de URL \`${name}\` nu mai există`)
    for (const hit of hits) limits.add(hit.maxLength)
  }
  if (limits.size !== 1) die(`schema: câmpurile de URL au limite diferite (${[...limits]})`)
  const urlMaxLength = [...limits][0]
  const intruders = props.filter(
    (p) => p.maxLength === urlMaxLength && !URL_PROPERTY_NAMES.includes(p.name)
  )
  if (intruders.length > 0) {
    die(
      `schema: proprietăți noi cu limita de URL (${urlMaxLength}) neacoperite de guard: ` +
        intruders.map((p) => p.path).join(', ')
    )
  }
  return { urlMaxLength }
}

// ── Codul inline pentru `ucs2length` ───────────────────────────────────────────────────────
// AJV emite `require("ajv/dist/runtime/ucs2length").default` pentru `maxLength`/`minLength`.
// Într-un fișier ESM `require` nu există, iar un import din `ajv` ar muta pachetul în runtime —
// exact ce interzice cardul. Înlocuim referința cu implementarea inline (AJV, MIT), ca fișierul
// generat să nu depindă de nimic. Substituția e ASERTATĂ: dacă AJV schimbă forma emisă, generarea
// pică în loc să livreze un fișier rupt.
const UCS2LENGTH_REQUIRE = 'require("ajv/dist/runtime/ucs2length").default'
const UCS2LENGTH_INLINE =
  '(function ucs2length(s){const l=s.length;let n=0,p=0,v;while(p<l){n++;v=s.charCodeAt(p++);' +
  'if(v>=0xd800&&v<=0xdbff&&p<l){v=s.charCodeAt(p);if((v&0xfc00)===0xdc00)p++}}return n})'

function buildValidatorSource(schema) {
  const ajv = new Ajv2020({
    strict: true,
    allErrors: false,
    coerceTypes: false,
    useDefaults: false,
    removeAdditional: false,
    validateFormats: true,
    code: { source: true, esm: true },
  })

  // `discriminator` e emis de Pydantic în stil OpenAPI (cu `mapping`), formă pe care AJV nu o
  // implementează. Îl declarăm ca adnotare fără efect: validarea rămâne pe `oneOf`, unde fiecare
  // ramură are `const` pe `type` + `additionalProperties:false`, deci un tip necunoscut nu
  // potrivește nicio ramură. Fără declarație, `strict:true` ar refuza să compileze schema.
  ajv.addKeyword({ keyword: 'discriminator', schemaType: 'object' })

  // `format: uuid` — exact regexul de referință din ajv-formats, nu unul rescris de mână.
  if (!(fullFormats.uuid instanceof RegExp)) die('ajv-formats: `uuid` nu mai e un RegExp')
  ajv.addFormat('uuid', fullFormats.uuid)

  const validate = ajv.compile(schema)
  let source = standaloneCode(ajv, validate)

  if (!source.includes(UCS2LENGTH_REQUIRE)) {
    die('AJV nu a mai emis referința `ucs2length` — verifică substituția înainte de a regenera')
  }
  source = source.split(UCS2LENGTH_REQUIRE).join(UCS2LENGTH_INLINE)

  if (/\brequire\s*\(/.test(source) || /\bfrom\s*['"]ajv/.test(source)) {
    die('codul generat încă depinde de `ajv` la runtime')
  }
  return source
}

// ── Emitere ────────────────────────────────────────────────────────────────────────────────
const banner = (schemaHash) =>
  [
    '/* eslint-disable */',
    '// @ts-nocheck',
    '// FIȘIER GENERAT — nu edita manual.',
    `// Sursă: src/chat/contract/schema/web-view.v2.schema.json (sha256 ${schemaHash})`,
    '// Regenerare: npm run chat:contract:generate · verificare drift: npm run chat:contract:check',
    '',
  ].join('\n')

function hashModule(schemaHash, blockTypes, urlMaxLength) {
  return [
    banner(schemaHash),
    '// Modul MIC și fără dependențe: transportul îl poate importa static (negocierea de',
    '// capabilitate din bootstrap) fără să tragă validatorul în chunkul widgetului.',
    `export const WEB_VIEW_V2_SCHEMA_VERSION = ${JSON.stringify(SCHEMA_VERSION)}`,
    `export const WEB_VIEW_V2_SCHEMA_HASH = ${JSON.stringify(schemaHash)}`,
    `export const WEB_VIEW_V2_BLOCK_TYPES = Object.freeze(${JSON.stringify(blockTypes)})`,
    `export const WEB_VIEW_V2_URL_PROPERTIES = Object.freeze(${JSON.stringify([...URL_PROPERTY_NAMES].sort(compareCodePoints))})`,
    `export const WEB_VIEW_V2_URL_MAX_LENGTH = ${urlMaxLength}`,
    '',
  ].join('\n')
}

function build() {
  const raw = readFileSync(SCHEMA_PATH, 'utf8')
  let schema
  try {
    schema = JSON.parse(raw)
  } catch {
    die('schema/web-view.v2.schema.json nu e JSON valid')
  }

  // Fișierul trebuie să fie EXACT forma canonică pe care o hash-uiește backendul. Dacă cineva îl
  // reformatează („l-am făcut lizibil"), sha256-ul fișierului nu mai e hashul contractului, iar
  // negocierea de capabilitate ar compara două lucruri diferite.
  const canonical = canonicalJson(schema)
  if (canonical !== raw) {
    die(
      'schema/web-view.v2.schema.json nu e în forma canonică a backendului ' +
        '(json.dumps sort_keys + separators fără spații). Re-sincronizează din backend.'
    )
  }

  const schemaHash = createHash('sha256').update(canonical, 'utf8').digest('hex')
  if (schema.properties?.schema_version?.const !== SCHEMA_VERSION) {
    die(`schema: \`schema_version.const\` nu mai e ${SCHEMA_VERSION}`)
  }

  const blockTypes = knownBlockTypes(schema)
  const { urlMaxLength } = urlSurface(schema)

  return {
    [VALIDATOR_PATH]: `${banner(schemaHash)}${buildValidatorSource(schema)}\n`,
    [HASH_PATH]: hashModule(schemaHash, blockTypes, urlMaxLength),
  }
}

const files = build()
const check = process.argv.includes('--check')

if (check) {
  let drift = false
  for (const [path, expected] of Object.entries(files)) {
    let actual = null
    try {
      actual = readFileSync(path, 'utf8')
    } catch {
      /* fișier lipsă = drift */
    }
    if (actual !== expected) {
      drift = true
      console.error(`DRIFT: ${path.slice(ROOT.length + 1)} diferă de regenerarea din schemă`)
    }
  }
  if (drift) {
    console.error('Rulează `npm run chat:contract:generate` și comite rezultatul.')
    process.exit(1)
  }
  console.log('chat contract: validatorul generat corespunde schemei versionate')
} else {
  mkdirSync(GENERATED_DIR, { recursive: true })
  for (const [path, content] of Object.entries(files)) {
    writeFileSync(path, content, 'utf8')
    console.log(`scris ${path.slice(ROOT.length + 1)} (${Buffer.byteLength(content)} bytes)`)
  }
}
