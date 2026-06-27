# Documentație de implementare — Sales MVP / Beauty Shop

> **Scopul acestui document:** referință completă a felului în care a fost construit
> site-ul actual, ca să putem reface designul (proiect nou) **fără să pierdem părțile
> grele**: integrarea Supabase, botul de chat „izi", pipeline-ul de deploy și logica de
> magazin. Designul (UI) se reface; *backend-ul și wiring-ul de mai jos se păstrează*.
>
> Tot ce e cod, nume de fișiere, variabile, coloane de DB și URL-uri este redat **exact**.

---

## Cuprins

1. [Rezumat în 30 de secunde](#1-rezumat-în-30-de-secunde)
2. [Stack & topologie](#2-stack--topologie)
3. [Structura proiectului](#3-structura-proiectului)
4. [Routing & layout](#4-routing--layout)
5. [Stratul de date](#5-stratul-de-date)
6. [Storefront (magazinul)](#6-storefront-magazinul)
7. [Chat „izi" (asistentul AI)](#7-chat-izi-asistentul-ai)
8. [Admin panel](#8-admin-panel)
9. [Brand, limbă & monedă](#9-brand-limbă--monedă)
10. [Build & deploy](#10-build--deploy)
11. [Limitări cunoscute & decizii pentru noul site](#11-limitări-cunoscute--decizii-pentru-noul-site)
12. [Plan de reconstrucție](#12-plan-de-reconstrucție)

---

## 1. Rezumat în 30 de secunde

- **Origine:** proiectul a fost generat inițial de **base44** (se vede după schelet:
  `src/api/entities.js`, `src/api/integrations.js`, `pages.config.js`, `Layout.jsx`,
  folderul complet `components/ui/` shadcn, aliasul `@/`).
- **Peste scheletul base44** s-au adăugat manual lucrurile reale și valoroase:
  - catalog **live din Supabase** (read-only, anon key + RLS public-read);
  - **chat „izi"** legat de un bot Python pe VPS;
  - **storefront** în stil eMAG (Shop, ProductDetail, Cart, Ghid);
  - **deploy automat** pe Hostinger prin GitHub Actions (FTPS).
- **Asimetrie importantă:** catalogul de produse e **real** (Supabase), dar coșul și
  comenzile sunt **doar în `localStorage`** (stub base44). Vezi §11.

---

## 2. Stack & topologie

### Tehnologii frontend
- **Vite 6** + **React 18** (JSX, nu TypeScript — există doar `src/utils/index.ts`).
- **Tailwind CSS 3** + **shadcn/ui** (Radix + `class-variance-authority` + `tailwind-merge`).
- **react-router-dom 6** pentru routing.
- **@tanstack/react-query 5** (configurat, dar storefront-ul folosește mai mult `useEffect` direct).
- **framer-motion** (animații), **lucide-react** (iconițe), **@supabase/supabase-js**.
- Dependențe rămase din template (Stripe, leaflet, three, quill, recharts etc.) sunt în
  mare parte **nefolosite** — pot fi tăiate la rebuild.

### Cele 3 piese din producție
```
┌─────────────────────────┐     HTTPS (REST)      ┌──────────────────────────┐
│  Frontend (static)      │ ───────────────────▶  │  Supabase                │
│  Vite build → dist/     │   anon key + RLS      │  proiect: xfczucwqntefe… │
│  Hostinger shared host  │                       │  tabele: products,       │
│  https://shop.native…   │                       │  product_images, …       │
└───────────┬─────────────┘                       └──────────────────────────┘
            │  HTTPS  /web/bootstrap + /web/chat
            ▼
┌─────────────────────────┐
│  Bot „izi" (Python)     │
│  pipeline pe VPS        │
│  https://bot.native…    │
└─────────────────────────┘
```

### Domenii reale (din `vite.config.js` și `.github/workflows/deploy.yml`)
| Rol | URL |
|---|---|
| Magazin (frontend) | `https://shop.nativextech.com` |
| Bot de chat | `https://bot.nativextech.com` |
| Supabase | `https://xfczucwqntefethxxien.supabase.co` |

---

## 3. Structura proiectului

### Schelet base44 (generat — îl recunoști oriunde)
- `src/api/entities.js` — instanțiază „entități" CRUD din scheme JSON.
- `src/api/integrations.js` — stub-uri pentru `InvokeLLM`, `SendEmail`, `UploadFile`.
- `src/api/client.js` — `createEntityClient()`, un store CRUD pe `localStorage`.
- `src/pages.config.js` — **auto-generat**: înregistrează paginile din `src/pages/`.
- `src/Layout.jsx` — layout global (sidebar admin / full-width storefront).
- `src/App.jsx` — montează routerul pe baza `pages.config`.
- `src/components/ui/**` — set complet shadcn/ui (≈50 componente, stock).
- `src/utils/index.ts` — `createPageUrl`, `formatCurrency`, `formatDate`.
- `@/` → `src/` (alias în `vite.config.js` + `jsconfig.json`).

### Adăugat manual peste base44 (partea valoroasă)
| Fișier | Rol |
|---|---|
| `src/api/supabaseClient.js` | clientul Supabase (anon key) |
| `src/api/catalog.js` | API read-only pe catalog + **clasificarea pe categorii** |
| `src/api/chatClient.js` | transportul către botul izi |
| `src/components/shop/EmagNavbar.jsx` | navbar magazin |
| `src/components/shop/EmagHeroBanner.jsx` | carusel hero |
| `src/components/shop/EmagCategorySidebar.jsx` | sidebar categorii |
| `src/components/shop/ProductCard.jsx` | cardul de produs (grilă) |
| `src/components/shop/IziChatWidget.jsx` | widget-ul de chat |
| `src/pages/Shop.jsx` | lista de produse + filtrare/paginare |
| `src/pages/ProductDetail.jsx` | pagina de produs (`/product/:id`) |
| `src/pages/Cart.jsx` | coș + checkout + ecran QR |
| `src/pages/Ghid.jsx` | landing „Cum funcționează" |
| `src/lib/brand.js` | identitatea de brand (un singur loc) |
| `.github/workflows/deploy.yml` | CI/CD spre Hostinger |

---

## 4. Routing & layout

### `pages.config.js` (convenție base44)
Paginile se înregistrează prin cheie → componentă. `mainPage` e pagina implicită.
Configurația actuală:
```js
export const PAGES = {
    "Shop": Shop,
    "Cart": Cart,
    "Ghid": Ghid,
    "AdminProducts": AdminProducts,   // src/pages/Products.jsx
    "AdminOrders": AdminOrders,       // src/pages/Orders.jsx
    "AdminCustomers": AdminCustomers, // src/pages/Customers.jsx
    "AdminSettings": AdminSettings,   // src/pages/Settings.jsx
}
export const pagesConfig = { mainPage: "Ghid", Pages: PAGES, Layout: __Layout };
```
- **Landing page = `Ghid`** (intro „Cum funcționează").
- Cheia paginii devine URL prin `createPageUrl(name)` = `'/' + name.replace(/ /g,'-')`
  (ex. `AdminProducts` → `/AdminProducts`).

### `App.jsx` — ce adaugă peste base44
- înconjoară totul în `AuthProvider` + `QueryClientProvider` + `<Router>`;
- generează rutele din `PAGES`;
- **rută dinamică adăugată manual** (nu vine din `pages.config`):
  `/product/:id` → `ProductDetail` (sub layout-ul „Shop");
- alias: `/store` → redirect la `/Shop`;
- `*` → `PageNotFound`.

### `Layout.jsx` — două moduri
- `currentPageName` ∈ `['Shop','Cart','Ghid']` → **storefront full-width** (fără sidebar);
  aceste pagini își pun singure `EmagNavbar`.
- `currentPageName` începe cu `Admin` → **sidebar de admin** (shadcn `Sidebar`).
- restul → sidebar „Customer Area".
- Layout-ul injectează niște CSS vars de temă (`--primary: 37 99 235` = albastru).

> ⚠️ **Capcană base44:** `pages.config.js` e marcat „AUTO-GENERATED". Rutele dinamice
> (`/product/:id`) trebuie adăugate în `App.jsx`, nu acolo.

---

## 5. Stratul de date

Sunt **două surse de date** care coexistă:

### 5a. Supabase — catalogul de produse (REAL, read-only)

**Client** — `src/api/supabaseClient.js`:
```js
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});
```
Citește `VITE_SUPABASE_URL` și `VITE_SUPABASE_ANON_KEY` din `import.meta.env`.

**Schema DB** (dedusă din `catalog.js`):
- Tabel **`products`**: `id, name, slug, short_description, description, currency, price,
  sale_price, availability, status, stock_total, rating, review_count, product_url,
  primary_category_id`.
- Tabel **`product_images`**: `url, alt, position` (legat de produs; ordonat după `position`).
- Tabel **`categories`** — **există, dar NU e citibil de rolul anon** (vezi mai jos).
- **RLS:** public-read pe `products` + `product_images` (anon key). Interogările filtrează
  mereu `status = 'active'`. Catalog ≈ **500 de produse**.

**API-ul** (`src/api/catalog.js`) expune:
- `listProducts({ search, category, limit=24, offset=0 })`
- `getProduct(id)` (pentru pagina de produs)
- `countProducts({ search, category })`
- `countCategories()` → `{ all, seruri, creme, … }` pentru badge-urile din sidebar
- `mapProduct(row)` — normalizează rândul DB în forma consumată de UI:
  calculează `onSale`, `effectivePrice`, `inStock`, alege prima imagine etc.

#### ⭐ Partea grea: clasificarea pe categorii prin cuvinte-cheie
Pentru că tabelul `categories` nu e citibil de anon și `primary_category_id` nu se mapează
curat, **categoriile se derivă din numele produsului** prin `ilike`, server-side (păstrează
paginarea și numărătoarea exactă). `priority` rezolvă suprapunerile (număr mai mic câștigă),
ca un produs să fie numărat o singură dată. **Validat pe toate cele 500 de produse.**
Păstrează acest array verbatim la rebuild:

```js
export const CATEGORIES = [
  { value: "seruri",    label: "Seruri & Esențe",          priority: 9,  keywords: ["ser"] },
  { value: "creme",     label: "Creme & Hidratare",        priority: 11, keywords: ["crema", "ulei"] },
  { value: "masti",     label: "Măști",                    priority: 10, keywords: ["masca"] },
  { value: "toner",     label: "Tonere & Ape",             priority: 8,  keywords: ["toner"] },
  { value: "curatare",  label: "Curățare & Demachiere",    priority: 2,  keywords: ["de curatare", "micelar", "demachiant"] },
  { value: "accesorii", label: "Pensule & Accesorii",      priority: 7,  keywords: ["pensula", "burete", "accesoriu"] },
  { value: "par",       label: "Păr & Șampon",             priority: 4,  keywords: ["sampon", "balsam"] },
  { value: "machiaj",   label: "Machiaj",                  priority: 6,  keywords: ["ruj","gloss","fond de ten","de buze","fard","pudra","corector","rimel","creion","iluminator"] },
  { value: "spf",       label: "Protecție solară (SPF)",   priority: 1,  keywords: ["spf"] },
  { value: "corp",      label: "Corp & Deodorante",        priority: 3,  keywords: ["de dus", "deodorant"] },
  { value: "parfum",    label: "Parfumuri",                priority: 5,  keywords: ["parfum"] },
  { value: "diverse",   label: "Diverse",                  priority: 99, keywords: [] }, // fallback
];
```
Logica de filtrare (`applyCategoryFilter`): pentru o categorie aplică `OR` pe cuvintele ei,
apoi **exclude** cuvintele categoriilor cu prioritate mai mare; `diverse` = tot ce nu prinde
niciun cuvânt-cheie.

### 5b. Entity stub pe localStorage (admin — FALS, demo)
`src/api/client.js` → `createEntityClient(schema)` oferă `list/filter/get/create/update/
delete/bulkCreate`, persistate în `localStorage` cu prefixul `sales-mvp:`.
`src/api/entities.js` instanțiază `Product`, `Order`, `Customer`, `Settings` din schemele
`entities/*.json`. `src/hooks/useSeedData.js` populează date demo o singură dată (flag
`sales-mvp:seeded`).

> ⚠️ Adminul (Dashboard/Products/Orders/Customers/Settings) și **comenzile de la checkout**
> scriu aici, **nu** în Supabase. Vezi §11.

### 5c. Coșul (localStorage, partajat)
- Cheie: **`hamro-pasal-cart`** (nume rămas din template; folosit în `Shop.jsx`,
  `ProductDetail.jsx`, `Cart.jsx`, `IziChatWidget.jsx`).
- Forma unui item:
```js
{ product_id, product_name, price, currency, quantity, image_url }
```
- Produsele din chat n-au `id` de catalog → cheia lor de coș e `url` (sau `name`).

---

## 6. Storefront (magazinul)

### `Shop.jsx` (`/Shop`)
- State: produse, total, `categoryCounts`, search (cu **debounce 300ms**), categorie activă,
  coș, view grid/list, `chatOpen`.
- La schimbarea search/categorie: `Promise.all([listProducts, countProducts])`.
- Paginare „Încarcă mai multe" (`PAGE_SIZE = 24`, prin `offset`).
- `countCategories()` o dată, pentru badge-urile din sidebar.
- Când chat-ul e deschis, pagina se îngustează cu `mr-[400px]`.
- Compune: `EmagNavbar` + `EmagHeroBanner` + `EmagCategorySidebar` + grilă `ProductCard` + `IziChatWidget`.

### `ProductDetail.jsx` (`/product/:id`)
- `getProduct(id)` din Supabase; galerie cu thumbnails; preț (cu reducere tăiată); stoc;
  „Adaugă în coș" → scrie în `hamro-pasal-cart`.

### `Cart.jsx` (`/Cart`) — coș + checkout
- Citește coșul din localStorage; update cantități / ștergere; subtotal; **livrare gratuită**.
- Checkout = dialog cu date de contact (nume, telefon, adresă, oraș, observații).
- La „Plasează comanda": `Customer.create()` + `Order.create()` (**localStorage**, nu Supabase),
  `order_number = ${BRAND.orderPrefix}${Date.now()}`.
- Apoi ecran de succes cu **cod QR** (din `Settings` sau generat via `api.qrserver.com`).

### `Ghid.jsx` (landing, `mainPage`)
- Pagină de prezentare: hero, „Cum cumperi în 3 pași", secțiune despre izi, trust-badges, FAQ
  (Accordion shadcn), CTA. Conține mock-uri desenate în cod (fără imagini externe).

### Componente eMAG
- `EmagNavbar` — logo (`BRAND.logoText`), search, link „Chat" (→ `/Shop?chat=1`), coș cu badge;
  bară secundară cu „Produse" și „Cum funcționează".
- `EmagHeroBanner` — carusel cu 3 sloturi (gradient + emoji), auto-rotate la 4s.
- `EmagCategorySidebar` — „Toate produsele" + departamentul „Beauty" cu subcategoriile din
  `CATEGORIES`, fiecare cu iconiță lucide și count.
- `ProductCard` — card cu imagine (fallback Unsplash), badge reducere/stoc, rating, preț, „Adaugă".

---

## 7. Chat „izi" (asistentul AI)

### Transport — `src/api/chatClient.js`
Flux **sincron** pe `/web/chat`:
1. `GET /web/bootstrap?token=<PUBLIC_TOKEN>` → `{ token, visitor_id, sig, sse_url }`.
   Deschide o sesiune anonimă de vizitator; o **cache-uim** în `localStorage`
   (`izi-web-session`). **Serverul ține istoricul** conversației (cheie pe `visitor_id`);
   frontend-ul **NU** trimite istoricul.
2. `POST /web/chat { token, visitor_id, sig, message, client_msg_id }`
   → `{ content, products, suggestions, comparison? }`.
- La **403** (sesiune expirată, ex. restart server) → re-bootstrap o dată automat.
- `resetChatSession()` șterge sesiunea → „Chat nou" pornește o conversație curată.
- `mapProduct(p)` aduce produsul botului la forma consumată de widget
  (`product_id, name, price, list_price?, currency, image_url, rating, review_count?,
  badge?, url, reason`). Câmpurile noi sunt **aditive** — lipsesc curat când nu vin
  (zero regresie pe răspunsurile vechi).
- `mapComparison(c)` normalizează tabelul comparativ **opțional** (`columns` + `rows`);
  întoarce `null` dacă lipsește/e malformat. Prețurile din `columns` sunt coerciate ca
  la produs; `values` din `rows` vin deja localizate (`null` ⇒ „—" în UI).

### Config
```
VITE_CHAT_API_BASE   = https://bot.nativextech.com   (gol în dev → folosește proxy-ul)
VITE_CHAT_PUBLIC_TOKEN = pub_…                        (browser-safe; CORS-locked server-side)
```
`isChatConfigured = Boolean(PUBLIC_TOKEN) && (Boolean(API_BASE) || import.meta.env.DEV)`.

### ⚠️ Capcana CORS / proxy (important!)
Botul permite CORS **doar** pentru `https://shop.nativextech.com`. De aceea:
- **Dev:** Vite proxează `/web/*` către `https://bot.nativextech.com` și **falsifică**
  `Origin: https://shop.nativextech.com` (server-side, fără CORS). Vezi `vite.config.js`:
```js
server: { proxy: { '/web': {
  target: 'https://bot.nativextech.com',
  changeOrigin: true,
  headers: { Origin: 'https://shop.nativextech.com' },
}}}
```
- **Prod:** build-ul lovește botul direct prin `VITE_CHAT_API_BASE` (origine reală = shop).

### Widget — `IziChatWidget.jsx`
- Buton flotant dreapta-jos → panou lateral fix de 400px.
- Mesaje cu `RichText` (escape HTML + doar `**bold**`), carduri de produs proprii,
  „suggestion chips".
- Cardul de produs din chat (`ChatProductCard`) randează și: `badge` (tag colorat în colț),
  `list_price` tăiat + „-X%" lângă preț, `review_count` lângă rating, `reason` sub nume.
- Când răspunsul conține `comparison`, se randează `ComparisonTable` (un produs/coloană,
  o dimensiune/rând) **în loc** de re-listarea cardurilor; sub 375px comută pe layout vertical.
- „Adaugă în coș" din chat scrie în același `hamro-pasal-cart`.
- Deschidere prin `?chat=1` (din navbar / alte pagini), apoi curăță param-ul.
- **Fallback:** dacă botul nu e configurat → folosește stub-ul `InvokeLLM` din
  `src/api/integrations.js` (răspuns generic), ca dev-ul să meargă fără backend.

---

## 8. Admin panel

Toate paginile admin folosesc entitățile **localStorage** (`@/api/entities`) și componenta
`PageHeader` + tabele shadcn.

- **Dashboard** (`Dashboard.jsx`) — 4 StatCards (venit, comenzi, produse, clienți) + ultimele 5 comenzi.
- **Products** (`Products.jsx`) — listă + dialog „New product" + ștergere (`Product.list/create/delete`).
- **Orders** / **Customers** — **același tipar** ca Products (listă + CRUD pe entitatea respectivă).
- **Settings** (`Settings.jsx`) — nume magazin, email, monedă, TVA, temă, notificări
  (`Settings.list/create/update`). *Notă:* aceste „Settings" admin diferă de `Settings` folosit
  pe ecranul QR din `Cart` (merchantName / paymentPhoneNumber / qrCodeImageUrl).

> Adminul nu e legat de Supabase. La rebuild trebuie decis dacă îl conectăm la DB reală (§11).

---

## 9. Brand, limbă & monedă

- `src/lib/brand.js` — **single source of truth** pentru identitate:
```js
export const BRAND = {
  name: "Beauty Shop", logoText: "Beauty", tagline: "Cosmetice & îngrijire",
  supportPhone: "", currency: "RON", orderPrefix: "CMD",
};
```
- Monedă implicită **RON**; `formatCurrency` folosește `Intl.NumberFormat("ro-RO", …)`.
- UI integral în **română**; datele cu `formatDate` (`ro-RO`).
- Temă: albastru (`--primary: 37 99 235`), accente gradient albastru→mov/roz.

---

## 10. Build & deploy

### Variabile de mediu (toate `VITE_*`, injectate la **build time**)
| Variabilă | Folosită de | Valoare/exemplu | Note |
|---|---|---|---|
| `VITE_SUPABASE_URL` | `supabaseClient.js` | `https://xfczucwqntefethxxien.supabase.co` | publică |
| `VITE_SUPABASE_ANON_KEY` | `supabaseClient.js` | *(anon public key)* | publică, gate-uită de RLS |
| `VITE_CHAT_API_BASE` | `chatClient.js` | `https://bot.nativextech.com` | gol în dev (proxy) |
| `VITE_CHAT_PUBLIC_TOKEN` | `chatClient.js` | `pub_…` | browser-safe |

- Local: `.env.local` (negitat). Șablon: `.env.example`.
- ⚠️ **Niciodată** `service_role` sau parola DB în `VITE_*` — ar ajunge în bundle-ul din browser.

### CI/CD — `.github/workflows/deploy.yml`
- Trigger: push pe `main` (sau manual). `concurrency` anulează deploy-urile suprapuse.
- Pași: `checkout` → `setup-node@20` → `npm ci` → `npm run build` (cu `VITE_*` din **secrets**)
  → upload artifact `shop-dist` (fallback manual) → **FTPS deploy**.
- Hostinger shared **nu** rulează build-ul; urcăm doar `dist/` compilat.
- Deploy: `SamKirkland/FTP-Deploy-Action@v4.3.5`, **FTPS pe portul 21**, `timeout: 120000`.
```yaml
local-dir: ./dist/
server-dir: ./domains/nativextech.com/public_html/shop/   # docroot-ul subdomeniului shop
```
> ⚠️ Pe acest cont Hostinger, `public_html` **nu** e la rădăcina FTP — e sub `domains/`.
> SSH/SFTP pe 65002 nu merge sigur din CI; de aceea FTPS pe 21.

### GitHub Actions secrets necesare
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CHAT_API_BASE`,
`VITE_CHAT_PUBLIC_TOKEN`, `FTP_HOST`, `FTP_USERNAME`, `FTP_PASSWORD`.

### Comenzi npm
`dev` (Vite), `build`, `preview`, `lint` / `lint:fix` (ESLint), `typecheck` (`tsc -p jsconfig.json`).

---

## 11. Limitări cunoscute & decizii pentru noul site

1. **Comenzile nu se persistă într-un backend real.** Checkout-ul scrie `Order`/`Customer`
   în `localStorage` (stub base44). Pe noul site: **de decis** — comenzi în Supabase (tabel
   `orders`/`order_items` + RLS de insert) sau predate botului/altui serviciu.
2. **Catalogul e read-only din frontend.** Produsele se administrează în afara acestui app
   (Supabase direct / pipeline separat). Adminul din UI lucrează pe alt set de date (localStorage).
3. **Categoriile sunt derivate prin cuvinte-cheie**, fiindcă tabelul `categories` nu e
   anon-readable. Mai curat la rebuild: fie expunem `categories` prin RLS, fie punem o coloană
   de categorie pe `products`. Până atunci, păstrăm clasificatorul din §5a.
4. **Fără autentificare.** `AuthContext` e un provider „gol" (vizitatori anonimi). Adminul nu
   e protejat. De decis dacă noul site are login (Supabase Auth?).
5. **Numele cheii de coș** e `hamro-pasal-cart` (rămășiță template). Poate fi redenumit, dar
   trebuie schimbat în toate cele 4 locuri simultan.
6. **Dependențe nefolosite** (Stripe, three, leaflet, quill, recharts…) — de curățat la rebuild.

---

## 12. Plan de reconstrucție

Când avem designul nou (din base44 sau alt builder), strategia e:
**design nou = bază, peste care altoim stratul de mai jos.**

### ✅ Se păstrează ca atare (logica grea — copy-paste + ajustări mici)
- `src/api/supabaseClient.js` — clientul Supabase.
- `src/api/catalog.js` — **inclusiv `CATEGORIES` și `applyCategoryFilter`** (validate pe 500 produse).
- `src/api/chatClient.js` — transportul botului (bootstrap/chat/403/reset).
- `vite.config.js` — **proxy-ul `/web` cu spoof de Origin** (altfel chat-ul nu merge în dev).
- `.github/workflows/deploy.yml` — pipeline-ul FTPS + `server-dir` Hostinger.
- `src/utils/index.ts` — `createPageUrl`, `formatCurrency`, `formatDate`.
- `src/lib/brand.js` — configul de brand.
- Setul shadcn `components/ui/**` (standard; vine oricum cu orice export base44).

### 🎨 Se rescrie (designul)
- Toate paginile vizuale: `Shop`, `ProductDetail`, `Cart`, `Ghid`, plus adminul.
- Componentele eMAG (`EmagNavbar`, `EmagHeroBanner`, `EmagCategorySidebar`, `ProductCard`) și
  UI-ul widget-ului de chat (logica din `chatClient.js` rămâne; doar prezentarea se schimbă).
- `Layout.jsx` + structura de routing (dacă noul design are alt IA/meniu).

### ❓ Decizii de luat înainte de rebuild
- **Comenzi reale** în Supabase? (tabel + RLS de insert) — vezi §11.1.
- **Auth / protejarea adminului**? (Supabase Auth) — §11.4.
- **Categorii**: rămânem pe clasificatorul prin keyword sau le mutăm în DB? — §11.3.
- **Domeniu**: păstrăm `shop.nativextech.com` + `bot.nativextech.com` + același proiect Supabase?
  (dacă da, deploy-ul și env-urile rămân identice).

### Pași de wiring după ce avem designul nou
1. Pornim de la noul cod (design) ca bază.
2. Copiem fișierele din lista „se păstrează" și aliasul `@/`.
3. Repointăm fetch-urile de produse pe `catalog.js` (Supabase) în loc de stub-urile base44
   (`entities.js` / `InvokeLLM`).
4. Legăm widget-ul de chat la `chatClient.js`.
5. Reportăm `vite.config.js` (proxy) + `.env.local` + secrets-urile GitHub.
6. Verificăm deploy-ul către același `server-dir` Hostinger.
