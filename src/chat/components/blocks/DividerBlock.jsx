// NX-244 — separator vizual emis EXPLICIT de projector.
//
// E în uniunea finită din schemă (`DividerBlock`), deși schița din card enumera doar zece tipuri:
// registryul trebuie să fie exhaustiv pentru hashul acceptat, iar sursa de adevăr e schema, nu
// schița. Un tip valid fără componentă ar fi invariant error — adică o stare tehnică pe tot
// view-ul, pentru o linie.
//
// Pur decorativ: `role="presentation"` ca să nu fie anunțat ca „separator" de cititoarele de ecran
// într-un fir de conversație unde nu separă secțiuni navigabile.

export default function DividerBlock() {
  return <hr className="border-[var(--aria-border-2)]" role="presentation" />
}
