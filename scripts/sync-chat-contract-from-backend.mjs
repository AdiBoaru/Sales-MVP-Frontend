#!/usr/bin/env node
// NX-242 — sincronizează artifactele contractului `web-view.v2` din repo-ul backend (NX-228).
//
// Rulat MANUAL de întreținător, niciodată în CI: are nevoie de un checkout al backendului și de
// Python. CI-ul verifică doar ce e deja versionat aici (`npm run chat:contract:check` + testele
// de manifest), fără rețea și fără acces la celălalt repo.
//
//   node scripts/sync-chat-contract-from-backend.mjs --backend "D:/Work/Sales Ass"
//
// Copiază, în ordine deterministă:
//   1. JSON Schema canonică (exact bytes-ii pe care îi hash-uiește `schema_hash()`);
//   2. fixturile valide/invalide, byte-cu-byte;
//   3. `manifest.json` cu SHA-ul backendului și sha256-ul fiecărui fișier.
//
// Copy/paste manual e interzis tocmai pentru că nu lasă provenance: un fixture „ajustat ca să
// treacă testul" e un contract care nu mai descrie ce livrează serverul.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCHEMA_PATH = join(ROOT, 'src', 'chat', 'contract', 'schema', 'web-view.v2.schema.json')
const FIXTURE_DIR = join(ROOT, 'test', 'fixtures', 'web-v2')

const argIndex = process.argv.indexOf('--backend')
if (argIndex === -1 || !process.argv[argIndex + 1]) {
  console.error('folosire: node scripts/sync-chat-contract-from-backend.mjs --backend <cale-repo>')
  process.exit(1)
}
const BACKEND = process.argv[argIndex + 1]

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8' }).trim()

const backendSha = run('git', ['rev-parse', 'HEAD'], BACKEND)
const backendDirty = run('git', ['status', '--porcelain', '--', 'src/web', 'tests/fixtures'], BACKEND)
if (backendDirty) {
  console.error('backendul are modificări necomise în src/web sau tests/fixtures — oprit.')
  console.error('Sincronizează dintr-un checkout curat, altfel provenance-ul e o minciună.')
  process.exit(1)
}

// Schema: exact `_canonical(view_json_schema())`, adică fix bytes-ii peste care se calculează
// `schema_hash()`. Nu reformatăm: sha256-ul fișierului TREBUIE să fie hashul contractului.
const canonical = run(
  'python',
  [
    '-c',
    [
      'import sys; sys.path.insert(0, ".")',
      'from src.web.contracts_v2 import view_json_schema, _canonical',
      'sys.stdout.reconfigure(encoding="utf-8", newline="")',
      'sys.stdout.write(_canonical(view_json_schema()))',
    ].join('\n'),
  ],
  BACKEND
)
writeFileSync(SCHEMA_PATH, canonical, 'utf8')

const publishedHash = run(
  'python',
  ['-c', 'import sys; sys.path.insert(0, "."); from src.web.contracts_v2 import schema_hash; print(schema_hash())'],
  BACKEND
)
if (sha256(Buffer.from(canonical, 'utf8')) !== publishedHash) {
  console.error('sha256(schema copiată) != schema_hash() publicat de backend — oprit.')
  process.exit(1)
}

mkdirSync(FIXTURE_DIR, { recursive: true })
const fixtures = ['valid_views.json', 'invalid_views.json']
const entries = {}
for (const name of fixtures) {
  // BLOB-ul din git, nu fișierul din working tree: cu `core.autocrlf=true` (Windows) checkoutul
  // livrează CRLF, iar o „copie byte-cu-byte" de pe disc ar înregistra un sha256 care nu există
  // în niciun repo. `git show` dă exact bytes-ii versionați.
  const buf = execFileSync('git', ['show', `${backendSha}:tests/fixtures/web_v2/${name}`], {
    cwd: BACKEND,
    maxBuffer: 32 * 1024 * 1024,
  })
  writeFileSync(join(FIXTURE_DIR, name), buf)
  entries[name] = sha256(buf)
}

const manifest = {
  _note: 'GENERAT de scripts/sync-chat-contract-from-backend.mjs — nu edita manual.',
  backend_repo: 'Sales Ass',
  backend_sha: backendSha,
  schema_file: 'src/chat/contract/schema/web-view.v2.schema.json',
  schema_sha256: publishedHash,
  fixtures: entries,
}
writeFileSync(join(FIXTURE_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

console.log(`backend ${backendSha}`)
console.log(`schema  ${publishedHash}`)
for (const [name, hash] of Object.entries(entries)) console.log(`fixture ${name} ${hash}`)
console.log('Rulează acum: npm run chat:contract:generate')
