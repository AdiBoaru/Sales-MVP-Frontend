// NX-245 — widgetul, folosit exclusiv de la tastatură.
//
// Fiecare test de aici corespunde unui moment în care un utilizator care nu folosește mouse-ul se
// poate pierde: intră în dialog și nu mai iese, apasă Escape și focusul dispare pe `<body>`,
// tastează într-un câmp pe cale să se dezactiveze, sau apasă Enter în mijlocul unei compoziții IME
// și trimite jumătate de cuvânt.
//
// Nota despre IME: nu e un caz exotic. Orice tastatură cu accente compuse (maghiară, cehă,
// vietnameză) folosește compoziție, iar pilotul are `hu` în `supported_locales`. Enterul care
// confirmă un candidat IME nu e submit — e o tastă de editare.

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import WebChatWidgetV2 from '@/chat/v2/WebChatWidgetV2'
import { DESKTOP_WIDTH, MOBILE_WIDTH, setViewport } from './helpers/matchMedia.js'
import { VIEW_COPY, makeController, validViews } from './helpers/chatController.js'

const TRIGGER = 'Deschide din antet'

/** Pagină cu declanșator EXTERN + conținut de fundal: exact ce trebuie să rămână (in)accesibil. */
function Harness({ controller, initialOpen = false }) {
  const [open, setOpen] = useState(initialOpen)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        {TRIGGER}
      </button>
      <main>
        <a href="/produs">Un link din vitrină</a>
      </main>
      <WebChatWidgetV2 controller={controller} open={open} onOpenChange={setOpen} />
    </>
  )
}

function dialog() {
  return screen.getByRole('dialog')
}

describe('focus la deschidere și la închidere', () => {
  it('deschide pe composer când poate fi folosit', async () => {
    const user = userEvent.setup()
    render(<Harness controller={makeController({ views: ['greeting'] })} />)
    await user.click(screen.getByRole('button', { name: TRIGGER }))
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: VIEW_COPY.composer.label })).toHaveFocus(),
    )
  })

  it('deschide pe TITLU când composerul e dezactivat (nu pe un input mort)', async () => {
    const user = userEvent.setup()
    render(<Harness controller={makeController({ views: ['greeting'], phase: 'waiting' })} />)
    await user.click(screen.getByRole('button', { name: TRIGGER }))
    // Un `focus()` pe un input `disabled` e refuzat de browser și focusul rămâne pe `<body>`:
    // dialogul s-ar deschide fără niciun punct de plecare pentru tastatură.
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: VIEW_COPY.chrome.dialog_title })).toHaveFocus(),
    )
  })

  it('Escape închide și întoarce focusul pe declanșatorul REAL', async () => {
    const user = userEvent.setup()
    render(<Harness controller={makeController({ views: ['greeting'] })} />)
    const trigger = screen.getByRole('button', { name: TRIGGER })
    await user.click(trigger)
    await screen.findByRole('dialog')

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // Declanșatorul a fost butonul din antet, nu launcherul — acolo se întoarce focusul.
    expect(trigger).toHaveFocus()
  })

  it('când declanșatorul a dispărut, focusul cade pe launcher', async () => {
    const user = userEvent.setup()
    // Deschis din start (`?chat=1`): nu există declanșator capturat, deci fallbackul e singura cale.
    render(<Harness controller={makeController({ views: ['greeting'] })} initialOpen />)
    await user.click(screen.getByRole('button', { name: VIEW_COPY.chrome.close_label }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: VIEW_COPY.chrome.launcher_label })).toHaveFocus(),
    )
  })

  it('nu fură focusul dacă utilizatorul l-a mutat în pagină (desktop, non-modal)', async () => {
    setViewport(DESKTOP_WIDTH)
    const user = userEvent.setup()
    render(<Harness controller={makeController({ views: ['greeting'] })} initialOpen />)
    const outside = screen.getByRole('link', { name: 'Un link din vitrină' })
    outside.focus()
    expect(outside).toHaveFocus()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // Focusul era în afara widgetului: omul se uita în altă parte. Mutarea lui ar fi un salt
    // neexplicat — exact ce face un dialog care se crede mai important decât pagina.
    expect(outside).toHaveFocus()
  })

  it('emite outcome-ul restaurării, cu vocabular închis', async () => {
    const onMetric = vi.fn()
    const user = userEvent.setup()
    function Wrapped() {
      const [open, setOpen] = useState(true)
      return (
        <WebChatWidgetV2
          controller={makeController({ views: ['greeting'] })}
          open={open}
          onOpenChange={setOpen}
          onMetric={onMetric}
        />
      )
    }
    render(<Wrapped />)
    await user.click(screen.getByRole('button', { name: VIEW_COPY.chrome.close_label }))
    await waitFor(() =>
      expect(onMetric).toHaveBeenCalledWith('web_widget_focus_restore_total', {
        outcome: 'fallback',
      }),
    )
  })
})

