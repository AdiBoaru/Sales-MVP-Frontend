// NX-245 — single-flight, verificat ca UX, nu doar ca invariant de mașină.
//
// Distincția e tot cardul: NX-243 garantează că un al doilea tur nu PORNEȘTE. Aici se verifică
// altceva — că utilizatorul nu poate nici măcar să încerce, și că i se vede. Un input în care poți
// scrie o frază întreagă și al cărui submit e apoi înghițit în tăcere respectă invariantul și e
// totuși stricat.
//
// Regula pe care o apără fișierul: TOATE controalele care pot crea un tur citesc ACEEAȘI valoare.
// Fiecare test nou de aici e o ocazie ca una dintre formule să rămână în urmă.

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WebChatWidgetV2 from '@/chat/v2/WebChatWidgetV2'
import { BUSY_PHASES, VIEW_COPY, makeController, validViews } from './helpers/chatController.js'

function renderWidget(controller, props = {}) {
  return render(
    <WebChatWidgetV2 controller={controller} open onOpenChange={() => {}} {...props} />,
  )
}

/** Toate controalele care pot ajunge la `submitText`/`submitAction` într-un view dat. */
function turnControls() {
  const panel = screen.getByRole('dialog')
  return {
    input: within(panel).getByRole('textbox'),
    send: within(panel).getByRole('button', { name: VIEW_COPY.composer.send_label }),
    actions: within(panel)
      .getAllByRole('button')
      .filter((node) => node.hasAttribute('data-action-id')),
  }
}

describe('fiecare control creator de tur e inactiv în stările neterminale', () => {
  for (const phase of BUSY_PHASES) {
    it(`faza \`${phase}\``, () => {
      renderWidget(makeController({ views: ['recommendation'], phase }))
      const { input, send, actions } = turnControls()
      // `disabled`, nu `readOnly`: cerința din card e „nu poți scrie", nu „scrii degeaba".
      expect(input).toBeDisabled()
      expect(send).toBeDisabled()
      expect(actions.length).toBeGreaterThan(0)
      for (const action of actions) expect(action).toBeDisabled()
      // Închiderea NU e control creator de tur și rămâne disponibilă.
      expect(screen.getByRole('button', { name: VIEW_COPY.chrome.close_label })).toBeEnabled()
    })
  }

  it('și în stările în care nu există sesiune (bootstrapping / unavailable)', () => {
    for (const phase of ['uninitialized', 'bootstrapping', 'renewing', 'unavailable']) {
      const { unmount } = renderWidget(makeController({ views: ['greeting'], phase }))
      expect(screen.getByRole('textbox')).toBeDisabled()
      unmount()
    }
  })

  it('`composer.enabled: false` de la server dezactivează ȘI acțiunile, nu doar inputul', () => {
    // Formula unică. Înainte, inputul se uita la `composer.enabled`, iar acțiunile nu — deci un
    // server care închidea composerul lăsa chips-urile active, adică fix o poartă rămasă deschisă.
    const controller = makeController({
      views: ['recommendation'],
      composer: { ...VIEW_COPY.composer, enabled: false },
    })
    renderWidget(controller)
    const { input, send, actions } = turnControls()
    expect(input).toBeDisabled()
    expect(send).toBeDisabled()
    for (const action of actions) expect(action).toBeDisabled()
  })

  it('„Conversație nouă" rămâne disponibil când serverul închide DOAR composerul', () => {
    // Decizie explicită, documentată în shell: `composer.enabled` e o politică despre CÂMPUL DE
    // TEXT, iar butonul ăsta nu trimite un mesaj — pornește altă conversație. Legat de aceeași
    // formulă, un terminal cu `enabled: false` ar lăsa utilizatorul fără input ȘI fără reset,
    // adică într-o fundătură din care se iese doar închizând widgetul.
    renderWidget(
      makeController({
        views: ['recommendation'],
        composer: { ...VIEW_COPY.composer, enabled: false },
      }),
    )
    expect(screen.getByRole('button', { name: VIEW_COPY.chrome.new_chat_label })).toBeEnabled()
  })

  for (const phase of BUSY_PHASES) {
    it(`„Conversație nouă" e inactiv în \`${phase}\` (resetul nu concurează cu turul)`, () => {
      renderWidget(makeController({ views: ['recommendation'], phase }))
      expect(screen.getByRole('button', { name: VIEW_COPY.chrome.new_chat_label })).toBeDisabled()
    })
  }
})

describe('guardul de deasupra DOM-ului', () => {
  it('un click PROGRAMATIC pe un chip dezactivat nu ajunge la controller', () => {
    const controller = makeController({ views: ['recommendation'], phase: 'waiting' })
    renderWidget(controller)
    const { actions } = turnControls()
    for (const action of actions) {
      act(() => {
        action.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      })
    }
    expect(controller.sendAction).not.toHaveBeenCalled()
  })

  it('un submit PROGRAMATIC de formular în stare blocată e refuzat și raportat', () => {
    const onMetric = vi.fn()
    const controller = makeController({ views: ['greeting'], phase: 'waiting' })
    const { container } = renderWidget(controller, { onMetric })
    const form = container.ownerDocument.querySelector('[role="dialog"] form')
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(controller.sendText).not.toHaveBeenCalled()
    expect(onMetric).toHaveBeenCalledWith('web_turn_control_blocked_total', {
      control_type: 'composer',
      state: 'waiting',
    })
  })

  it('eticheta de stare distinge „ocupat" de „serverul a închis composerul"', () => {
    const onMetric = vi.fn()
    const controller = makeController({
      views: ['recommendation'],
      composer: { ...VIEW_COPY.composer, enabled: false },
    })
    const { container } = renderWidget(controller, { onMetric })
    const form = container.ownerDocument.querySelector('[role="dialog"] form')
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(onMetric).toHaveBeenCalledWith('web_turn_control_blocked_total', {
      control_type: 'composer',
      state: 'composer_disabled',
    })
  })

  it('nu se poate scrie în input cât timp turul e activ', async () => {
    const user = userEvent.setup()
    const controller = makeController({ views: ['greeting'], phase: 'waiting' })
    renderWidget(controller)
    const input = screen.getByRole('textbox')
    await user.type(input, 'text care nu are voie să intre')
    // Atacul Codex #1: orice modificare a valorii e finding.
    expect(input).toHaveValue('')
    expect(controller.sendText).not.toHaveBeenCalled()
  })

  it('paste-ul nu ocolește `disabled`', async () => {
    const user = userEvent.setup()
    const controller = makeController({ views: ['greeting'], phase: 'waiting' })
    renderWidget(controller)
    const input = screen.getByRole('textbox')
    input.focus()
    await user.paste('conținut lipit')
    expect(input).toHaveValue('')
  })
})

