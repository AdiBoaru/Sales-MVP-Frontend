# Handoff: Aria — Consultant AI de Frumusețe (widget de chat beauty)

## Overview
Aria este un widget de chat cu asistent AI, embeddabil într-un magazin de cosmetice, care recomandă produse de îngrijire și machiaj **argumentat**: pune întrebări de clarificare, arată un „lanț de gândire" (analiză pas cu pas), explică *de ce* alege un produs, compară opțiuni, construiește rutine complete și **refuză onest** cererile imposibile (ex. „ser care șterge ridurile în 3 zile"). Recomandările sunt strict din catalogul magazinului.

Fluxul principal demonstrat: intenție → clarificări → analiză vizibilă → recomandare-erou cu scor AI → produse complementare / rutină → follow-up (comparație, preț, stoc, mod de folosire, salvare în „trusă").

## About the Design Files
Fișierele din acest pachet sunt **referințe de design create în HTML** — prototipuri care arată aspectul și comportamentul dorit, **nu cod de producție de copiat direct**. Sunt scrise ca „Design Components" (`.dc.html`), un format intern de prototipare bazat pe un mic runtime React (`support.js`); template-ul e HTML cu găuri `{{ }}`, logica e o clasă `Component extends DCLogic`.

Sarcina în Claude Code: **recreați aceste designuri în mediul codebase-ului țintă** (React, Vue, Svelte, SwiftUI, native etc.) folosind pattern-urile și librăriile lui existente. Dacă nu există încă un mediu, alegeți framework-ul potrivit (recomandat: **React + TypeScript**, întrucât logica e deja structurată ca o clasă cu state/handlers și se mapează direct pe un component funcțional cu `useReducer`/`useState`). **Nu livrați `.dc.html` ca atare** și nu depindeți de `support.js`.

## Fidelity
**High-fidelity (hifi).** Culori, tipografie, spațiere, radius, umbre și micro-interacțiuni sunt finale. Recreați UI-ul pixel-cu-pixel folosind librăriile codebase-ului. Toate valorile exacte sunt în secțiunea *Design Tokens*.

Un singur lucru NU e „real": **imaginile de produs sunt vizualuri stilizate desenate în SVG** (flacoane/borcane/tuburi/pompe/picurătoare generate în cod — vezi `Aria Product.dc.html`). Sunt placeholdere premium intenționate. În producție înlocuiți-le cu fotografiile reale ale produselor (`<img>`), păstrând aceleași dimensiuni de slot și fundalul radial al containerului.

## Arhitectură & fișiere
- **`AriaChat Light.dc.html`** — widget-ul complet (temă light): header, bară de „context/memorie", firul conversației cu toate tipurile de mesaj, composer, sertar „trusă salvată", plus TOATĂ logica de dialog (journeys, thinking, follow-ups).
- **`Aria Product.dc.html`** — generator de vizualuri de produs SVG după un `sku` (formă + paletă). De înlocuit cu foto real în producție.
- **`support.js`** — runtime-ul de prototip. **Doar referință**; nu se portează.

## Layout general (widget)
Container: coloană flex pe toată înălțimea, lățime tipică de widget **430px** (max ~440px), înălțime 100% a gazdei (mobil: full-screen; desktop: panou ancorat colț dreapta-jos, ~430×min(820, 90vh), radius 20px, umbră mare).

Structură verticală (sus → jos):
1. **Header** (fix) — `flex-none`, padding `14px 18px`, border-bottom `1px #ECE9F4`, fundal `rgba(255,255,255,.92)`.
2. **Bară context/memorie** (fix, condiționată) — apare după prima clarificare; padding `8px 18px`, fundal `#F6F4FB`, chips orizontale scrollabile.
3. **Fir conversație** (flex:1, scroll) — padding `20px 18px 10px`, `display:flex; flex-direction:column; gap:16px`.
4. **Composer** (fix) — padding `12px 16px 14px`, border-top `1px #ECE9F4`, fundal alb.
5. **Sertar „trusă salvată"** (overlay absolut peste tot, condiționat).

## Componente (temă Light — valori exacte)

### Header
- Logo: pătrat 24×24 rotit 45°, radius 7px, border gradient (`linear-gradient(135deg,#6D28D9,#7C3AED,#38BDF8)`) prin tehnica „două background-uri" (padding-box + border-box), cu punct central 7px gradient; animație `ariaGlow` (box-shadow pulsând violet↔cyan, 4s).
- Titlu „Aria": Barlow 700, 16px, `letter-spacing:-0.02em`, culoare `#1B1826`.
- Subtitlu: 10.5px, `#8B8798`, `letter-spacing:.04em` — „Consultant de frumusețe · {merchant}".
- Buton „salvate": pill, `padding:7px 12px`, border `1px #E0DCEC`, fundal alb, icon bookmark violet 14px + contor; hover border `#7C3AED`.

### Bară context/memorie
- Etichetă „REȚIN": 9.5px, 600, uppercase, `letter-spacing:.14em`, `#8B8798`.
- Chip context: `padding:3px 9px`, fundal `rgba(124,58,237,.07)`, border `1px rgba(124,58,237,.22)`, radius pill, text 11px `#6D28D9`, cu punct 4px `#38BDF8` în față.

### Mesaj — Welcome
- Logo mare 38×38 (aceeași construcție).
- Titlu „Bună! Sunt Aria.": Barlow 700, 24px, `#1B1826`.
- Paragraf: 13.5px, line-height 1.6, `#7A7589`, max-width 340px.
- 4 butoane-prompt: rând, `padding:13px 15px`, border `1px #E7E4F0`, radius 13px, fundal alb, shadow `0 1px 4px rgba(27,24,38,.04)`; punct 6px gradient + text 13px + săgeată. Hover: border `#7C3AED`, shadow `0 4px 16px rgba(124,58,237,.12)`.

### Mesaj — User (bulă utilizator)
- Aliniat dreapta, max-width 80%, `padding:11px 16px`, fundal `linear-gradient(135deg,#6D28D9,#7C3AED)`, radius `16px 16px 4px 16px`, text 13.5px alb, shadow `0 4px 14px rgba(109,40,217,.25)`.

### Mesaj — Thinking (lanț de gândire) ⭐ semnătura produsului
- Card border `1px #E7E4F0`, radius 14px, fundal `#F6F4FB`.
- Header-buton (colapsabil după terminare): în timpul rulării = spinner 13px (border-top violet, `ariaSpin .8s linear infinite`) + „Aria analizează…" (`#6D28D9`); după = bifă verde `#22C55E` + rezumat gri (ex. „Am ales din 34 de formule · 2,0 s") + chevron.
- Pași: fiecare rând are marker după stare — **done** = bifă violet 11px; **active** = punct 7px gradient cu `ariaPulse 1s`; **pending** = cerc gol border `1.5px #C9C4D8`. Text 12px, culoare după stare (`#1B1826` activ / `#7A7589` done / `#A5A1B2` pending).
- Pașii avansează pe interval de `thinkSpeed` ms (default 650), apoi header devine „done" și se declanșează următorul mesaj.

