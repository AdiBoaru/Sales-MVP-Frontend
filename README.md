# Aria — magazin de cosmetice

Storefront public (vizitatori anonimi) construit cu **Vite + React + Tailwind**, peste:
- **Supabase** — catalog read-only (anon key + RLS public-read). Vezi `src/api/catalog.js`.
- **Bot „izi" / „Aria"** — asistent de chat (`src/api/chatClient.js`, widget în `src/components/store/ChatWidget.jsx`).
- **Coș + checkout** pe `localStorage` (`src/lib/cart.js`, `src/api/localEntities.js`), cu ecran QR.

Pentru detaliile de arhitectură și deploy, vezi [IMPLEMENTATION.md](./IMPLEMENTATION.md).

## Dezvoltare locală

```bash
npm install
cp .env.example .env.local   # apoi completează valorile reale
npm run dev
```

Variabile de mediu (toate `VITE_*`, injectate la build time):

| Variabilă | Rol |
|---|---|
| `VITE_SUPABASE_URL` | URL-ul proiectului Supabase |
| `VITE_SUPABASE_ANON_KEY` | cheia anon publică (gate-uită de RLS) |
| `VITE_CHAT_API_BASE` | **gol în dev** (folosește proxy-ul `/web` din `vite.config.js`); în prod = originea botului |
| `VITE_CHAT_PUBLIC_TOKEN` | tokenul public al botului de chat |
| `VITE_CHAT_PROTOCOL_V2` | `"1"` pornește protocolul de chat v2 (NX-243). **Gol/absent = OFF**, iar v1 rămâne singura cale activă până la cutoverul NX-249. |

> Fără `.env.local`, catalogul e gol și chatul afișează un mesaj de fallback — restul aplicației funcționează.

### Protocolul de chat: v1 (activ) vs. v2 (NX-243, OFF implicit)

Comutarea e **explicită la build**, nu detectată din răspuns — un client care ghicește protocolul
din payload va ghici greșit exact în ziua migrării.

| | v1 (implicit) | v2 (`VITE_CHAT_PROTOCOL_V2=1`) |
|---|---|---|
| Rută | `POST /web/chat`, sincron | `POST /web/v2/turns` (accept) + `GET /web/v2/turns/{id}` (status/rezultat) + SSE opțional |
| Transcript | oglindit în `localStorage` | **niciodată local** — vine din backend; local stă doar un record tehnic (sesiune + id-uri opace) |
| Turnul | un boolean `sending` | mașină de stare cu `client_turn_id` idempotent, recovery după timeout/refresh/offline/alt tab |
| Randare | componentele v1 | ViewModel `web-view.v2` display-ready, validat de decoderul strict NX-242 |

Cere pe bot `WEB_TURN_V2_ENABLED=true` (altfel rutele răspund `404`) și, pentru stream,
`WEB_TURN_SSE_ENABLED=true`. Fără SSE clientul face polling la cadența trimisă de server
(`poll_after_ms`) — nu la una aleasă local.

## Comenzi

| Comandă | Ce face |
|---|---|
| `npm run dev` | server de dezvoltare Vite |
| `npm run build` | build de producție în `dist/` |
| `npm run preview` | preview local al build-ului |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run typecheck` | verificare de tipuri (`tsc -p jsconfig.json`) |

## Deploy

Push pe `main` declanșează `.github/workflows/deploy.yml` (build cu `VITE_*` din GitHub secrets → FTPS spre Hostinger). Secrets necesare: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CHAT_API_BASE`, `VITE_CHAT_PUBLIC_TOKEN`, `FTP_HOST`, `FTP_USERNAME`, `FTP_PASSWORD`. Detalii în [IMPLEMENTATION.md §10](./IMPLEMENTATION.md).
