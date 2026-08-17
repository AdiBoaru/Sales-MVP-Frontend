// NX-244 — blocul care face P6 posibil: no-result, fallback, recovery, eroare de contract.
//
// Orice terminal are cel puțin ASTA de afișat, iar textul vine ÎNTOTDEAUNA de la server. În v1,
// frontendul își inventa singur „N-am găsit nimic" și disclaimerul de sub fiecare răspuns; două
// formulări diferite pentru aceeași situație, niciuna sub controlul cuiva care răspunde de ele.
//
// `level` alege doar culoarea. `role="alert"` pe `error` fiindcă e o schimbare de stare pe care
// cineva care nu se uită la ecran trebuie să o afle (a11y-ul complet e al lui NX-245).

import { ActionList } from '../ActionControl.jsx'
import { NOTICE_LEVEL_CLASS, resolveToken } from '../blockTokens.js'

export default function NoticeBlock({ block, onSubmitAction, disabled, onMetric }) {
  return (
    <div
      role={block.level === 'error' ? 'alert' : undefined}
      className={`rounded-xl border px-3 py-2.5 ${resolveToken(NOTICE_LEVEL_CLASS, block.level, 'level')}`}
    >
      {block.title ? <p className="text-[13px] font-semibold">{block.title}</p> : null}
      <p className="text-[12.5px] leading-relaxed whitespace-pre-line">{block.text}</p>
      <ActionList
        actions={block.actions}
        onSubmitAction={onSubmitAction}
        disabled={disabled}
        onMetric={onMetric}
      />
    </div>
  )
}
