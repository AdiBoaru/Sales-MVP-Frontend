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
  /**
   * Numele accesibil al launcherului cât timp serverul n-a livrat încă `chrome`. NX-245 îl
   * refolosește și ca nume al dialogului în aceeași situație: un `role="dialog"` fără nume
   * accesibil e violare axe, iar starea „bootstrap picat" e una dintre stările canonice pe care
   * cardul cere zero violări.
   */
  launcherFallback: 'Asistent',
  /**
   * NX-245 — numele butonului de închidere când `chrome` lipsește. Butonul e doar o iconiță, deci
   * fără el nu are NICIUN nume accesibil: cineva care navighează cu screen readerul aude „buton"
   * și n-are cum să afle că e singura ieșire din panel. Aceeași regulă ca mai sus — tehnic, nu
   * comercial — și tot temporar: cu bootstrapul reușit, `chrome.close_label` câștigă întotdeauna.
   */
  closeFallback: 'Închide',
  /**
   * NX-245 — numele câmpului de text și al butonului de trimitere când `composer` lipsește.
   * NX-244 a decis DELIBERAT ca în starea „backend indisponibil" composerul să rămână vizibil și
   * dezactivat, ca starea să fie evidentă în loc de tăcută. Consecința: două controale fără nume
   * accesibil (`label` și `button-name`, ambele critice la axe). Fallbackurile le acoperă exact pe
   * durata în care serverul n-a livrat nimic — cu bootstrapul reușit, `composer.*` câștigă mereu.
   */
  composerFallback: 'Mesaj',
  sendFallback: 'Trimite',
  /** Transport căzut, timeout, buget epuizat. Însoțit de reîncercare când are sens. */
  connectionLost: 'Conexiunea cu asistentul s-a întrerupt.',
  retry: 'Reîncearcă',
  /** Sesiunea a expirat și a fost înlocuită: e o discontinuitate, nu o replică a asistentului. */
  sessionRenewed: 'Sesiunea a expirat, așa că am pornit o conversație nouă.',
  /** Buildul nu poate randa un view valid pentru hashul negociat (invariant de renderer). */
  renderUnavailable: 'Nu pot afișa acest răspuns în versiunea curentă a paginii.',
  reload: 'Reîncarcă pagina',
})