describe('închidere și redeschidere în plin tur', () => {
  it('închiderea e permisă în busy și NU anulează turul', async () => {
    setViewport(MOBILE_WIDTH)
    const user = userEvent.setup()
    const controller = makeController({ views: ['greeting'], phase: 'waiting' })
    render(<Harness controller={controller} initialOpen />)

    const close = screen.getByRole('button', { name: VIEW_COPY.chrome.close_label })
    expect(close).toBeEnabled()
    await user.click(close)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // Turul e al serverului și rămâne al lui: widgetul nu cheamă nimic la închidere.
    expect(controller.retry).not.toHaveBeenCalled()
    expect(controller.reset).not.toHaveBeenCalled()
    expect(controller.sendText).not.toHaveBeenCalled()
    // Iar izolarea modală se ridică — altfel vitrina ar rămâne inertă cu widgetul închis.
    expect(document.body.style.overflow).toBe('')
    expect(screen.getByRole('button', { name: VIEW_COPY.chrome.launcher_label })).toHaveFocus()
  })

  it('redeschiderea în busy arată starea curentă, fără să pornească alt tur', async () => {
    const user = userEvent.setup()
    const controller = makeController({ views: ['status_working'], phase: 'waiting' })
    render(<Harness controller={controller} initialOpen />)
    await user.click(screen.getByRole('button', { name: VIEW_COPY.chrome.close_label }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await user.click(screen.getByRole('button', { name: VIEW_COPY.chrome.launcher_label }))
    await screen.findByRole('dialog')

    // Progresul REAL al serverului e din nou pe ecran, iar controalele rămân blocate.
    expect(screen.getByText(validViews.status_working.progress.label)).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(controller.sendText).not.toHaveBeenCalled()
    expect(controller.sendAction).not.toHaveBeenCalled()
  })

  it('redeschiderea cu composerul blocat pune focusul pe titlu, nu pe `<body>`', async () => {
    const user = userEvent.setup()
    render(
      <Harness controller={makeController({ views: ['greeting'], phase: 'waiting' })} initialOpen />,
    )
    await user.click(screen.getByRole('button', { name: VIEW_COPY.chrome.close_label }))
    await user.click(screen.getByRole('button', { name: VIEW_COPY.chrome.launcher_label }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: VIEW_COPY.chrome.dialog_title })).toHaveFocus(),
    )
  })

  it('fără composer utilizabil ȘI fără titlu, focusul ajunge pe panel', async () => {
    setViewport(MOBILE_WIDTH)
    const user = userEvent.setup()
    render(
      <Harness
        controller={makeController({ phase: 'unavailable', chrome: null, composer: null })}
      />,
    )
    await user.click(screen.getByRole('button', { name: /Asistent/i }))
    // Fără plasa asta, focusul ar rămâne pe `<body>` — în afara unui dialog care tocmai a
    // declarat restul paginii inert, adică nicăieri.
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus())
  })
})

describe('focus trap — numai în modul modal', () => {
  it('mobil: Tab din ultimul control se întoarce la primul', async () => {
    setViewport(MOBILE_WIDTH)
    const user = userEvent.setup()
    render(<Harness controller={makeController({ views: ['greeting'] })} initialOpen />)
    const panel = dialog()

    const inside = () => panel.contains(document.activeElement)
    // Douăzeci de Taburi: dacă trapul n-ar exista, focusul ar ieși în vitrină cu mult înainte.
    for (let i = 0; i < 20; i += 1) {
      await user.tab()
      expect(inside(), `Tab #${i + 1} a scăpat din dialog`).toBe(true)
    }
    for (let i = 0; i < 20; i += 1) {
      await user.tab({ shift: true })
      expect(inside(), `Shift+Tab #${i + 1} a scăpat din dialog`).toBe(true)
    }
  })

  it('desktop: NU e prins — userul poate ajunge în pagină', async () => {
    setViewport(DESKTOP_WIDTH)
    const user = userEvent.setup()
    render(<Harness controller={makeController({ views: ['greeting'] })} initialOpen />)
    const panel = dialog()

    let escaped = false
    for (let i = 0; i < 25 && !escaped; i += 1) {
      await user.tab()
      if (!panel.contains(document.activeElement) && document.activeElement !== document.body) {
        escaped = true
      }
    }
    // `aria-modal="false"` promite că pagina rămâne disponibilă. Un trap aici ar fi o minciună.
    expect(escaped, 'dialogul non-modal nu are voie să prindă focusul').toBe(true)
  })

  it('focusul nu intră în controale dezactivate', async () => {
    setViewport(MOBILE_WIDTH)
    const user = userEvent.setup()
    render(
      <Harness
        controller={makeController({ views: ['recommendation'], phase: 'waiting' })}
        initialOpen
      />,
    )
    const panel = dialog()
    const visited = new Set()
    for (let i = 0; i < 25; i += 1) {
      await user.tab()
      const active = document.activeElement
      if (active !== null && panel.contains(active)) visited.add(active)
    }
    for (const node of visited) {
      expect(node.hasAttribute('disabled'), `${node.tagName} dezactivat a primit focus`).toBe(false)
    }
    // Închiderea rămâne accesibilă chiar în plin tur: e singura ieșire.
    expect([...visited]).toContain(
      within(panel).getByRole('button', { name: VIEW_COPY.chrome.close_label }),
    )
  })
})