### Mesaj — Understanding card
- Border `1px rgba(124,58,237,.18)`, radius 14px, fundal `linear-gradient(160deg,rgba(124,58,237,.06),rgba(56,189,248,.04) 70%),#fff`.
- Titlu „AM ÎNȚELES CE CAUȚI": 10px, 600, uppercase, `#6D28D9`.
- Chips cheie-valoare: `padding:5px 11px`, fundal `#F6F4FB`, border `1px #E7E4F0`, radius pill; cheie `#8B8798`, valoare `#1B1826` 500.

### Mesaj — Text AI (bulă asistent)
- Border `1px #E7E4F0`, radius `16px 16px 16px 4px`, fundal alb, max-width 94%, shadow `0 2px 10px rgba(27,24,38,.05)`.
- Titlu opțional: Barlow 600, 15px. Paragrafe: 13.5px, line-height 1.65, `#4B4756`.
- Sub-bloc **status stoc** (opțional): rânduri cu punct de stare (verde `#22C55E` / ambră `#F59E0B`), nume 12.5px 600, subtext 11px `#8B8798`, badge de stare la dreapta (`În stoc` verde / `Stoc limitat` ambră).
- Sub-bloc **bară de încredere** (opțional): etichetă „ÎNCREDERE ÎN RECOMANDARE" + procent Barlow 700 `#6D28D9`; bară 5px, fill `linear-gradient(90deg,#6D28D9,#7C3AED,#38BDF8)` animată `ariaBar 1s`.

