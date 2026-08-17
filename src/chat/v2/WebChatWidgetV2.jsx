// NX-244 — shell-ul PASIV al widgetului v2.
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
// Ce ține shell-ul: deschis/închis, scroll și legătura cu controllerul NX-243. Atât. Nu compune
// text, nu decide ce se poate trimite (`canSubmit` e al mașinii de stare) și nu interpretează
// nicio acțiune — dă mai departe tokenul opac.

import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Plus, Send, X } from 'lucide-react'
import WebViewRenderer from '../components/WebViewRenderer.jsx'
import WebViewErrorBoundary from './WebViewErrorBoundary.jsx'
import { TECHNICAL_COPY } from './technicalCopy.js'

/**
 * Progresul afișat: EXCLUSIV text de la server. `view.progress` dacă îl trimite, altfel anunțul
 * a11y al statusului real. Fără niciuna dintre ele nu se afișează nimic — o etapă inventată cu un
 * timer („Caut în catalog…") e o afirmație despre ce face serverul, pe care clientul n-o poate face.
 */
function serverProgress({ progressStatus, view, announcements }) {
  if (progressStatus === null) return null
  const progress = view?.progress
  if (progress?.label) return { label: progress.label, detail: progress.detail ?? null }
  const announcement = announcements?.[progressStatus]
  return announcement ? { label: announcement, detail: null } : null
}

function ProgressRow({ label, detail }) {
  return (
    <div className="flex justify-start" role="status" aria-live="polite">
      <div className="inline-flex items-center gap-2.5 bg-white border border-[var(--aria-border)] rounded-2xl rounded-bl-md shadow-sm px-3.5 py-2.5">
        <span className="w-[13px] h-[13px] rounded-full border-2 border-[rgba(47,102,76,0.2)] border-t-[#7C3AED] aria-think-spinner shrink-0" />
        <span className="text-xs font-medium text-[var(--aria-purple)]">{label}</span>
        {detail ? <span className="text-[11px] text-[var(--aria-text-4)]">{detail}</span> : null}
      </div>
    </div>
  )
}

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
  const setOpen = (next) => {
    setOpenState(next)
    onOpenChange?.(next)
  }
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)
  const lastViewRef = useRef(null)

  const { view, views, chrome, composer, announcements, canSubmit, busy, fault, canRetry } =
    controller
  const progress = serverProgress({ progressStatus: controller.progressStatus, view, announcements })

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

  const submit = (event) => {
    event.preventDefault()
    const text = input.trim()
    if (text.length === 0) return
    // Inputul se golește DOAR dacă turul chiar a pornit: guardul sincron e în controller, iar
    // ștergerea textului unui client care n-a trimis nimic e o pierdere reală.
    if (controller.sendText(text, { source: 'composer' })) setInput('')
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 aria-gradient-bg hover:opacity-90 text-white font-semibold pl-4 pr-5 py-3 rounded-full shadow-lg transition-opacity"
      >
        <MessageCircle className="w-4 h-4" aria-hidden="true" />
        {/* Numele vine de la server. Fallbackul TEHNIC intră doar cât timp bootstrapul n-a
            răspuns (sau a eșuat): un buton fără nume accesibil e mai rău decât unul generic. */}
        <span>{chrome?.launcher_label ?? TECHNICAL_COPY.launcherFallback}</span>
      </button>
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={chrome?.dialog_title ?? undefined}
      aria-describedby={chrome?.dialog_description ? 'nx-chat-v2-desc' : undefined}
      className="aria-widget fixed inset-y-0 right-0 z-50 w-full max-w-full sm:w-[452px] bg-white border-l border-[var(--aria-border-2)] shadow-2xl flex flex-col"
    >
      <div className="h-[2px] aria-gradient-bg flex-shrink-0" />

      <header className="flex items-center justify-between gap-2 min-[380px]:gap-3 px-3 min-[380px]:px-[18px] py-3 border-b border-[var(--aria-border-2)] flex-shrink-0">
        <div className="min-w-0 flex-1">
          {chrome?.dialog_title ? (
            <div className="aria-heading text-base leading-tight text-[var(--aria-text)] truncate">
              {chrome.dialog_title}
            </div>
          ) : null}
          {chrome?.dialog_description ? (
            <div
              id="nx-chat-v2-desc"
              className="hidden min-[360px]:block text-[10.5px] leading-tight tracking-[0.04em] text-[var(--aria-text-3)] truncate"
            >
              {chrome.dialog_description}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {chrome?.new_chat_label ? (
            <button
              type="button"
              onClick={() => controller.reset()}
              disabled={!canSubmit}
              title={chrome.new_chat_label}
              className="hidden min-[430px]:inline-flex items-center gap-1 text-xs font-medium text-[var(--aria-purple)] bg-[rgba(47,102,76,0.07)] hover:bg-[rgba(47,102,76,0.12)] px-2.5 py-1 rounded-full transition-colors disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              {chrome.new_chat_label}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={chrome?.close_label ?? undefined}
            title={chrome?.close_label ?? undefined}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--aria-text-3)] hover:bg-[var(--aria-surface-2)]"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
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
                onSubmitAction={controller.sendAction}
                disabled={!canSubmit}
                onMetric={onMetric}
              />
            </WebViewErrorBoundary>
          </div>
        ))}

        {progress ? <ProgressRow label={progress.label} detail={progress.detail} /> : null}

        {/* Eroare TEHNICĂ (transport/sesiune/contract) — stare a widgetului, niciodată o replică
            a asistentului. Textul serverului câștigă dacă există. */}
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

      <form
        onSubmit={submit}
        className="px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-[var(--aria-border-2)] bg-white flex-shrink-0"
      >
        <div className="flex items-center gap-2 pl-4 pr-1.5 py-1 bg-[var(--aria-surface-2)] border border-[var(--aria-border)] rounded-full focus-within:border-[var(--aria-purple)] transition-colors">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            // Single-flight REAL: inputul chiar se dezactivează cât timp turul e activ. `enabled`
            // din composerul serverului e respectat pe lângă starea locală a mașinii.
            disabled={!canSubmit || composer?.enabled === false}
            aria-label={composer?.label ?? undefined}
            placeholder={composer?.placeholder ?? undefined}
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-[13px] text-[var(--aria-text)] placeholder:text-[var(--aria-text-5)] py-2 disabled:opacity-60"
          />
          <button
            type="submit"
            aria-label={composer?.send_label ?? undefined}
            title={composer?.send_label ?? undefined}
            disabled={!canSubmit || input.trim().length === 0}
            className="w-9 h-9 rounded-full aria-gradient-bg disabled:opacity-40 text-white flex items-center justify-center flex-shrink-0 transition-opacity hover:opacity-90"
          >
            <Send className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  )
}
