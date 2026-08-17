// NX-244 — cardurile de produs. Aici se vedea cel mai clar al doilea creier din browser, deci
// aici merită enumerat ce a DISPĂRUT față de `ChatProductCard.jsx` (v1):
//
//   • `Intl.NumberFormat` + `Number(value)` peste preț  → `price.current` e text gata formatat;
//   • `Math.round(((list - price) / list) * 100)`        → `price.discount` vine calculat;
//   • `inferBadgeTone(label)` (regex pe „preț/promo")    → `badge.tone` e trimis explicit;
//   • lățimea barei de rating din `rating / 5`           → `rating` e un string localizat;
//   • `addToCart()` / `toggleWish()` la click            → mutațiile sunt acțiuni server-owned;
//   • `Spune-mi mai multe despre ${product.name}`        → tokenul acțiunii, nu un mesaj compus.
//
// Regula de afișare: un câmp absent înseamnă că elementul NU se afișează. Nu există preț de
// rezervă, „—" pus în loc, sau „În stoc" presupus. Absența e o informație, nu un gol de umplut.

import { ActionList } from '../ActionControl.jsx'
import { SCHEMA_DEFAULTS, TONE_BADGE_CLASS, resolveToken } from '../blockTokens.js'

function Badge({ badge }) {
  const tone = badge.tone ?? SCHEMA_DEFAULTS.tone
  return (
    <span
      className={`text-[10px] font-bold leading-none px-1.5 py-[3px] rounded-[3px] ${resolveToken(TONE_BADGE_CLASS, tone, 'tone')}`}
    >
      {badge.label}
    </span>
  )
}

/** Prețul, ca TREI string-uri deja localizate. Zero aritmetică, zero simbol de monedă local. */
function Price({ price }) {
  return (
    <p className="mt-1 flex items-baseline flex-wrap gap-x-2">
      <span className="text-[15px] font-extrabold text-[var(--aria-text)]">{price.current}</span>
      {price.previous ? (
        <span className="text-[11px] line-through text-[var(--aria-text-5)]">{price.previous}</span>
      ) : null}
      {price.discount ? (
        <span className="text-[11px] font-semibold text-red-600">{price.discount}</span>
      ) : null}
    </p>
  )
}

function ProductItem({ item, onSubmitAction, disabled, onMetric }) {
  return (
    // NX-245: `<li>` peste `<article>`-ul din NX-244. Lista dă numărul („3 elemente") înainte ca
    // cineva să înceapă să le parcurgă și îi spune unde se află („2 din 3"); `article` marchează
    // în continuare unde se termină un produs și începe următorul — altfel, la screen reader,
    // titlul, prețul și disponibilitatea a trei produse curg ca un singur paragraf și nu se mai
    // vede care preț e al cui.
    // Fără `display:contents` pe `<li>`: în mai multe browsere el scoate elementul din arborele de
    // accesibilitate, adică ar șterge exact semantica de listă pe care o adăugăm aici.
    <li>
      <article className="flex gap-3 bg-white border border-[var(--aria-border)] rounded-xl p-2.5 shadow-sm">
        {item.image ? (
          <div className="w-16 h-16 rounded-lg bg-[var(--aria-surface-2)] overflow-hidden shrink-0">
            {/* `alt` vine de la server: descrierea imaginii nu e o presupunere a clientului.
                Schema cere `alt` NON-VID (`minLength: 1`) și nu are marcaj de imagine decorativă,
                deci `alt=""` n-are de unde apărea — iar clientul nu inventează unul. */}
            <img src={item.image.src} alt={item.image.alt} className="w-full h-full object-cover" />
          </div>
        ) : null}
        <div className="flex-1 min-w-0">
          {item.badges?.length ? (
            <div className="flex flex-wrap gap-1 mb-1">
              {item.badges.map((badge, i) => (
                <Badge key={i} badge={badge} />
              ))}
            </div>
          ) : null}
          {item.subtitle ? (
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--aria-text-4)]">
              {item.subtitle}
            </p>
          ) : null}
          <p className="text-[13px] font-semibold leading-snug text-[var(--aria-text)]">
            {item.title}
          </p>
          {item.rating ? (
            <p className="text-[11px] text-[var(--aria-text-4)] mt-0.5">{item.rating}</p>
          ) : null}
          {item.price ? <Price price={item.price} /> : null}
          {item.availability ? (
            <p className="text-[11px] text-[var(--aria-text-4)] mt-0.5">{item.availability}</p>
          ) : null}
          {item.reason ? (
            <p className="text-[12px] leading-snug text-[var(--aria-text-3)] mt-1">{item.reason}</p>
          ) : null}
          <ActionList
            actions={item.actions}
            onSubmitAction={onSubmitAction}
            disabled={disabled}
            onMetric={onMetric}
          />
        </div>
      </article>
    </li>
  )
}

export default function ProductListBlock({ block, onSubmitAction, disabled, onMetric }) {
  return (
    <ul className="flex flex-col gap-2 list-none">
      {/* Ordinea e a backendului. Nicio sortare, nicio dedupe, niciun „cel mai bun" ridicat sus.
          `view_id` ca `key`: identitate din payload, nu index — un rerender care reordonează n-are
          voie să mute focusul de pe butonul apăsat pe cardul vecin. */}
      {block.items.map((item) => (
        <ProductItem
          key={item.view_id}
          item={item}
          onSubmitAction={onSubmitAction}
          disabled={disabled}
          onMetric={onMetric}
        />
      ))}
    </ul>
  )
}
