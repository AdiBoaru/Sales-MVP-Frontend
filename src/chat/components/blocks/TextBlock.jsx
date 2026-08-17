// NX-244 — text simplu, cu stil ales dintr-un enum finit.
//
// `block.text` intră ca text React: escapat de framework, niciodată `dangerouslySetInnerHTML`.
//
// Ce NU face, deși v1 făcea: nu parsează markdown ca să ghicească headinguri, nu taie răspunsul
// în „intro" și „rest" cu regex (`replySplit`), nu deduce liste din liniuțe. Dacă designul cere
// un titlu sau o listă, projectorul (NX-240) emite blocurile potrivite — structura vizuală e o
// decizie a compunerii, nu o ghicitoare de pe client.

import { SCHEMA_DEFAULTS, TEXT_VARIANT_CLASS, resolveToken } from '../blockTokens.js'

export default function TextBlock({ block }) {
  const variant = block.variant ?? SCHEMA_DEFAULTS.variant
  // `whitespace-pre-line`: păstrăm exact rândurile trimise de server, fără să le re-interpretăm.
  return (
    <p className={`whitespace-pre-line ${resolveToken(TEXT_VARIANT_CLASS, variant, 'variant')}`}>
      {block.text}
    </p>
  )
}
