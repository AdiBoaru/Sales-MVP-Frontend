// NX-244 — perechi etichetă/valoare (livrare, garanție, specificații).
//
// Ambele câmpuri sunt obligatorii în contract și deja localizate: nu există „valoare lipsă" de
// completat local și nicio unitate de adăugat („zile", „lei") în browser.

export default function KeyValueBlock({ block }) {
  return (
    <div className="rounded-xl border border-[var(--aria-border)] bg-white px-3 py-2.5">
      {block.title ? (
        <p className="text-[12px] font-semibold text-[var(--aria-text)] mb-1.5">{block.title}</p>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
        {block.rows.map((row, i) => (
          <div key={i} className="contents">
            <dt className="text-[var(--aria-text-4)]">{row.label}</dt>
            <dd className="text-[var(--aria-text-2)]">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
