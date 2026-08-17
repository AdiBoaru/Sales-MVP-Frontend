// NX-244 — defectele PROPRII ale rendererului.
//
// Nu sunt erori de payload (alea aparțin decoderului NX-242, care respinge înainte) și nu sunt
// erori de transport (alea sunt ale controllerului NX-243). Sunt situațiile în care payloadul e
// valid pentru schema negociată, dar BUILDUL ăsta nu îl poate randa: un tip de bloc din uniunea
// finită căruia nu îi corespunde o componentă, sau o valoare de enum fără mapare locală.
//
// De ce e o excepție și nu un `return null`: un renderer care sare peste ce nu înțelege afișează
// un răspuns pe jumătate și îl numește succes. Cumpărătorul vede o recomandare fără preț, sau o
// comparație fără rândul decisiv, și n-are cum să știe că lipsește ceva. Mai bine o stare tehnică
// onestă pentru TOT view-ul decât un adevăr parțial care arată complet.
//
// `reason` e low-cardinality și intră în metrici. Tipul brut al blocului NU devine niciodată
// label: e controlat de payload, deci nemărginit.

export const RENDERER_INVARIANT_REASONS = Object.freeze({
  UNREGISTERED_BLOCK_TYPE: 'unregistered_block_type',
  UNMAPPED_TOKEN: 'unmapped_token',
  UNKNOWN_ACTIVATION_TYPE: 'unknown_activation_type',
})

export class WebViewRendererInvariantError extends Error {
  /**
   * @param {string} reason una din `RENDERER_INVARIANT_REASONS`
   * @param {{token?: string}} [context] `token` = NUMELE enumului (ex. `tone`), nu valoarea lui.
   */
  constructor(reason, { token } = {}) {
    super(`web-view.v2 renderer: ${reason}${token ? ` (${token})` : ''}`)
    this.name = 'WebViewRendererInvariantError'
    this.reason = reason
    this.token = token ?? null
  }
}
