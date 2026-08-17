// NX-244 — singurul loc în care un token semantic al backendului devine ceva vizual.
//
// Backendul alege dintr-un vocabular FINIT (`tone`, `appearance`, `icon`, `variant`, `level`);
// frontendul deține implementarea. Asta e granița: serverul spune CE înseamnă, clientul decide
// CUM arată. Nici backendul nu trimite clase CSS, nici frontendul nu ghicește semantica.
//
// Ce a înlocuit: în v1, `inferBadgeTone(label)` citea eticheta cu un regex („preț", „favorit",
// „promo") și deducea culoarea din cuvinte românești. Adică regula de culoare trăia în browser,
// nedocumentată, netestată și ruptă la prima etichetă nouă sau la prima traducere.
//
// Regula de lookup: o valoare PREZENTĂ care nu e în hartă e un defect de build (schema a mers
// înainte, componentele nu), nu ceva de aproximat. `resolveToken` aruncă. Un `neutral` pus pe
// tăcute în locul unui `danger` necunoscut ar ascunde exact avertismentul care conta.

import {
  AlertTriangle, Check, Clock, Gift, Info, Percent, ShieldCheck, Tag, Truck,
} from 'lucide-react'
import { RENDERER_INVARIANT_REASONS, WebViewRendererInvariantError } from './rendererErrors.js'

/**
 * Valorile implicite DECLARATE ÎN SCHEMĂ pentru câmpurile opționale cu default.
 *
 * Nu sunt „defaults inventate de frontend" — pe astea cardul le interzice (`RON`, `„—"`,
 * `„În stoc"`). Sunt exact ce spune contractul NX-228 că înseamnă absența câmpului: `BadgeView.
 * tone` are `default: "neutral"`, `TextBlock.variant` are `default: "body"` ș.a.m.d. JSON Schema
 * nu injectează defaults la validare, deci un payload valid CHIAR poate sosi fără ele, iar cineva
 * trebuie să le aplice. Aici, o dată, explicit — nu împrăștiat prin componente ca `|| 'neutral'`.
 */
export const SCHEMA_DEFAULTS = Object.freeze({
  tone: 'neutral',
  appearance: 'secondary',
  variant: 'body',
  target: '_self',
  enabled: true,
})

/**
 * Un token din hartă, sau eroare de invariant. `name` intră în metrici (`tone`, `appearance`…);
 * VALOAREA nu, fiindcă e controlată de payload.
 */
export function resolveToken(map, value, name) {
  if (!Object.prototype.hasOwnProperty.call(map, value)) {
    throw new WebViewRendererInvariantError(RENDERER_INVARIANT_REASONS.UNMAPPED_TOKEN, {
      token: name,
    })
  }
  return map[value]
}

// ── tone ────────────────────────────────────────────────────────────────────────────────────
// Aceeași paletă ca v1 (`ChatProductCard`), ca portarea vizuală să nu schimbe designul aprobat.

/** Pastilă plină — badge-urile de pe cardul de produs. */
export const TONE_BADGE_CLASS = Object.freeze({
  neutral: 'bg-[#6c7180] text-white',
  info: 'bg-[#1c7ed6] text-white',
  success: 'bg-[#0ca678] text-white',
  warning: 'bg-[#f76707] text-white',
  danger: 'bg-[#e03131] text-white',
})

/** Variantă tentată — rândurile de status, unde o pastilă plină ar concura cu badge-urile. */
export const TONE_SOFT_CLASS = Object.freeze({
  neutral: 'bg-gray-100 text-gray-700',
  info: 'bg-sky-50 text-sky-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-800',
  danger: 'bg-rose-50 text-rose-700',
})

/** Bulină — celule de comparație și liste de status. */
export const TONE_DOT_CLASS = Object.freeze({
  neutral: 'bg-[var(--aria-text-5)]',
  info: 'bg-sky-500',
  success: 'bg-green-600',
  warning: 'bg-amber-500',
  danger: 'bg-red-600',
})

/** Culoarea textului unei celule de comparație tonate. */
export const TONE_TEXT_CLASS = Object.freeze({
  neutral: 'text-[var(--aria-text-2)]',
  info: 'text-sky-700',
  success: 'text-emerald-700',
  warning: 'text-amber-800',
  danger: 'text-rose-700',
})

// ── text ────────────────────────────────────────────────────────────────────────────────────

export const TEXT_VARIANT_CLASS = Object.freeze({
  lead: 'text-[15px] leading-relaxed text-[var(--aria-text)]',
  body: 'text-[13.5px] leading-relaxed text-[var(--aria-text-2)]',
  caption: 'text-[12px] text-[var(--aria-text-4)]',
  disclosure: 'text-[11px] text-[var(--aria-text-5)]',
})

// ── notice ──────────────────────────────────────────────────────────────────────────────────

export const NOTICE_LEVEL_CLASS = Object.freeze({
  info: 'bg-[var(--aria-surface-2)] border-[var(--aria-border)] text-[var(--aria-text-2)]',
  success: 'bg-green-50 border-green-200 text-green-900',
  warning: 'bg-amber-50 border-amber-200 text-amber-900',
  error: 'bg-red-50 border-red-200 text-red-900',
})

// ── action ──────────────────────────────────────────────────────────────────────────────────
// `appearance` alege DOAR clasa vizuală. Nu există nicăieri un switch pe `checkout`, `book` sau
// `add_to_cart`: ce face acțiunea știe exclusiv backendul, iar clientul trimite tokenul opac.

export const APPEARANCE_CLASS = Object.freeze({
  primary: 'aria-gradient-bg text-white hover:opacity-90',
  secondary:
    'text-[var(--aria-text-2)] bg-white border border-[var(--aria-border)] hover:border-[var(--aria-purple)]',
  chip: 'text-[var(--aria-purple)] bg-[rgba(47,102,76,0.07)] border border-[rgba(47,102,76,0.22)] hover:bg-[rgba(47,102,76,0.12)]',
  link: 'text-[var(--aria-purple)] underline',
  danger: 'text-red-700 bg-red-50 border border-red-200 hover:bg-red-100',
})

// ── icon ────────────────────────────────────────────────────────────────────────────────────
// Allowlist de componente locale. Backendul trimite un NUME din enum, niciodată markup.

export const ICON_COMPONENT = Object.freeze({
  truck: Truck,
  tag: Tag,
  percent: Percent,
  shield: ShieldCheck,
  clock: Clock,
  gift: Gift,
  info: Info,
  check: Check,
  alert: AlertTriangle,
})
