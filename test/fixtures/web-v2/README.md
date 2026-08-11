# Fixturi `web-view.v2` — copii ale backendului

**Nu edita niciun fișier din acest director.** Sunt copii byte-cu-byte din repo-ul `Sales Ass`,
iar `manifest.json` le ține sha256-ul. Un fixture „ajustat ca să treacă testul" e un contract care
nu mai descrie ce livrează serverul — exact defectul pe care suita îl caută.

## Provenance

| Ce | De unde |
|---|---|
| `valid_views.json` | `Sales Ass:tests/fixtures/web_v2/valid_views.json` |
| `invalid_views.json` | `Sales Ass:tests/fixtures/web_v2/invalid_views.json` |
| `../../../src/chat/contract/schema/web-view.v2.schema.json` | `Sales Ass:src/web/contracts_v2.py::view_json_schema()`, serializat cu `_canonical()` |

SHA-ul backendului și hashurile exacte sunt în [`manifest.json`](manifest.json).

Resincronizare (manual, niciodată în CI — cere checkout de backend și Python):

```powershell
node scripts/sync-chat-contract-from-backend.mjs --backend "D:/Work/Sales Ass"
npm run chat:contract:generate
npm test -- --run test/chat-contract-v2.test.js
```

Fișierul de schemă e păstrat în forma **canonică** a backendului
(`json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False)`), nu „frumos formatat":
`sha256(fișier)` TREBUIE să fie identic cu `schema_hash()` publicat de backend, fiindcă acela e
hashul negociat la bootstrap. Generatorul refuză să pornească dacă fișierul a fost reformatat.

## Ce acoperă decoderul și ce NU

`decodeWebViewV2` validează **JSON Schema** (forma) plus **allowlistul de URL**. Allowlistul e
adăugat pentru că NX-228 îl documentează explicit ca gaură: el trăiește într-un `model_validator`
Pydantic, deci **nu apare în JSON Schema**, iar un client care ar valida doar cu schema ar accepta
`javascript:`. Guardul respinge, nu repară.

Restul invarianților din `model_validator` rămân **server-owned**. Ei sunt semantici — „e un
răspuns?", „se aliniază tabelul cu headerele?", „are sens `error` pe `completed`?" — iar
reimplementarea lor în browser ar reface exact al doilea motor conversațional pe care NX-242 îl
desființează. Sunt testați în backend (`tests/test_web_contract_v2.py`) și verificați cross-repo,
pe serverul real, de NX-247.

Cazurile din `invalid_views.json` care trec de decoder sunt **pinuite** în
`test/chat-contract-v2.test.js` (`SERVER_OWNED_GAPS`): dacă backendul adaugă un caz nou,
clasificarea pică și cineva decide conștient în ce categorie intră. Gaura e zgomotoasă, nu tăcută.
