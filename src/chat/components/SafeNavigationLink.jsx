// NX-244 — al doilea strat de apărare pentru un `href`.
//
// Backendul îl validează (`_validate_url`, NX-228) și decoderul NX-242 îl re-verifică la intrare,
// deci un `javascript:` n-ar trebui să ajungă niciodată aici. „N-ar trebui" nu e o garanție de
// securitate: asta e ULTIMA poartă dinaintea `href`-ului pus în DOM, iar costul ei e o funcție
// pură de zece rânduri.
//
// Poarta RESPINGE, nu repară. Un URL rescris în tăcere ar fi exact „sanitizarea care schimbă
// valoarea și continuă": clientul ar naviga altundeva decât a spus serverul, fără ca cineva să
// afle. Un href respins produce un control INACTIV plus un diagnostic — vizibil, nu tăcut.

import { SCHEMA_DEFAULTS } from './blockTokens.js'

/** Schemele periculoase. Oglindesc `FORBIDDEN_URL_PREFIXES` din decoderul NX-242. */
const FORBIDDEN_PREFIXES = Object.freeze([
  'javascript:',
  'data:',
  'file:',
  'vbscript:',
  'blob:',
  'about:',
])

/** Motive low-cardinality pentru `web_navigation_blocked_total{reason}`. */
export const NAVIGATION_BLOCK_REASONS = Object.freeze({
  NOT_A_STRING: 'not_a_string',
  FORBIDDEN_SCHEME: 'forbidden_scheme',
  PROTOCOL_RELATIVE: 'protocol_relative',
  MALFORMED: 'malformed',
})

/**
 * Caractere de control (C0 + DEL). Verificate pe cod, nu prin regex: un range de control scris
 * literal într-un fișier sursă e invizibil la review și se pierde la primul copy-paste.
 */
function hasControlChar(value) {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

/**
 * `null` dacă URL-ul e afișabil, altfel motivul respingerii.
 *
 * Permis: cale absolută de pe același origin (`/…`) sau `https://`. Interzis: schemele de mai sus,
 * protocol-relativ (`//evil` moștenește schema paginii gazdă), whitespace/backslash (vectorul
 * clasic `java\nscript:`) și caracterele de control.
 */
export function urlBlockReason(value) {
  if (typeof value !== 'string' || value.length === 0) return NAVIGATION_BLOCK_REASONS.NOT_A_STRING
  if (/\s/.test(value) || value.includes('\\')) return NAVIGATION_BLOCK_REASONS.MALFORMED
  if (hasControlChar(value)) return NAVIGATION_BLOCK_REASONS.MALFORMED
  const lowered = value.toLowerCase()
  if (FORBIDDEN_PREFIXES.some((prefix) => lowered.startsWith(prefix))) {
    return NAVIGATION_BLOCK_REASONS.FORBIDDEN_SCHEME
  }
  if (value.startsWith('//')) return NAVIGATION_BLOCK_REASONS.PROTOCOL_RELATIVE
  if (value.startsWith('/')) return null
  return lowered.startsWith('https://') ? null : NAVIGATION_BLOCK_REASONS.FORBIDDEN_SCHEME
}

/**
 * Ancoră cu href verificat. Un href respins randează un `<span>` inactiv (aria-disabled) — nu
 * dispare din pagină și nu devine un buton care face altceva.
 *
 * `rel="noopener noreferrer"` pe `_blank` nu e opțional: fără `noopener`, pagina deschisă capătă
 * `window.opener` și poate rescrie fila noastră (tabnabbing).
 */
/**
 * @param {{href?: string, target?: '_self'|'_blank', className?: string,
 *   children?: import('react').ReactNode, onBlocked?: (reason: string) => void}} props
 */
export default function SafeNavigationLink({
  href,
  target = /** @type {'_self'|'_blank'} */ (SCHEMA_DEFAULTS.target),
  className,
  children,
  onBlocked,
}) {
  const blocked = urlBlockReason(href)
  if (blocked !== null) {
    onBlocked?.(blocked)
    return (
      <span className={className} aria-disabled="true" data-blocked={blocked}>
        {children}
      </span>
    )
  }
  const external = target === '_blank'
  return (
    <a
      href={href}
      target={target}
      rel={external ? 'noopener noreferrer' : undefined}
      className={className}
    >
      {children}
    </a>
  )
}
