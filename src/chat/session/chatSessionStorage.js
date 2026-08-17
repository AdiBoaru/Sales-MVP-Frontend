// NX-243 — recordul TEHNIC persistat local. Înlocuiește `aria-chat-messages`.
//
// Ce se salvează: identificatori opaci, atât. Handle-ul de sesiune (token/visitor_id/sig, tot
// opac pentru client), id-ul conversației, turul activ, `client_turn_id`-ul lui și cursorul de
// evenimente. Ce NU se salvează, niciodată: mesaje, blocuri, textul cumpărătorului, produse,
// acțiuni, `id_token`, context de pagină. Regula nu e o convenție — `write()` acceptă exclusiv
// cheile din `ALLOWED_KEYS`, iar orice altceva aruncă în dev.
//
// De ce contează: în v1 transcriptul trăia în `localStorage` și era a doua sursă de adevăr. La
// refresh, browserul reafișa o conversație pe care serverul putea să n-o mai aibă, iar un turn
// pierdut rămânea o bulă orfană. Aici recordul spune doar „ce turn tehnic urmăresc"; conținutul
// vine exclusiv din backend.
//
// Toate operațiile sunt tolerante la mediu: private mode, quota depășită, storage indisponibil
// sau record corupt nu au voie să rupă widgetul — degradează la „fără record" (bootstrap curat).

export const CHAT_STORAGE_VERSION = 2

/** Cheile permise în record. Enum ÎNCHIS: un câmp nou cere o decizie, nu o scăpare. */
const ALLOWED_KEYS = Object.freeze([
  'storage_version',
  'session_handle',
  'conversation_id',
  'active_turn_id',
  'client_turn_id',
  'last_event_id',
])

/** Câmpurile handle-ului de sesiune. Opace: nu se decodează și nu se compară pe bucăți. */
const HANDLE_KEYS = Object.freeze(['token', 'visitor_id', 'sig'])

const NULLABLE_ID_KEYS = Object.freeze([
  'conversation_id',
  'active_turn_id',
  'client_turn_id',
  'last_event_id',
])

const MAX_ID_LEN = 256

/**
 * Namespace stabil pe integrare + origin. Fără el, două vitrine servite de pe același host (sau
 * dev-ul și prod-ul în același browser) ar călca una peste alta pe aceeași cheie. Hash FNV-1a:
 * tokenul public nu ajunge în clar într-un nume de cheie.
 */
export function storageNamespace(parts) {
  let hash = 0x811c9dc5
  const input = parts.filter(Boolean).join('|')
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function isOpaqueId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LEN
}

function isHandle(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value)
  if (keys.length !== HANDLE_KEYS.length) return false
  return HANDLE_KEYS.every((key) => isOpaqueId(value[key]))
}

/**
 * `unknown` → record valid sau `null`. Nu repară și nu migrează: un record dintr-o versiune
 * veche (v1 avea transcript) e IGNORAT, nu convertit. Migrarea semantică ar însemna exact
 * transcriptul local pe care cardul îl scoate.
 */
export function parseRecord(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (raw.storage_version !== CHAT_STORAGE_VERSION) return null
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_KEYS.includes(key)) return null // câmp străin ⇒ record de neîncredere
  }
  if (!isHandle(raw.session_handle)) return null
  const record = {
    storage_version: CHAT_STORAGE_VERSION,
    session_handle: {
      token: raw.session_handle.token,
      visitor_id: raw.session_handle.visitor_id,
      sig: raw.session_handle.sig,
    },
    conversation_id: null,
    active_turn_id: null,
    client_turn_id: null,
    last_event_id: null,
  }
  for (const key of NULLABLE_ID_KEYS) {
    const value = raw[key]
    if (value === undefined || value === null) continue
    if (!isOpaqueId(value)) return null
    record[key] = value
  }
  // Un turn activ fără `client_turn_id` nu poate fi corelat, deci nu e un turn activ.
  if (record.active_turn_id !== null && record.client_turn_id === null) return null
  return record
}

/**
 * @param {{namespace?: string, storage?: any}} [config] `storage` e injectabil; implicit
 *   `localStorage` dacă există, `null` pentru „fără persistență".
 */
export function createChatSessionStorage({ namespace, storage } = {}) {
  const key = `nx-chat.v${CHAT_STORAGE_VERSION}.${namespace}`
  const backing = storage === undefined
    ? (typeof localStorage !== 'undefined' ? localStorage : null)
    : storage

  /** Orice acces poate arunca (private mode, storage dezactivat de politică). */
  const safe = (fn, fallback) => {
    if (backing === null) return fallback
    try {
      return fn()
    } catch {
      return fallback
    }
  }

  const read = () => safe(() => {
    const raw = backing.getItem(key)
    if (raw === null) return null
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      // Record corupt: îl ștergem ca să nu revenim la el la fiecare boot.
      safe(() => backing.removeItem(key), undefined)
      return null
    }
    const record = parseRecord(parsed)
    if (record === null) safe(() => backing.removeItem(key), undefined)
    return record
  }, null)

  return {
    key,
    read,

    /** Scrie un record complet nou (sesiune nouă). Șterge orice corelație veche. */
    start(sessionHandle) {
      const record = {
        storage_version: CHAT_STORAGE_VERSION,
        session_handle: sessionHandle,
        conversation_id: null,
        active_turn_id: null,
        client_turn_id: null,
        last_event_id: null,
      }
      return this.write(record, { replace: true })
    },

    /**
     * Patch peste recordul existent. Fără record valid și fără handle în patch, scrierea e
     * ignorată: nu construim un record pe jumătate din care recovery-ul să nu poată porni.
     */
    write(patch, { replace = false } = {}) {
      for (const field of Object.keys(patch)) {
        if (!ALLOWED_KEYS.includes(field)) {
          // Fail-fast în dezvoltare: e singura poartă care ține transcriptul afară.
          throw new Error(`chatSessionStorage: câmp nepermis "${field}"`)
        }
      }
      const base = replace ? null : read()
      const next = { ...(base || {}), ...patch, storage_version: CHAT_STORAGE_VERSION }
      if (!isHandle(next.session_handle)) return null
      for (const field of NULLABLE_ID_KEYS) {
        if (next[field] === undefined) next[field] = null
      }
      return safe(() => {
        backing.setItem(key, JSON.stringify(next))
        return next
      }, null)
    },

    /** Curăță ATOMIC corelația de turn, păstrând sesiunea și conversația. */
    clearTurn() {
      return this.write({ active_turn_id: null, client_turn_id: null, last_event_id: null })
    },

    /** Șterge tot. Folosit la sesiune nouă și la „conversație nouă". */
    clear() {
      safe(() => backing.removeItem(key), undefined)
    },
  }
}