describe('Enter, Shift+Enter și IME', () => {
  it('Enter trimite exact o dată', async () => {
    const user = userEvent.setup()
    const controller = makeController({ views: ['greeting'] })
    render(<WebChatWidgetV2 controller={controller} open onOpenChange={() => {}} />)
    const input = screen.getByRole('textbox', { name: VIEW_COPY.composer.label })
    await user.type(input, 'cremă pentru ten uscat{Enter}')
    expect(controller.sendText).toHaveBeenCalledTimes(1)
    expect(controller.sendText).toHaveBeenCalledWith('cremă pentru ten uscat', {
      source: 'composer',
    })
    expect(input).toHaveValue('')
  })

  it('două Enter rapide nu produc două tururi', async () => {
    const user = userEvent.setup()
    // După primul submit, apelantul real trece în `submitting`; aici simulăm partea care contează:
    // controllerul refuză al doilea, iar UI-ul nu golește inputul pe un submit care n-a pornit.
    const controller = makeController({ views: ['greeting'] })
    controller.sendText = vi.fn().mockReturnValueOnce(true).mockReturnValue(false)
    render(<WebChatWidgetV2 controller={controller} open onOpenChange={() => {}} />)
    const input = screen.getByRole('textbox', { name: VIEW_COPY.composer.label })
    await user.type(input, 'ceva{Enter}')
    await user.type(input, 'altceva{Enter}')
    expect(controller.sendText).toHaveBeenCalledTimes(2)
    // Al doilea a fost refuzat ⇒ textul NU se pierde. Ștergerea lui ar arunca ce a scris omul.
    expect(input).toHaveValue('altceva')
  })

  it('Enter în timpul compoziției IME nu trimite, iar textul compus rămâne', async () => {
    const user = userEvent.setup()
    const controller = makeController({ views: ['greeting'] })
    render(<WebChatWidgetV2 controller={controller} open onOpenChange={() => {}} />)
    const input = screen.getByRole('textbox', { name: VIEW_COPY.composer.label })

    await user.type(input, 'szőnyeg')
    act(() => {
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    })
    await user.keyboard('{Enter}')
    expect(controller.sendText).not.toHaveBeenCalled()
    expect(input).toHaveValue('szőnyeg')

    act(() => {
      input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    })
    await user.keyboard('{Enter}')
    expect(controller.sendText).toHaveBeenCalledTimes(1)
  })

  it('Shift+Enter nu trimite (composerul e pe un singur rând)', async () => {
    const user = userEvent.setup()
    const controller = makeController({ views: ['greeting'] })
    render(<WebChatWidgetV2 controller={controller} open onOpenChange={() => {}} />)
    const input = screen.getByRole('textbox', { name: VIEW_COPY.composer.label })
    await user.type(input, 'ceva{Shift>}{Enter}{/Shift}')
    expect(controller.sendText).not.toHaveBeenCalled()
    expect(input).toHaveValue('ceva')
  })
})

describe('focusul când controlul de sub el se dezactivează', () => {
  it('trece în transcript, apoi e oferit înapoi composerului', async () => {
    const controller = makeController({ views: ['greeting'] })
    const { rerender } = render(
      <WebChatWidgetV2 controller={controller} open onOpenChange={() => {}} />,
    )
    const input = screen.getByRole('textbox', { name: VIEW_COPY.composer.label })
    input.focus()
    expect(input).toHaveFocus()

    // Turul pornește ⇒ composerul se dezactivează, browserul aruncă focusul pe `<body>`.
    rerender(
      <WebChatWidgetV2
        controller={makeController({ views: ['greeting'], phase: 'waiting' })}
        open
        onOpenChange={() => {}}
      />,
    )
    const log = screen.getByRole('log')
    await waitFor(() => expect(log).toHaveFocus())

    // Turul se termină ⇒ focusul se întoarce singur în composer, fiindcă utilizatorul nu l-a mutat.
    rerender(<WebChatWidgetV2 controller={controller} open onOpenChange={() => {}} />)
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: VIEW_COPY.composer.label })).toHaveFocus(),
    )
  })

  it('nu atinge focusul dacă utilizatorul îl mutase deja pe close', async () => {
    const controller = makeController({ views: ['greeting'] })
    const { rerender } = render(
      <WebChatWidgetV2 controller={controller} open onOpenChange={() => {}} />,
    )
    const close = screen.getByRole('button', { name: VIEW_COPY.chrome.close_label })
    close.focus()

    rerender(
      <WebChatWidgetV2
        controller={makeController({ views: ['greeting'], phase: 'waiting' })}
        open
        onOpenChange={() => {}}
      />,
    )
    expect(close).toHaveFocus()
  })
})
