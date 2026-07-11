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

> Fără `.env.local`, catalogul e gol și chatul afișează un mesaj de fallback — restul aplicației funcționează.

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
