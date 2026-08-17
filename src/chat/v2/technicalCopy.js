// NX-244 — SINGURUL text scris în frontend, și numai pentru stări TEHNICE.
//
// Granița, explicit: tot ce ține de conversație, catalog, preț, disponibilitate, recomandare,
// salut, disclaimer sau no-result vine de la server. Copy-ul de ramă (launcher, titlu, composer,
// anunțuri a11y) vine tot de la server, prin `view_copy` la bootstrap și prin `chrome` în fiecare
// view. Aici rămân doar situațiile pe care serverul NU le poate descrie, fiindcă nu le vede:
//
//   • rețeaua a căzut / requestul n-a ajuns niciodată;
//   • buildul clientului nu poate randa un view valid (drift de schemă);
//   • bootstrapul a eșuat, deci nici măcar copy-ul de ramă n-a sosit.
//
// Un server nu poate trimite „conexiunea cu serverul s-a întrerupt". De asta textele astea sunt
// aici și nu acolo — nu fiindcă e mai comod.
//
// Regula lor: strict tehnice, fără promisiuni comerciale, fără nume de produs, fără cifre. Când
// serverul CHIAR are ceva de spus (`error.message` dintr-un `ErrorView`), textul lui câștigă;
// astea sunt ultima plasă, nu prima alegere.
//
// Limitare cunoscută, de dus la backend: sunt `ro` fixe, deci nu urmează locale-ul tenantului ca
// restul copy-ului (D3). Corect ar fi să vină din `view_copy` ca secțiune proprie. Până atunci,
// suprafața e mică și deliberat plicticoasă.

export const TECHNICAL_COPY = Object.freeze({
  /** Numele accesibil al launcherului cât timp serverul n-a livrat încă `chrome`. */
  launcherFallback: 'Asistent',
  /** Transport căzut, timeout, buget epuizat. Însoțit de reîncercare când are sens. */
  connectionLost: 'Conexiunea cu asistentul s-a întrerupt.',
  retry: 'Reîncearcă',
  /** Sesiunea a expirat și a fost înlocuită: e o discontinuitate, nu o replică a asistentului. */
  sessionRenewed: 'Sesiunea a expirat, așa că am pornit o conversație nouă.',
  /** Buildul nu poate randa un view valid pentru hashul negociat (invariant de renderer). */
  renderUnavailable: 'Nu pot afișa acest răspuns în versiunea curentă a paginii.',
  reload: 'Reîncarcă pagina',
})
