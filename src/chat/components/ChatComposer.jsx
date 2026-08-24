// NX-245 — composerul, cu single-flight REAL.
//
// În v1, inputul rămânea scriibil cât timp `sending` era adevărat, iar submitul era doar ignorat
// în handler. Din afară, asta arată identic cu o aplicație stricată: scrii o frază întreagă, apeși
// Enter, nu se întâmplă nimic și nimeni nu-ți spune de ce. Un control care nu poate fi folosit
// trebuie să ARATE și să RAPORTEZE că nu poate fi folosit — `disabled`, nu `readOnly` și nu un
// `return` tăcut.
//
// Ce apără fișierul ăsta, dincolo de atributul `disabled`:
//
//   • IME — la scrierea cu compoziție (maghiară cu dead keys, chineză, japoneză, orice tastatură
//     cu accente compuse), Enter CONFIRMĂ candidatul; nu e submit. Trimiterea pe acel Enter ar
//     rupe cuvântul în două și ar trimite jumătate. `isComposing` e sursa de adevăr a browserului;
//     `compositionstart/end` e plasa pentru cei care nu îl setează pe `keydown`.
//   • Guardul dublu — chiar cu DOM-ul dezactivat, un `dispatchEvent` programatic (extensie,
//     script de test, automatizare) poate declanșa submitul. De aceea `onSubmitText` e apelat
//     numai după ce se re-verifică starea, iar apelantul mai are un guard peste el (NX-243).
//
// Fără microfon pe calea v2, deliberat: contractul `ChromeView` nu are un nume accesibil
// server-owned pentru el, iar cardul interzice explicit inventarea de etichete în frontend.
// Dictarea rămâne în v1 până când backendul livrează copy-ul (vezi follow-up în PR).

import { useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { TECHNICAL_COPY } from '../v2/technicalCopy.js'
import {
  COMPOSER_COUNTER_VISIBLE_AT,
  COMPOSER_MAX_LENGTH,
  messageLength,
} from '../composerLimits.js'

/**
 * @param {{composer: object|null, disabled: boolean, inputRef?: {current: any},
 *   onSubmitText: (text: string) => boolean, onBlocked?: (control: string) => void}} props
 *   `disabled` = formula unică de single-flight, calculată de shell. Composerul NU o recalculează
 *   și mai ales nu se uită la produse, stoc sau status ca să decidă singur.
 */
export default function ChatComposer({ composer, disabled, inputRef, onSubmitText, onBlocked }) {
  const [text, setText] = useState('')
  const composingRef = useRef(false)
  // O SINGURĂ valoare stă la baza contorului, a butonului și a submitului. Dacă contorul ar număra
  // textul brut iar guardul pe cel trimis, ar exista o fâșie în care contorul arată roșu pentru
  // niște spații de la coadă pe care submitul oricum le-ar fi tăiat — adică un buton blocat fără
  // motiv vizibil, exact ce evită fișierul ăsta.
  const value = text.trim()
  const empty = value.length === 0
  const length = messageLength(value)
  const overLimit = length > COMPOSER_MAX_LENGTH
  const showCounter = length > COMPOSER_COUNTER_VISIBLE_AT

  const submit = (event) => {
    event.preventDefault()
    // Ordinea contează: întâi starea, apoi conținutul. Un submit sosit în stare blocată e un
    // eveniment de raportat (cineva a ocolit DOM-ul), nu doar un no-op.
    if (disabled) {
      onBlocked?.('composer')
      return
    }
    if (composingRef.current) return
    if (value.length === 0) return
    // Enter e a doua ușă către submit, iar un buton `disabled` n-o închide singur în toate
    // motoarele. Guardul de lungime stă aici, nu doar pe atributul butonului.
    if (overLimit) return
    // Inputul se golește DOAR dacă turul chiar a pornit: guardul sincron e în controller, iar
    // ștergerea textului unui client care n-a trimis nimic e o pierdere reală.
    if (onSubmitText(value)) setText('')
  }

  const onKeyDown = (event) => {
    if (event.key !== 'Enter') return
    // `nativeEvent.isComposing` e setat de browser pe DURATA compoziției; `composingRef` acoperă
    // motoarele care îl omit. Oricare dintre ele adevărat ⇒ Enter aparține IME-ului, nu nouă.
    if (event.nativeEvent?.isComposing === true || composingRef.current) {
      event.preventDefault()
      return
    }
    // Input pe UN rând: nu există newline de inserat, deci Shift+Enter nu are un comportament
    // „de ghicit". Decizie explicită (cerută de card): nu se adaugă multiline în acest task.
    if (event.shiftKey) event.preventDefault()
  }

  return (
    <form
      onSubmit={submit}
      className="px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-[var(--aria-border-2)] bg-white flex-shrink-0"
    >
      {/* `nx-composer-pill` = ancora inelului de focus de tastatură (index.css). Fără
          `focus-within:border`: la click composerul nu-și schimbă conturul, ca în v1. */}
      <div className="nx-composer-pill flex items-center gap-2 pl-4 pr-1.5 py-1 bg-[var(--aria-surface-2)] border border-[var(--aria-border)] rounded-full">
        <input
          ref={inputRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          onCompositionStart={() => {
            composingRef.current = true
          }}
          onCompositionEnd={() => {
            composingRef.current = false
          }}
          disabled={disabled}
          // DELIBERAT fără `maxLength`: atributul ar tăia paste-ul tăcut, iar omul ar trimite
          // jumătate de întrebare convins că a trimis-o pe toată (vezi `composerLimits.js`).
          //
          // `aria-invalid` e singurul mod de a anunța „prea lung" fără să inventăm copy: e o stare
          // ARIA standard, pe care cititorul de ecran o rostește în limba UTILIZATORULUI. Un text
          // de eroare scris de noi ar fi încălcat NX-244 și ar fi rămas oricum `ro` fix.
          aria-invalid={overLimit}
          // Numele accesibil are fallback tehnic; PLACEHOLDERUL nu. Un placeholder inventat ar fi
          // copy vizibil („Întreabă orice despre produse…" din v1 e exact ce a scos NX-244), pe
          // când un nume accesibil e infrastructură: fără el, controlul nu se poate nici măcar numi.
          aria-label={composer?.label ?? TECHNICAL_COPY.composerFallback}
          placeholder={composer?.placeholder ?? undefined}
          className="flex-1 min-w-0 bg-transparent border-none outline-none text-[13px] text-[var(--aria-text)] placeholder:text-[var(--aria-text-5)] py-2 disabled:opacity-60 disabled:cursor-not-allowed"
        />
        {/* Contorul apare abia de la 80% din plafon și e NUMERIC deliberat: „1847/2000" n-are
            limbă, n-are promisiune comercială și nu trebuie tradus, deci nu e copy inventat în
            frontend — regula NX-244 rămâne întreagă. `aria-hidden` fiindcă e dublura vizuală a
            unei stări deja anunțate de `aria-invalid` pe input; un contor citit la fiecare tastă
            ar fi transformat cititorul de ecran într-un metronom. */}
        {showCounter ? (
          <span
            aria-hidden="true"
            className={`text-[11px] tabular-nums flex-shrink-0 ${
              overLimit ? 'text-red-600 font-semibold' : 'text-[var(--aria-text-5)]'
            }`}
          >
            {length}/{COMPOSER_MAX_LENGTH}
          </span>
        ) : null}
        <button
          type="submit"
          aria-label={composer?.send_label ?? TECHNICAL_COPY.sendFallback}
          title={composer?.send_label ?? TECHNICAL_COPY.sendFallback}
          disabled={disabled || empty || overLimit}
          // `after:-inset-1` extinde ținta de atingere la 44×44 fără să crească butonul vizual:
          // pilula composerului își păstrează înălțimea, degetul primește suprafața cerută.
          className="relative w-9 h-9 rounded-full aria-gradient-bg disabled:opacity-40 text-white flex items-center justify-center flex-shrink-0 transition-opacity hover:opacity-90 after:absolute after:content-[''] after:-inset-1 after:rounded-full"
        >
          <Send className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </form>
  )
}
