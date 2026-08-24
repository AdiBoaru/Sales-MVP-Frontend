# Acces demo prin cod

Magazinul de pe `demo.nativextech.com/store` e închis. Un vizitator intră doar cu
un cod emis manual, pe care îl schimbă pe o sesiune Supabase reală.

## Ideea în trei rânduri

Frontend-ul e o aplicație statică: cheia `anon` din bundle e vizibilă oricui. Deci
**poarta nu e în React** — ea e în baza de date. După migrație rolul `anon` nu mai
are niciun drept pe catalog, iar singura cale de a primi drepturi e funcția edge
`redeem-code`. Ecranul din `src/components/DemoGate.jsx` doar explică și preia
codul; șters din DOM, magazinul rămâne gol, nu deschis.

```
cod (e-mail)
   │  POST /functions/v1/redeem-code
   ▼
edge function ─ HMAC(cod, DEMO_CODE_PEPPER) ─► public.redeem_demo_code()
   │                                             throttle → validează → consumă
   │◄──────────── auth_email + id ───────────────┘
   │  signInWithPassword(email, HMAC(DEMO_AUTH_PEPPER, id))
   ▼
sesiune Supabase (sessionStorage) ─► RLS lasă catalogul să fie citit
```

Codul în clar nu ajunge niciodată în DB și nu se poate recupera. Parola userului
sintetic nu se stochează deloc — se derivă din `id`.

## Codul implicit (stare actuală: poarta reală NU e instalată)

Pe proiectul Supabase nu există încă `public.redeem_demo_code`, iar `anon` citește
în continuare catalogul — adică pașii 2 și 6 de mai jos n-au fost rulați. Cu funcția
edge nedeploiată, orice cod introdus cade pe eroare de rețea, deci poarta n-ar lăsa
pe nimeni înăuntru.

Până atunci există un cod implicit, verificat în browser, înaintea oricărui apel:

```
VITE_DEMO_DEFAULT_CODE=1234     # gol = dezactivat
```

Nu e securitate și nu pretinde să fie: stă în clar în bundle. Nu slăbește nimic
real, fiindcă azi catalogul e public oricum — iar după pasul 6 ușa asta se închide
singură, fiindcă fără sesiune Supabase magazinul rămâne gol indiferent ce arată
ecranul. Când ajungi acolo, golește variabila.

## Instalare

**1. Pepperele** (o singură dată; nu le pierde, nu le rota fără să reemiți codurile):

```bash
openssl rand -hex 32   # DEMO_CODE_PEPPER
openssl rand -hex 32   # DEMO_AUTH_PEPPER
```

Adaugă-le în `.env.local` (gitignored), lângă `SUPABASE_SERVICE_ROLE_KEY`.

**2. Migrația de bază** — rulează `supabase/migrations/20260805120000_demo_access.sql`
în SQL Editor, sau `npx supabase db push`. Nu are efect vizibil: doar adaugă tabele
și funcții. Magazinul continuă să meargă ca înainte.

> Închiderea propriu-zisă e în migrația a doua, `20260805120001_demo_lockdown.sql`,
> și se rulează **ultima** — vezi „Ordinea" mai jos.

La final verifică:

```sql
select table_name, privilege_type
  from information_schema.role_table_grants
 where grantee = 'anon'
   and table_name in ('products','product_images','categories','store_categories');
-- zero rânduri = catalogul e închis
```

Apoi verifică ce mai citește view-ul `store_categories` — migrația dă `select` pe
`products`, `product_images` și `categories` rolului `authenticated`, dar dacă
view-ul atinge și altceva, sidebar-ul rămâne gol după ce intri cu cod:

```sql
select pg_get_viewdef('public.store_categories', true);
-- pentru orice tabel din definiție care nu e în listă:
--   grant select on public.<tabel> to authenticated;
--   revoke all  on public.<tabel> from anon;
```

**3. Funcția edge:**

```bash
npx supabase secrets set \
  DEMO_CODE_PEPPER=... \
  DEMO_AUTH_PEPPER=... \
  DEMO_ALLOWED_ORIGINS=https://demo.nativextech.com,http://localhost:5173
npx supabase functions deploy redeem-code --no-verify-jwt
```

`--no-verify-jwt` e corect și obligatoriu: apelantul nu are încă sesiune.
Autorizarea e codul, verificat în funcție.

**4. Auth settings** (dashboard → Authentication → Sessions):

| Setare | Valoare | De ce |
|---|---|---|
| Access token (JWT) expiry | **1800** (30 min) | fereastra în care un cod revocat mai are acces |
| Refresh token rotation | **on** | un refresh token furat se autoinvalidează |
| Allow new users to sign up | **off** | userii demo se creează doar cu service_role |

## Ordinea

Migrația e împărțită în două tocmai ca să nu existe fereastră în care magazinul e
stricat. Pașii 1–5 nu schimbă nimic pentru un vizitator; pasul 6 e cel care închide.

