// NX-244/NX-245 — shell-ul PASIV al widgetului v2.
//
// Ce a rămas din `ChatWidget.jsx` (v1): layoutul și paleta. Ce a dispărut, fiindcă era logică de
// domeniu în browser:
//
//   • `greeting()` + `INITIAL_SUGGESTIONS` hardcodate  → salutul e un view al serverului;
//   • `ThinkingIndicator` cu trei timere locale        → progresul e text server-owned sau nimic;
//   • `CartView` + `SavedDrawer` + `useCart`/`useWishlist` → coșul e al conversației (NX-237);
//   • acumulatorul `criteria` și bara „Rețin"          → `memory` e un bloc, snapshot, nu istoric;
//   • toastul „Produsul a fost adăugat"                → nicio confirmare fără receipt de la server;
//   • `?preview=1` + `chatDemo.js`                     → nicio conversație falsă, niciodată;
//   • `loadMessages()` din `localStorage`              → transcriptul e al backendului.
//
// NX-245 a adăugat UN singur lucru conceptual: FORMULA. Toate controalele care pot crea un tur
// citesc aceeași valoare, calculată o dată, aici. Înainte, fiecare control își alegea singur
// condiția — inputul se uita la `canSubmit && composer.enabled`, acțiunile doar la `canSubmit`,
// iar „Conversație nouă" la altceva. Trei formule înseamnă trei ocazii ca una să rămână în urmă,
// iar cea rămasă în urmă e exact aceea prin care intră al doilea tur.
//
// Shell-ul tot nu compune text și nu interpretează nicio acțiune — dă mai departe tokenul opac.

import { useCallback, useEffect, useRef, useState } from 'react'
import WebViewRenderer from '../components/WebViewRenderer.jsx'
import WebViewErrorBoundary from './WebViewErrorBoundary.jsx'
import ChatComposer from '../components/ChatComposer.jsx'
import ChatDialog from '../components/ChatDialog.jsx'
import ChatLiveRegion from '../components/ChatLiveRegion.jsx'
import ChatProgress, { serverProgress } from '../components/ChatProgress.jsx'
import { TECHNICAL_COPY } from './technicalCopy.js'

/**
 * @param {{controller: object, open?: boolean, onOpenChange?: (open: boolean) => void,
 *   onMetric?: (name: string, labels: object) => void}} props
 *   `controller` = rezultatul lui `useWebChatController` (NX-243). Shell-ul NU creează un al
 *   doilea controller și nu ține o a doua sursă de adevăr.
 *
 *   `open`/`onOpenChange` sunt opționale: dacă apelantul nu le dă, shell-ul își ține singur
 *   starea. Integrarea în aplicație (butonul „Întreabă Aria" din antet, `?chat=1`) o face
 *   entry-ul, fiindcă ea ține de rutare și de `window` — nu de randarea unui view.
 */