### Mesaj — Recommendation (card-erou) ⭐
- Border `1px #E7E4F0`, radius 18px, fundal alb, shadow `0 12px 36px rgba(109,40,217,.1)`.
- Sus: badge gradient-text (violet→cyan) + capsulă „SCOR AI" cu scor Barlow 700 `#0284C7`.
- Rând principal: slot produs 84×84 (radius 11px, fundal radial violet slab + `#F6F4FB`, border `#ECE9F4`) cu vizualul SVG 80×80; opțional badge discount verde în colț. La dreapta: brand (9.5px `letter-spacing:.16em` `#8B8798`), nume (Barlow 700, 16px), rând rating (stea `#F59E0B` + notă + review-uri + punct + stoc verde), preț (Barlow 700, 19px) + preț vechi tăiat.
- Chips beneficii: `padding:3px 9px`, fundal `rgba(124,58,237,.06)`, border `1px rgba(124,58,237,.18)`, radius 8px, text 10.5px `#6D28D9`.
- Bloc „DE CE AM ALES-O PENTRU TINE": fundal `#F9F8FC`, border `#ECE9F4`, radius 12px; etichetă violet + explicație 12.5px `#4B4756`.
- Bloc opțional „CE S-A SCHIMBAT" (cyan): delta-uri cu ton verde/ambră.
- Acordeon „Pentru cine e · pro și contra": două carduri (Ideală pentru / Evită dacă) + liste pro (`+` verde) / contra (`−` ambră).
- Rând acțiuni: `Salvează` (toggle, devine violet umplut când e salvat) · `Întreabă Aria` · `Vezi produsul ↗` (buton primar gradient `linear-gradient(140deg,#7C3AED,#6366F1 52%,#38BDF8)`, shadow `0 6px 20px rgba(109,40,217,.3)`).

### Mesaj — Grid de produse
- Titlu secțiune 10px uppercase `#8B8798` + subtitlu 10.5px `#A5A1B2`.
- Grilă 2 coloane, gap 10px. Card: border `1px #E7E4F0`, radius 14px, padding 12px, shadow `0 2px 8px rgba(27,24,38,.04)`; hover border `rgba(124,58,237,.35)` + shadow violet. Buton inimă 28px stânga-sus-dreapta (toggle). Slot imagine 88px înălțime (fundal radial). Brand/nume, rating, preț (+ preț vechi), badge „AI {scor}" cyan, o linie descriptivă.

### Mesaj — Rutină (timeline)
- Card border `1px #E7E4F0`, radius 18px, padding 16px, shadow `0 6px 24px rgba(27,24,38,.06)`.
- Titlu gradient-text + „Total {sumă}" violet.
- Fiecare pas: bulină numerotată 24px (gradient, Barlow 700 alb) + linie verticală gradient care leagă pașii; la dreapta rol (uppercase violet 9.5px) + motiv (11px `#8B8798`) + card mini-produs (slot 42px, brand/nume, preț + badge AI, buton inimă).
- Notă de subsol 11px `#8B8798`.

### Mesaj — Comparație
- Două capete A (violet) / B (cyan). Rânduri pe dimensiuni cu grid `1fr auto 1fr`; câștigătorul are punct colorat + text bold `#1B1826`, perdantul `#8B8798`.
- Bloc „VERDICTUL ARIEI": fundal gradient violet/cyan slab, verdict 12.5px, bară de încredere + procent, buton „Alege pentru mine".

### Mesaj — No results (refuz onest) ⭐
- Border `1px rgba(245,158,11,.35)`, radius 16px, fundal `rgba(245,158,11,.06)`. Icon triunghi de avertizare ambră `#C77700` + titlu Barlow 600 14.5px. Text 13px `#4B4756` + notă „Prefer să-ți spun adevărul decât să-ți vând orice.".

### Mesaj — Chips follow-up
- Rând wrap, gap 8px. Chip: pill, `padding:8px 14px`, border `1px #E0DCEC`, fundal alb, text 12px `#6D28D9`; hover border `#7C3AED` + fundal `rgba(124,58,237,.05)`.

