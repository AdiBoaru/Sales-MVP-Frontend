// NX-244 — coșul, ca SNAPSHOT server-owned (NX-237).
//
// Blocul apare doar când backendul are coș canonic + receipt. Widgetul nu confirmă niciodată o
// mutație pe cont propriu: în v1, `handleAdd` scria în `localStorage` și arăta imediat toastul
// „Produsul a fost adăugat" — un adevăr inventat de browser, care putea contrazice serverul (și
// supraviețuia unui backend care refuzase operația).
//
// Totalul vine calculat, ca string. Nu se adună linii aici; `quantity` însuși e text localizat
// („2 bucăți"), nu un număr de înmulțit.

import { ActionList } from '../ActionControl.jsx'

export default function CartSummaryBlock({ block, onSubmitAction, disabled, onMetric }) {
  const lines = Array.isArray(block.lines) ? block.lines : []
  return (
    <div className="rounded-xl border border-[var(--aria-border)] bg-white px-3 py-2.5">
      {block.title ? (
        <p className="text-[12px] font-semibold text-[var(--aria-text)] mb-1.5">{block.title}</p>
      ) : null}
      {lines.length > 0 ? (
        <ul className="flex flex-col gap-1 text-[12px]">
          {lines.map((line) => (
            <li key={line.view_id} className="flex justify-between gap-3">
              <span className="text-[var(--aria-text-2)] min-w-0">
                <span className="text-[var(--aria-text-4)]">{line.quantity}</span> {line.title}
              </span>
              {line.price ? (
                <span className="text-[var(--aria-text)] font-medium shrink-0">
                  {line.price.current}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {block.total ? (
        <div className="flex justify-between gap-3 mt-2 pt-2 border-t border-[var(--aria-border-2)] text-[12.5px]">
          {/* Eticheta „Total" e a serverului, prin `block.title`/`total`; aici nu inventăm cuvinte:
              afișăm doar suma, cu accentul vizual care o face de citit. */}
          <span className="font-bold text-[var(--aria-text)] ml-auto">{block.total.current}</span>
        </div>
      ) : null}
      <ActionList
        actions={block.actions}
        onSubmitAction={onSubmitAction}
        disabled={disabled}
        onMetric={onMetric}
      />
    </div>
  )
}