export default function WebChatWidgetV2({ controller, open: openProp, onOpenChange, onMetric }) {
  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState
  const setOpen = useCallback(
    (next) => {
      setOpenState(next)
      onOpenChange?.(next)
    },
    [onOpenChange],
  )
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const lastViewRef = useRef(null)

  const { view, views, chrome, composer, announcements, canSubmit, busy, fault, canRetry } =
    controller
  const progress = serverProgress({ progressStatus: controller.progressStatus, view, announcements })
  // Cine anunță starea: regiunea live, dacă serverul a livrat copy-ul `a11y`. Dacă nu, rândul de
  // progres preia rolul, ca să nu rămână nimeni fără informație — vezi `ChatProgress`. Exact UNUL
  // dintre ele e regiune live la un moment dat.
  const announced = announcements !== null && announcements !== undefined

  const onMetricRef = useRef(onMetric)
  onMetricRef.current = onMetric
  const metric = useCallback((name, labels) => onMetricRef.current?.(name, labels), [])

  // ── FORMULA UNICĂ ─────────────────────────────────────────────────────────────────────────
  // Tehnică prin construcție: se uită la starea mașinii și la politica de composer a serverului.
  // NU consultă produse, stoc, preț, confidence sau textul vreunei etichete — dacă ar face-o,
  // frontendul ar redeveni al doilea creier exact prin ușa pe care NX-244 a închis-o.
  const turnControlsDisabled = !canSubmit || composer?.enabled === false

  // „Conversație nouă" ia DOAR jumătatea de single-flight. Motivul e concret: `composer.enabled`
  // e o politică a serverului despre CÂMPUL DE TEXT („nu mai accept mesaje în conversația asta"),
  // iar butonul ăsta nu trimite un mesaj — pornește o conversație nouă. Legat de aceeași formulă,
  // un `enabled: false` terminal ar lăsa utilizatorul fără input ȘI fără reset, adică într-o
  // fundătură din care singura ieșire e închiderea widgetului. Resetul rămâne interzis cât timp
  // există un tur activ (guardul dur e oricum în controller: `reset()` refuză).
  const newChatDisabled = !canSubmit

  /** Eticheta de stare pentru metrică — vocabular închis, luat din faza mașinii. */
  const blockedState = canSubmit ? 'composer_disabled' : controller.state.phase

  const reportBlocked = useCallback(
    (controlType) =>
      metric('web_turn_control_blocked_total', { control_type: controlType, state: blockedState }),
    [metric, blockedState],
  )

  // Al DOILEA guard, peste `disabled` din DOM. Un atribut `disabled` oprește utilizatorul, nu un
  // `dispatchEvent` programatic (extensie de browser, script de automatizare, test adversarial).
  // Guardul din NX-243 e mai jos, în controller; ăsta e cel care cunoaște politica serverului.
  const submitText = useCallback(
    (text) => {
      if (turnControlsDisabled) {
        reportBlocked('composer')
        return false
      }
      return controller.sendText(text, { source: 'composer' })
    },
    [turnControlsDisabled, reportBlocked, controller],
  )

  const submitAction = useCallback(
    (token) => {
      if (turnControlsDisabled) {
        reportBlocked('action')
        return false
      }
      return controller.sendAction(token)
    },
    [turnControlsDisabled, reportBlocked, controller],
  )

  const newChat = useCallback(() => {
    if (newChatDisabled) {
      reportBlocked('new_chat')
      return
    }
    controller.reset()
  }, [newChatDisabled, reportBlocked, controller])

  // Scroll: un răspuns nou se aliniază cu ÎNCEPUTUL lui în viewport (răspunsurile lungi altfel
  // sar la coadă și ascund exact partea de citit); orice altceva merge la capăt.
  const viewCount = views.length
  useEffect(() => {
    const container = scrollRef.current
    if (container === null) return
    const node = lastViewRef.current
    if (node !== null) {
      const top = node.getBoundingClientRect().top
        - container.getBoundingClientRect().top
        + container.scrollTop
      container.scrollTop = Math.max(0, top - 10)
      return
    }
    container.scrollTop = container.scrollHeight
  }, [viewCount, busy])

  // ── Focusul, când controlul de sub el se dezactivează ──────────────────────────────────────
  // Când React pune `disabled` pe inputul focusat, browserul mută focusul pe `<body>`: următorul
  // Tab reia de la începutul paginii, iar screen readerul nu mai are context. Îl PARCĂM în
  // transcript (vizibil, e locul în care apare răspunsul) și îl oferim înapoi composerului când
  // redevine folosibil — dar numai dacă utilizatorul nu l-a mutat între timp singur.
  const parkedRef = useRef(false)
  const wasDisabledRef = useRef(turnControlsDisabled)
  useEffect(() => {
    const was = wasDisabledRef.current
    wasDisabledRef.current = turnControlsDisabled
    if (was === turnControlsDisabled) return
    const log = scrollRef.current
    const active = typeof document === 'undefined' ? null : document.activeElement
    if (turnControlsDisabled) {
      // Focusul e „pierdut" în două forme, în funcție de mediu: browserele îl mută pe `<body>`
      // când elementul focusat devine `disabled`, iar jsdom îl lasă pe nodul dezactivat. Ambele
      // înseamnă același lucru — utilizatorul a rămas fără punct de plecare. Dacă focusul e pe
      // altceva viu (close, un link din răspuns), omul se uită acolo și nu-l atingem.
      // `'disabled' in active`, nu `active.disabled`: `document.activeElement` e tipat `Element`,
      // iar `disabled` există doar pe controalele de formular.
      const lost =
        active === null
        || active === document.body
        || ('disabled' in active && active.disabled === true)
      if (lost && log !== null) {
        log.focus()
        parkedRef.current = true
      }
      return
    }
    if (!parkedRef.current) return
    parkedRef.current = false
    if (active === log) inputRef.current?.focus()
  }, [turnControlsDisabled])

  return (
    <ChatDialog
      open={open}
      onOpenChange={setOpen}
      chrome={chrome}
      newChatDisabled={newChatDisabled}
      onNewChat={newChat}
      initialFocusRef={inputRef}
      onMetric={onMetric}
    >
      {/* Anunțurile: UN singur proprietar, ascuns vizual, text integral server-owned. */}
      <ChatLiveRegion
        progressStatus={controller.progressStatus}
        view={view}
        announcements={announcements}
        onMetric={onMetric}
      />

      <div
        ref={scrollRef}
        // `log` + `additions`: se anunță ce se ADAUGĂ, nu tot firul la fiecare revizie. `aria-busy`
        // spune tehnologiei asistive că mai vine ceva, fără niciun cuvânt inventat de noi.
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-busy={busy}
        tabIndex={-1}
        className="flex-1 overflow-y-auto px-3 min-[380px]:px-4 py-4 min-[380px]:py-5 space-y-6 bg-[var(--aria-bg)]"
      >
        {controller.sessionOutcome === 'new_session' ? (
          <div className="rounded-xl border border-[var(--aria-border)] bg-[var(--aria-surface-2)] px-3 py-2 text-[12px] text-[var(--aria-text-4)]">
            {TECHNICAL_COPY.sessionRenewed}
          </div>
        ) : null}

        {views.map((item, index) => (
          <div key={item.turn.id} ref={index === views.length - 1 ? lastViewRef : null}>
            {/* Boundary per view: un view pe care buildul ăsta nu-l poate randa nu doboară firul. */}
            <WebViewErrorBoundary onMetric={onMetric}>
              <WebViewRenderer
                view={item}
                onSubmitAction={submitAction}
                disabled={turnControlsDisabled}
                onMetric={onMetric}
              />
            </WebViewErrorBoundary>
          </div>
        ))}

        <ChatProgress progress={progress} announced={announced} />

        {/* Eroare TEHNICĂ (transport/sesiune/contract) — stare a widgetului, niciodată o replică
            a asistentului. `role="alert"` e potrivit AICI fiindcă blocul apare doar când NU mai
            suntem ocupați: o reconectare în curs ține `busy` adevărat și nu ajunge niciodată să
            întrerupă cu voce tare. Textul serverului câștigă dacă există. */}
        {fault && !busy ? (
          <div
            role="alert"
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900"
          >
            {fault.serverMessage || TECHNICAL_COPY.connectionLost}
            {canRetry ? (
              <button
                type="button"
                onClick={controller.retry}
                className="ml-2 font-semibold underline"
              >
                {TECHNICAL_COPY.retry}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <ChatComposer
        composer={composer}
        disabled={turnControlsDisabled}
        inputRef={inputRef}
        onSubmitText={submitText}
        onBlocked={reportBlocked}
      />
    </ChatDialog>
  )
}