### Composer
- Rând: input într-un „pill" `#F6F4FB` (border `1px #E7E4F0`, focus border `#7C3AED`), placeholder „Întreabă orice despre îngrijire sau machiaj…", buton microfon (ghost) + buton trimite 36px gradient rotund cu săgeată sus.
- Sub el: disclaimer 10px `#A5A1B2` centrat — „Aria caută doar în catalogul acestui magazin · recomandări argumentate".

### Sertar „trusă salvată"
- Overlay `rgba(27,24,38,.35)` + blur; panou de jos radius `20px 20px 0 0`, animație slide-up. Listă produse salvate (slot mini, nume/brand, preț, remove), total estimat (Barlow 700, 17px), buton „Adaugă tot în coș" gradient. Stare goală: „Nimic salvat încă…".

## Vizualuri de produs (`Aria Product.dc.html`)
Un `sku` mapează la o **formă** (dropper / bottle / pump / tube / jar) și o **paletă** {glass, liquid, cap, label}. SKU-uri definite: `vitc, ha, essence, toner_sage, toner_rose, foundation, spf, cleanser, cream`. Fiecare SVG e 120×164 viewBox cu highlight alb și mini-etichetă. **În producție: înlocuiți cu `<img src>` de produs real**, păstrând slotul (radius + fundal radial).

## Interactions & Behavior
- **Journeys** (pornite din prompturile de welcome sau din textul tastat prin cuvinte-cheie): `skincare` (ser vit. C, 1 clarificare: tip ten), `foundation` (2 clarificări: finish + subton), `routine` (2 clarificări: tip ten + buget → rutină de 3 sau 5 pași), `spf` (direct), `miracle` (refuz onest → retinol / efect imediat).
- **Thinking**: la fiecare pas se avansează markerul pe interval `thinkSpeed`; la final header „done" + declanșarea răspunsului. Auto-scroll la fund după fiecare mesaj (`scrollTop = scrollHeight`, NU `scrollIntoView`).
- **Guard `busy`**: cât timp Aria „gândește", inputul și chips-urile sunt ignorate (o singură cerere odată).
- **Context bar**: se populează după clarificări (`ctx` = criteriile reținute) și rămâne vizibilă.
- **Follow-ups**: `compare`, `cheaper`, `stock`, `howto`/`ask`, `fspf`, `saveLast`, `saveRoutine`, `pick`, `openSaved` — comportamentul lor depinde de `journey` curent și de `lastReco`.
- **Save toggle**: inimă/buton comută `saved[pid]`; contorul din header și sertarul se actualizează; totalul se recalculează din `priceN`.
- **Text liber**: fără journey activ, cuvintele-cheie rutează (riduri/minune/3 zile→miracle; fond/machiaj/nuanță→foundation; rutin→routine; spf/solar/protecț→spf; altfel skincare). Cu journey activ: compar/ieftin/stoc/folos/salv rutează la follow-up-ul corespunzător.

## Animations & transitions
- `ariaFadeUp` .4s (intrare mesaje) · `ariaPulse` 1s (pas activ) · `ariaSpin` .8s (spinner) · `ariaGlow` 4s (logo) · `ariaBar` 1s (umplere bară încredere).
- Tranziții hover: `border-color .2s`, `box-shadow .2s`, `filter brightness(1.08)` pe butoane primare.

