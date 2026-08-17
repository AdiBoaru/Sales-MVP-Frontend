// Deschiderea widgetului din afara lui (butonul „Întreabă Aria" din antetul vitrinei).
//
// NX-244 l-a scos din `ChatWidget.jsx` într-un modul propriu dintr-un motiv de BUILD, nu de stil:
// cât timp `openAria` era exportat de widgetul v1, orice pagină care îl importa trăgea după el
// tot arborele v1 — inclusiv `chatDemo.js` — și în buildul v2, unde v1 trebuie să dispară complet.
// Un event name și o funcție de trei rânduri nu aparțin niciunui protocol, deci stau separat și
// pot fi importate de amândouă.

export const ARIA_OPEN_EVENT = 'aria:open'

/** Cere widgetului montat să se deschidă. No-op dacă niciunul nu ascultă. */
export function openAria() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(ARIA_OPEN_EVENT))
}
