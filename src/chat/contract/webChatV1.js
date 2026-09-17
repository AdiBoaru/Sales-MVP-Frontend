// Punctul UNIC de intrare pentru un rezultat terminal servit pe contractul `web-chat.v1` prin
// transportul asincron (accept 202 → SSE/poll → 200).
//
// De ce e separat de `webViewV2.js` și de ce e MULT mai mic: cele două contracte au modele de
// încredere diferite, iar amestecarea lor ar fi produs un decoder care nu e corect pentru niciunul.
//
//   • `web-view.v2` e display-ready: serverul trimite prețul FORMATAT, tonul badge-ului, eticheta
//     butonului. Acolo o abatere de formă e un bug de contract care trebuie să EXPLODEZE, fiindcă
//     browserul nu are voie să repare nimic — de-aia validatorul e generat din schemă.
//   • `web-chat.v1` e, prin proiectare, ADITIV: „câmp absent ⇒ nu se randează". Un decoder strict
//     pe corp ar transforma fix proprietatea aia într-un defect: un câmp nou adăugat de backend
//     mâine ar face ca răspunsul de azi să nu mai fie livrat deloc.
//
// Deci granița e trasă unde chiar e: PLICUL se verifică strict (versiune, identitatea turului,
// statusul terminal — lucruri de care depinde corectitudinea transportului), iar CORPUL trece
// neatins către `normalizeReply`, singurul proprietar al mapării câmpurilor v1. Nicio a doua
// copie a acelei mapări nu se naște aici.

/** Versiunea de contract pe care o vorbește proiecția v1 (`RESPONSE_CONTRACT_SYNC_V1`). */
export const WEB_CHAT_V1_SCHEMA_VERSION = 'web-chat.v1'

/** Statusurile terminale, oglindind `TERMINAL_LEDGER_STATUSES` din backend. */
const TERMINAL_STATUSES = Object.freeze(['completed', 'failed', 'cancelled'])

/** Coduri stabile, low-cardinality (intră în diagnostice). */
export const WEB_CHAT_V1_DECODE_REASONS = Object.freeze({
  NOT_AN_OBJECT: 'not_an_object',
  UNSUPPORTED_VERSION: 'unsupported_version',
  MISSING_TURN: 'missing_turn',
  NOT_TERMINAL: 'not_terminal',
})

export class WebChatV1ContractError extends Error {
  constructor(reason) {
    super(`web-chat.v1: ${reason}`)
    this.name = 'WebChatV1ContractError'
    this.reason = reason
  }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validează PLICUL unui rezultat terminal v1 și întoarce payload-ul EXACT cum a venit.
 *
 * Aceeași referință la ieșire ca la intrare (ca la decoderul v2): nimic nu iese „reparat", deci
 * nu poate exista un răspuns aproape corect pe care cineva să-l depaneze mai târziu întrebându-se
 * cine l-a atins.
 *
 * @param {unknown} payload
 * @param {{onDiagnostic?: (d: {reason: string}) => void}} [options]
 * @returns {object}
 */
export function decodeWebChatV1(payload, { onDiagnostic } = {}) {
  /** @returns {never} */
  const fail = (reason) => {
    onDiagnostic?.({ reason })
    throw new WebChatV1ContractError(reason)
  }
  if (!isPlainObject(payload)) fail(WEB_CHAT_V1_DECODE_REASONS.NOT_AN_OBJECT)
  if (payload.schema_version !== WEB_CHAT_V1_SCHEMA_VERSION) {
    fail(WEB_CHAT_V1_DECODE_REASONS.UNSUPPORTED_VERSION)
  }
  const turn = payload.turn
  if (!isPlainObject(turn) || typeof turn.id !== 'string' || !turn.id) {
    fail(WEB_CHAT_V1_DECODE_REASONS.MISSING_TURN)
  }
  // Un terminal e singurul lucru care are voie să sosească pe 200. Dacă serverul ar trimite
  // altceva, controllerul ar încheia turul pe un răspuns care încă se scrie.
  if (!TERMINAL_STATUSES.includes(turn.status)) fail(WEB_CHAT_V1_DECODE_REASONS.NOT_TERMINAL)
  return payload
}

/** Statusul de sârmă al unui view terminal v1 — folosit de controller ca să nu re-deducă. */
export function terminalStatusOf(view) {
  return view?.turn?.status ?? null
}