| # | Pas | Efect vizibil |
|---|---|---|
| 1 | pepperele în `.env.local` | — |
| 2 | `20260805120000_demo_access.sql` | — |
| 3 | `secrets set` + `functions deploy redeem-code --no-verify-jwt` | — |
| 4 | `git push` → frontend-ul cu poarta | apare ecranul cu codul |
| 5 | `issue` un cod și intri cu el, cap-coadă | — |
| 6 | **`20260805120001_demo_lockdown.sql`** | `anon` nu mai citește nimic |

Între 4 și 6 poarta e reală ca experiență, dar încă ocolibilă tehnic (cheia `anon`
mai citește catalogul). E fereastra în care testezi. Pasul 6 o închide.

Rollback pentru pasul 6, dacă ceva nu merge:

```sql
grant select on public.products, public.product_images,
                public.categories, public.store_categories to anon;
```

## Verificare după deploy

```bash
# 1. anon nu mai citește nimic — trebuie să întoarcă [] sau o eroare de permisiune
curl "$VITE_SUPABASE_URL/rest/v1/products?select=id&limit=1" \
     -H "apikey: $VITE_SUPABASE_ANON_KEY"

# 2. un cod greșit e respins
curl -X POST "$VITE_SUPABASE_URL/functions/v1/redeem-code" \
     -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
     -d '{"code":"NX-00000-00000"}'      # -> 401 invalid

# 3. de 6 ori la rând -> 429 throttled
```

Apoi, în browser: `/store` cere codul, iar cu un cod bun se încarcă produsele
**și** sidebar-ul de categorii.

## Limite cunoscute

- **Rate-limit Auth.** Toate redeem-urile trec prin `signInWithPassword` apelat din
  aceeași infrastructură, deci intră sub limita Supabase pe endpoint-ul de token
  (~30/5 min). Irelevant la volum de demo; de reevaluat dacă ajungi la zeci de
  activări simultane.
- **Acces rezidual după revocare** — cel mult cât „Access token expiry". De aceea
  setarea de 30 de minute de mai sus contează.
- **Codul e un secret partajabil.** `max_uses` și `expires_at` limitează dauna, nu
  o elimină: cine are codul poate intra. Asta e natura oricărei porți cu cod.

## Emiterea codurilor

```bash
node scripts/demo-codes.mjs issue --label "Acme SRL — Ionescu" \
     --email ionescu@acme.ro --days 14 --uses 10
node scripts/demo-codes.mjs list
node scripts/demo-codes.mjs revoke <id>
```

`issue` afișează codul **o singură dată**. Dacă îl pierzi, emiți altul — exact
proprietatea care face un dump de bază de date inutil.

Pentru un cod permanent al tău, ales de tine:

```bash
node scripts/demo-codes.mjs issue --label "Adi" \
     --code "adi-nativex-2026" --days 3650 --uses 999
```

`--code` cere minimum 10 caractere alfanumerice (cratimele se ignoră). Lungimea nu
e totul: un cod ales trebuie să fie o frază pe care nimeni n-ar încerca, nu ceva
scurt care doar *arată* aleator. Sub 10 caractere spațiul de căutare devine mic
destul încât throttle-ul de 5/15 min să nu mai fie suficient — câteva zeci de
IP-uri prin proxy îl parcurg în ore.

`revoke` face două lucruri: marchează codul și banează userul sintetic, ca
sesiunile deja deschise să nu se mai poată reîmprospăta. Accesul rezidual e cel
mult cât JWT expiry de mai sus.

## Ce protejează, concret

| Suprafață | Stare |
|---|---|
| `products`, `product_images`, `categories` | `anon` fără drepturi; doar `authenticated` |
| `store_categories` (view) | `security_invoker = true` — nu mai ocolește RLS |
| `demo.access_codes`, `demo.redeem_attempts` | schemă neexpusă în PostgREST — inaccesibile cu orice cheie de browser |
| `redeem_demo_code` și funcțiile de admin | `execute` doar pentru `service_role` |
| brute-force | 5 încercări greșite / IP / 15 min, peste 50 de biți de entropie |
| partajarea codului | `max_uses` + `expires_at` + revocare instant |
| `bot.nativextech.com` | **încă deschis — vezi mai jos** |

## Botul

Riscul care costă bani. `VITE_CHAT_PUBLIC_TOKEN` e în bundle, deci `/web/bootstrap`
și `/web/chat` pot fi apelate de oricine îl extrage, indiferent de poartă.

Frontend-ul trimite deja sesiunea demo pe fiecare cerere:

```
Authorization: Bearer <access_token>
```

Rămâne de făcut **pe bot**:

1. Validează JWT-ul cu JWT secret-ul proiectului Supabase (HS256), verifică `exp`
   și `aud = "authenticated"`. Fără header valid → `401`, înainte de orice apel LLM.
2. Rate-limit per `sub` (userul din token = codul), de ex. 50 de mesaje/zi.
3. CORS strict pe `https://demo.nativextech.com`.

Până atunci poarta protejează catalogul, dar nu și factura de tokeni.
