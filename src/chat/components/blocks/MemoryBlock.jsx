// NX-244 — criteriile pe care asistentul le ține minte („Rețin: ten gras · sub 100 lei").
//
// SNAPSHOT, nu istoric. În v1, bara „Rețin" se construia în browser adunând `m.criteria` din tot
// transcriptul (`ChatWidget.jsx`), deduplicat local și append-only: o a DOUA memorie, care nu știa
// să uite. Când serverul renunța la un criteriu (clientul se răzgândea), browserul îl mai afișa —
// iar la primul refresh cele două memorii spuneau lucruri diferite.
//
// Aici lista e exact ce trimite serverul de fiecare dată. Nimic acumulat, nimic dedus, nimic
// păstrat între tururi.

export default function MemoryBlock({ block }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {block.title ? (
        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--aria-text-3)]">
          {block.title}
        </span>
      ) : null}
      {block.criteria.map((criterion, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[rgba(47,102,76,0.07)] border border-[rgba(47,102,76,0.22)] rounded-full text-[11px] text-[var(--aria-purple)]"
        >
          <span className="w-1 h-1 rounded-full bg-[#38BDF8] shrink-0" aria-hidden="true" />
          {criterion}
        </span>
      ))}
    </div>
  )
}
