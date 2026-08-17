// NX-244 — tabelul de comparație, randat exact cum a venit.
//
// Headers, rânduri, celule și tonuri sunt calculate de backend. Frontendul nu decide câștigătorul,
// nu compară prețuri ca să bolduiască ceva, nu reordonează coloanele și nu sare peste un rând
// „neinteresant".
//
// Celula fără text: `text === null` înseamnă că backendul spune explicit „necunoscut". NU punem
// „—" în loc — v1 exact asta făcea (`cell.text ?? '—'`), iar cardul o interzice pe bună dreptate:
// dacă designul vrea o liniuță, ea vine ca text din server, în locale-ul potrivit. Un placeholder
// local face „nu știu" să arate identic cu „am verificat și nu are", care sunt lucruri diferite.
//
// Desktop și mobil folosesc ACELEAȘI date; diferă doar cum încap pe ecran (aici: scroll
// orizontal în container propriu, ca pagina să nu se lățească).

import { SCHEMA_DEFAULTS, TONE_TEXT_CLASS, resolveToken } from '../blockTokens.js'

function Cell({ cell }) {
  if (cell.text === undefined || cell.text === null) {
    // Gol vizual, dar ANUNȚAT pentru cititoarele de ecran: o celulă tăcută într-un tabel de
    // comparație e ambiguă. `aria-label` e singurul text local, și e tehnic, nu comercial.
    return <td className="px-2.5 py-2" aria-label="—" />
  }
  const tone = cell.tone ?? SCHEMA_DEFAULTS.tone
  return <td className={`px-2.5 py-2 ${resolveToken(TONE_TEXT_CLASS, tone, 'tone')}`}>{cell.text}</td>
}

export default function ComparisonBlock({ block }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--aria-border)] bg-white">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-[var(--aria-border-2)]">
            <th className="text-left px-2.5 py-2 font-medium text-[var(--aria-text-4)]" scope="col" />
            {block.headers.map((header, i) => (
              <th
                key={i}
                scope="col"
                className="text-left px-2.5 py-2 font-semibold text-[var(--aria-text)]"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, i) => (
            <tr key={i} className="border-b border-[var(--aria-border-2)] last:border-0">
              <th scope="row" className="text-left px-2.5 py-2 font-medium text-[var(--aria-text-4)]">
                {row.label}
              </th>
              {row.cells.map((cell, j) => (
                <Cell key={j} cell={cell} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
