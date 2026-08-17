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

/**
 * @param {{composer: object|null, disabled: boolean, inputRef?: {current: any},
 *   onSubmitText: (text: string) => boolean, onBlocked?: (control: string) => void}} props
 *   `disabled` = formula unică de single-flight, calculată de shell. Composerul NU o recalculează
 *   și mai ales nu se uită la produse, stoc sau status ca să decidă singur.
 */
export default function ChatComposer({ composer, disabled, inputRef, onSubmitText, onBlocked }) {
  const [text, setText] = useState('')
  const composingRef = useRef(false)
  const empty = text.trim().length === 0

  const submit = (event) => {
    event.preventDefault()
    // Ordinea contează: întâi starea, apoi conținutul. Un submit sosit în stare blocată e un
    // eveniment de raportat (cineva a ocolit DOM-ul), nu doar un no-op.
    if (disabled) {
      onBlocked?.('composer')
      return
    }
    if (composingRef.current) return
    const value = text.trim()
    if (value.length === 0) return
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
      <div className="flex items-center gap-2 pl-4 pr-1.5 py-1 bg-[var(--aria-surface-2)] border border-[var(--aria-border)] rounded-full focus-within:border-[var(--aria-purple)] transition-colors">
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
          // Numele accesibil are fallback tehnic; PLACEHOLDERUL nu. Un placeholder inventat ar fi
          // copy vizibil („Întreabă orice despre produse…" din v1 e exact ce a scos NX-244), pe
          // când un nume accesibil e infrastructură: fără el, controlul nu se poate nici măcar numi.
          aria-label={composer?.label ?? TECHNICAL_COPY.composerFallback}
          placeholder={composer?.placeholder ?? undefined}
          className="flex-1 min-w-0 bg-transparent border-none outline-none text-[13px] text-[var(--aria-text)] placeholder:text-[var(--aria-text-5)] py-2 disabled:opacity-60 disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          aria-label={composer?.send_label ?? TECHNICAL_COPY.sendFallback}
          title={composer?.send_label ?? TECHNICAL_COPY.sendFallback}
          disabled={disabled || empty}
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