## State Management
State-ul (mapabil pe `useReducer`):
- `msgs: Message[]` — firul (fiecare cu `id` + `type` + payload). Tipuri: welcome, user, thinking, understand, text, reco, grid, routine, compare, noresults, chips.
- `typed: string` — inputul.
- `saved: Record<pid, true>` — produse salvate.
- `savedOpen: boolean` — sertar.
- `expanded: Record<id, boolean>` — acordeoane (thinking colapsat + „pro/contra" pe reco).
- `ctx: string[]` — chips de memorie.
- `busy: boolean` — lock în timpul „gândirii".
- `journey: 'skin'|'foundation'|'routine'|'spf'|'miracle'|null`.
- `lastReco: pid` — ultima recomandare (țintă pentru stoc/salvare/pick).
- variabile efemere: `fFinish`, `rSkin`, `lastRoutine {pids,total}`.
Catalogul `products` e un dicționar static `pid → {brand,name,sku,price,priceN,old,disc,rating,reviews,score,why,chips,best,avoid,pros,cons,line,stock}`. În producție acesta vine din API-ul magazinului.

## Design Tokens
**Culori**
- Fundal: `#FAF9FC` · card/alb: `#FFFFFF`
- Text principal: `#1B1826` · text mediu: `#4B4756` · text secundar: `#7A7589` · text slab: `#8B8798` · text foarte slab: `#A5A1B2`
- Borduri: `#ECE9F4`, `#E7E4F0`, `#E0DCEC`, `#EFEDF6`, `#F1EFF7`
- Suprafețe slabe: `#F6F4FB`, `#F9F8FC`, `#F3F1F8`
- Accent violet (primar): `#6D28D9` → `#7C3AED`; indigo mix: `#6366F1`
- Accent cyan (secundar): `#38BDF8` → `#0284C7`
- Succes: `#22C55E` / text `#189A4A` · Avertizare: `#F59E0B` / text `#C77700` · Stea: `#F59E0B`
- Gradient primar buton: `linear-gradient(140deg,#7C3AED,#6366F1 52%,#38BDF8)`
- Gradient bulă user: `linear-gradient(135deg,#6D28D9,#7C3AED)`
- Gradient bară/brand: `linear-gradient(90deg,#6D28D9,#7C3AED,#38BDF8)`

**Tipografie**
- Titluri/numere: **Barlow** (600/700/900), `letter-spacing` -0.01 – -0.02em.
- Text UI: **Hanken Grotesk** (400/500/600/700), fallback Inter.
- Scală folosită: 24 (welcome) / 19 (preț erou) / 16–15 (titluri card) / 13.5–13 (body) / 12–11.5 (meta) / 10–9 (etichete uppercase).

**Radius**: 8 (chip beneficiu) · 11–14 (carduri interioare) · 16 (bule) · 18 (carduri-erou) · 20 (sertar) · pill/9999 (chips, butoane rotunde).

**Shadow**: `0 1px 4px rgba(27,24,38,.04)` (subtil) · `0 2px 10px rgba(27,24,38,.05)` · `0 6px 24px rgba(27,24,38,.06)` · `0 12px 36px rgba(109,40,217,.1)` (erou) · butoane primare `0 6px 20px rgba(109,40,217,.3)`.

**Spacing**: gap fir 16px; padding carduri 12–17px; gap chips 6–8px; padding widget lateral 16–18px.

## Assets
- **Iconografie**: SVG inline stroke-based (bookmark, stea, chevron, săgeți, microfon, check, warning, close). Recreați cu librăria de icoane a codebase-ului (ex. lucide-react — set aproape identic).
- **Vizualuri produs**: SVG generate (placeholder). **Înlocuiți cu fotografii reale.**
- **Fonturi**: Google Fonts — Barlow + Hanken Grotesk (+ Inter fallback).
- Fără imagini bitmap externe.

## Responsive
Mobil: widget full-screen. Desktop: panou ancorat colț, lățime ~430px, înălțime `min(820px, 90vh)`, radius 20px, umbră mare; buton flotant de deschidere (nu inclus în mock — de adăugat în host). Firul de chat e singura zonă cu scroll; header/composer rămân ficși.

## Screenshots
Folderul `screenshots/` conține referințele vizuale ale stărilor cheie (temă light, singura temă):
- `01-welcome.png` — ecranul de start cu prompturile sugerate.
- `02-thinking.png` — lanțul de gândire finalizat + întrebarea de clarificare.
- `03-recomandare-erou.png` — cardul-erou de recomandare cu scor AI + „de ce".
- `04-grid-complementare.png` — grila de produse complementare + chips follow-up.
- `05-comparatie.png` — modulul de comparație A/B + verdictul + bara de încredere.
- `06-rutina.png` — timeline-ul rutinei complete (5 pași).
- `07-refuz-onest.png` — refuzul onest la o cerere imposibilă.

## Files
- `AriaChat Light.dc.html` — widget complet, temă light (sursa de adevăr, singura temă).
- `Aria Product.dc.html` — vizualuri SVG de produs (placeholder).
- `support.js` — runtime de prototip (doar referință; nu se portează).
