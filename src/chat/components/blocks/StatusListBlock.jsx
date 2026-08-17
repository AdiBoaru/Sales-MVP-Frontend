// NX-244 — stări cu ton și prospețime (status comandă, livrare, stoc).
//
// `freshness` e text server-owned („verificat acum 5 minute"): clientul NU calculează vechimea
// dintr-un timestamp și nu are ceas în ecuație. Două randări ale aceluiași payload arată identic
// oricând s-ar întâmpla — proprietatea pe care NX-240 a construit-o în projector s-ar pierde
// fix aici dacă am formata noi un „acum N minute".

import {
  ICON_COMPONENT, SCHEMA_DEFAULTS, TONE_DOT_CLASS, TONE_SOFT_CLASS, resolveToken,
} from '../blockTokens.js'

function StatusIcon({ icon, tone }) {
  if (icon === undefined || icon === null) {
    return (
      <span
        className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${resolveToken(TONE_DOT_CLASS, tone, 'tone')}`}
      />
    )
  }
  const Icon = resolveToken(ICON_COMPONENT, icon, 'icon')
  return (
    <span
      className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${resolveToken(TONE_SOFT_CLASS, tone, 'tone')}`}
    >
      <Icon className="w-3 h-3" aria-hidden="true" />
    </span>
  )
}

export default function StatusListBlock({ block }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {block.items.map((item, i) => {
        const tone = item.tone ?? SCHEMA_DEFAULTS.tone
        return (
          <li key={i} className="flex items-start gap-2 text-[12px]">
            <StatusIcon icon={item.icon} tone={tone} />
            <span className="text-[var(--aria-text-2)]">
              <span className="font-medium">{item.label}</span>
              {item.detail ? <span className="text-[var(--aria-text-4)]"> {item.detail}</span> : null}
              {item.freshness ? (
                <span className="block text-[11px] text-[var(--aria-text-5)]">{item.freshness}</span>
              ) : null}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
