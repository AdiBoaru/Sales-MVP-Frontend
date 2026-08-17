// NX-244 — pași numerotați (rutină de îngrijire, pași de comandă).
//
// Numerotarea e VIZUALĂ, din poziția în listă — nu o reordonare și nu o prioritizare. Ordinea
// pașilor e a backendului; un „pas 1" mutat de client ar schimba sfatul.
//
// În v1, cardurile de rutină mutau wishlistul local. Aici nu există nicio mutație: dacă un pas
// are o acțiune, ea e un token opac ca oricare altul.

export default function RoutineBlock({ block }) {
  return (
    <div className="rounded-xl border border-[var(--aria-border)] bg-white px-3 py-2.5">
      {block.title ? (
        <p className="text-[12px] font-semibold text-[var(--aria-text)] mb-1.5">{block.title}</p>
      ) : null}
      <ol className="flex flex-col gap-1.5">
        {block.steps.map((step, i) => (
          <li key={i} className="flex gap-2 text-[12px]">
            <span
              className="w-4 h-4 mt-0.5 rounded-full bg-[var(--aria-surface-2)] text-[10px] font-bold flex items-center justify-center shrink-0"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span>
              <span className="font-medium text-[var(--aria-text)]">{step.title}</span>
              {step.detail ? (
                <span className="block text-[var(--aria-text-4)]">{step.detail}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