describe('deblocarea vine numai din terminal', () => {
  it('un terminal aplicat deblochează, iar view-ul e deja pe ecran', async () => {
    const busy = makeController({ views: ['greeting'], phase: 'waiting' })
    const { rerender } = renderWidget(busy)
    expect(screen.getByRole('textbox')).toBeDisabled()

    const done = makeController({ views: ['greeting', 'recommendation'] })
    rerender(<WebChatWidgetV2 controller={done} open onOpenChange={() => {}} />)

    // Ordinea cerută de card: ViewModelul terminal ÎNTÂI, deblocarea după. Dacă inputul ar
    // redeveni activ înaintea randării, ar exista o fereastră în care utilizatorul trimite un
    // mesaj despre un răspuns pe care încă nu îl vede.
    const text = validViews.recommendation.messages[0].blocks.find((b) => b.type === 'text')
    expect(screen.getByText(text.text)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('textbox')).toBeEnabled())
  })

  it('un defect de transport în timpul așteptării NU deblochează', () => {
    // Timeout HTTP / SSE căzut: controllerul rămâne în `recovering` cu un fault în curs. UI-ul nu
    // are voie să interpreteze „a picat conexiunea" ca „turul s-a terminat".
    renderWidget(
      makeController({
        views: ['greeting'],
        phase: 'recovering',
        fault: { code: 'timeout', serverCode: null, serverMessage: null, retryable: true },
      }),
    )
    expect(screen.getByRole('textbox')).toBeDisabled()
    // Și nu anunță un eșec fals: cât suntem ocupați, blocul de eroare tehnică nu se afișează.
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('bugetul epuizat lasă controalele blocate și oferă DOAR reîncercare tehnică', async () => {
    const user = userEvent.setup()
    const controller = makeController({
      views: ['greeting'],
      phase: 'unavailable',
      fault: { code: 'network', serverCode: 'recovery_budget', serverMessage: null, retryable: true },
      canRetry: true,
    })
    renderWidget(controller)
    expect(screen.getByRole('textbox')).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /Reîncearcă/i }))
    // Reîncercarea reia ACELAȘI tur; nu e un submit nou.
    expect(controller.retry).toHaveBeenCalledTimes(1)
    expect(controller.sendText).not.toHaveBeenCalled()
    expect(controller.sendAction).not.toHaveBeenCalled()
  })
})

describe('acțiunile trimit tokenul, neschimbat', () => {
  it('un chip activ retrimite exact tokenul din payload', async () => {
    const user = userEvent.setup()
    const controller = makeController({ views: ['greeting'] })
    renderWidget(controller)
    const action = validViews.greeting.messages[0].blocks.find((b) => b.type === 'action_row')
      .actions[0]
    await user.click(screen.getByRole('button', { name: action.label }))
    expect(controller.sendAction).toHaveBeenCalledWith(action.activation.token)
  })

  it('un dublu click pe același chip nu produce două tururi', async () => {
    const user = userEvent.setup()
    const controller = makeController({ views: ['greeting'] })
    controller.sendAction = vi.fn().mockReturnValueOnce(true).mockReturnValue(false)
    renderWidget(controller)
    const action = validViews.greeting.messages[0].blocks.find((b) => b.type === 'action_row')
      .actions[0]
    const button = screen.getByRole('button', { name: action.label })
    await user.dblClick(button)
    // UI-ul nu are cum să oprească al doilea click în același tick (starea vine prin props), dar
    // controllerul îl refuză — și exact asta trebuie să rămână adevărat: UN singur tur pornit.
    const started = controller.sendAction.mock.results.filter((r) => r.value === true)
    expect(started).toHaveLength(1)
  })
})

describe('microfon: absent pe calea v2, deliberat', () => {
  let warn
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => warn.mockRestore())

  it('nu există niciun control de dictare fără nume server-owned', () => {
    renderWidget(makeController({ views: ['greeting'] }))
    const panel = screen.getByRole('dialog')
    const named = within(panel)
      .getAllByRole('button')
      .map((node) => node.getAttribute('aria-label') ?? node.textContent)
    // `ChromeView` nu are un `mic_label`, iar cardul interzice inventarea de etichete în FE. Un
    // buton de microfon fără nume accesibil ar fi exact „un control mort" pe care cardul îl
    // enumeră ca defect. Rămâne în v1 până când backendul livrează copy-ul.
    expect(named.some((label) => /microfon|dictare|voce/i.test(label ?? ''))).toBe(false)
  })
})
