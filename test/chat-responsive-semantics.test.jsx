// NX-245 — modalitatea, curățarea și semantica structurii.
//
// Partea cea mai ușor de stricat din tot cardul nu e deschiderea dialogului, ci ÎNCHIDEREA lui:
// `inert` rămas pe vitrină, `overflow: hidden` uitat pe `<body>`, un host de portal orfan pentru
// fiecare montare, un listener de `keydown` care se acumulează. Nimic din toate astea nu se vede
// în captura de ecran a stării deschise — se vede abia peste douăzeci de cicluri, ca o pagină
// care nu mai derulează și pe care nu se mai poate da clic nicăieri.
//
// De aceea fiecare test de aici verifică starea DUPĂ, nu doar în timpul.

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import WebChatWidgetV2 from '@/chat/v2/WebChatWidgetV2'
import { DESKTOP_WIDTH, MOBILE_WIDTH, setViewport } from './helpers/matchMedia.js'
import { VIEW_COPY, makeController, validViews } from './helpers/chatController.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function Harness({ controller, initialOpen = true, onMetric }) {
  const [open, setOpen] = useState(initialOpen)
  return (
    <>
      <main>
        <a href="/produs">Un link din vitrină</a>
      </main>
      <WebChatWidgetV2
        controller={controller}
        open={open}
        onOpenChange={setOpen}
        onMetric={onMetric}
      />
    </>
  )
}

/** Frații hostului de portal — adică tot ce trebuie să devină inert în modul modal. */
function background() {
  const panel = document.querySelector('[role="dialog"]')
  return Array.from(document.body.children).filter((node) => !node.contains(panel))
}

describe('modalitatea urmează viewportul', () => {
  it('mobil: modal, fundal inert, scroll blocat', () => {
    setViewport(MOBILE_WIDTH)
    render(<Harness controller={makeController({ views: ['greeting'] })} />)
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    for (const node of background()) {
      expect(node).toHaveAttribute('inert')
      expect(node).toHaveAttribute('aria-hidden', 'true')
    }
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('desktop: non-modal, fără inert, fără scroll lock', () => {
    setViewport(DESKTOP_WIDTH)
    render(<Harness controller={makeController({ views: ['greeting'] })} />)
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'false')
    for (const node of background()) {
      expect(node).not.toHaveAttribute('inert')
      expect(node).not.toHaveAttribute('aria-hidden')
    }
    // `aria-modal="false"` promite că pagina rămâne utilizabilă — inclusiv derulabilă.
    expect(document.body.style.overflow).toBe('')
  })

  it('raportează modul în care s-a deschis', async () => {
    setViewport(MOBILE_WIDTH)
    const onMetric = vi.fn()
    render(<Harness controller={makeController({ views: ['greeting'] })} onMetric={onMetric} />)
    await waitFor(() =>
      expect(onMetric).toHaveBeenCalledWith('web_widget_dialog_open_total', {
        mode: 'mobile_modal',
      }),
    )
  })

  it('resize mobil → desktop cu panelul deschis: izolarea dispare complet', async () => {
    setViewport(MOBILE_WIDTH)
    render(<Harness controller={makeController({ views: ['greeting'] })} />)
    expect(document.body.style.overflow).toBe('hidden')

    act(() => setViewport(DESKTOP_WIDTH))
    await waitFor(() =>
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'false'),
    )
    // Atacul Codex #6: `inert`/scroll-lock rămase după schimbarea modului ar face vitrina
    // inaccesibilă la nesfârșit, fără niciun dialog modal care să justifice asta.
    for (const node of background()) expect(node).not.toHaveAttribute('inert')
    expect(document.body.style.overflow).toBe('')
  })

  it('resize desktop → mobil aplică izolarea', async () => {
    setViewport(DESKTOP_WIDTH)
    render(<Harness controller={makeController({ views: ['greeting'] })} />)
    act(() => setViewport(MOBILE_WIDTH))
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true'))
    expect(document.body.style.overflow).toBe('hidden')
  })
})

describe('curățarea — starea de DUPĂ', () => {
  it('închiderea restaurează fundalul și scrollul', async () => {
    setViewport(MOBILE_WIDTH)
    const user = userEvent.setup()
    render(<Harness controller={makeController({ views: ['greeting'] })} />)
    await user.click(screen.getByRole('button', { name: VIEW_COPY.chrome.close_label }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    for (const node of Array.from(document.body.children)) {
      expect(node).not.toHaveAttribute('inert')
      expect(node).not.toHaveAttribute('aria-hidden')
    }
    expect(document.body.style.overflow).toBe('')
  })

  it('păstrează un `overflow` pe care îl avea deja pagina', async () => {
    // Restaurarea reface valoarea de dinainte, nu presupune că era goală. O pagină cu scroll lock
    // propriu (un alt modal, un carusel) n-are voie să rămână deblocată de noi.
    setViewport(MOBILE_WIDTH)
    document.body.style.overflow = 'clip'
    const user = userEvent.setup()
    render(<Harness controller={makeController({ views: ['greeting'] })} />)
    expect(document.body.style.overflow).toBe('hidden')
    await user.click(screen.getByRole('button', { name: VIEW_COPY.chrome.close_label }))
    await waitFor(() => expect(document.body.style.overflow).toBe('clip'))
    document.body.style.overflow = ''
  })

  it('20 de cicluri montare/demontare nu lasă hosturi de portal orfane', () => {
    setViewport(MOBILE_WIDTH)
    const hosts = () => document.querySelectorAll('[data-nx-chat-portal]').length
    expect(hosts()).toBe(0)
    for (let i = 0; i < 20; i += 1) {
      const { unmount } = render(<Harness controller={makeController({ views: ['greeting'] })} />)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(hosts()).toBe(1)
      unmount()
      // Atacul Codex #9: un host lăsat în urmă la fiecare montare crește `<body>` la nesfârșit,
      // iar `aria-hidden` de pe frații lui începe să se aplice unor noduri moarte.
      expect(hosts(), `după ciclul ${i + 1}`).toBe(0)
    }
  })

  it('20 de cicluri deschis/închis nu acumulează listeneri pe document', async () => {
    setViewport(MOBILE_WIDTH)
    const added = vi.spyOn(document, 'addEventListener')
    const removed = vi.spyOn(document, 'removeEventListener')
    const user = userEvent.setup()
    render(<Harness controller={makeController({ views: ['greeting'] })} initialOpen={false} />)

    for (let i = 0; i < 20; i += 1) {
      await user.click(screen.getByRole('button', { name: VIEW_COPY.chrome.launcher_label }))
      await screen.findByRole('dialog')
      await user.click(screen.getByRole('button', { name: VIEW_COPY.chrome.close_label }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    }

    const count = (spy, type) => spy.mock.calls.filter(([name]) => name === type).length
    for (const type of ['keydown', 'focusin']) {
      expect(count(added, type), `${type}: adăugate vs eliminate`).toBe(count(removed, type))
    }
    added.mockRestore()
    removed.mockRestore()
  })
})

describe('semantica structurii bogate', () => {
  const CASES = [
    ['product_list', 'recommendation', 'ul'],
    ['comparison', 'comparison', 'table'],
    ['routine', 'routine_and_facts', 'ol'],
    ['key_value', 'routine_and_facts', 'dl'],
    ['status_list', 'order_status', 'ul'],
    ['cart_summary', 'cart_summary', 'ul'],
  ]

  for (const [label, fixture, tag] of CASES) {
    it(`\`${label}\` folosește <${tag}>`, () => {
      const { container } = render(
        <WebChatWidgetV2
          controller={makeController({ views: [fixture] })}
          open
          onOpenChange={() => {}}
        />,
      )
      expect(container.ownerDocument.querySelector(`[role="log"] ${tag}`)).not.toBeNull()
    })
  }

  it('comparația își derulează propriul container, accesibil de la tastatură', () => {
    const { container } = render(
      <WebChatWidgetV2
        controller={makeController({ views: ['comparison'] })}
        open
        onOpenChange={() => {}}
      />,
    )
    const scroller = container.ownerDocument.querySelector('[role="log"] .overflow-x-auto')
    expect(scroller).not.toBeNull()
    // O regiune care se derulează doar cu degetul e inaccesibilă de la tastatură (WCAG 2.1.1).
    expect(scroller).toHaveAttribute('tabindex', '0')
    expect(scroller.querySelector('table')).not.toBeNull()
  })

  it('celulele necunoscute rămân goale, nu devin „0" sau „—" inventat local', () => {
    render(
      <WebChatWidgetV2
        controller={makeController({ views: ['comparison'] })}
        open
        onOpenChange={() => {}}
      />,
    )
    const empties = Array.from(document.querySelectorAll('td')).filter(
      (cell) => cell.textContent === '',
    )
    for (const cell of empties) expect(cell).toHaveAttribute('aria-label', '—')
  })
})

describe('cheile sunt stabile — focusul nu sare la re-randare', () => {
  it('un rerender cu ACELAȘI view păstrează nodul focusat', () => {
    const view = validViews.recommendation
    const { rerender } = render(
      <WebChatWidgetV2
        controller={makeController({ views: [view] })}
        open
        onOpenChange={() => {}}
      />,
    )
    const action = view.messages
      .flatMap((message) => message.blocks)
      .find((block) => block.type === 'action_row').actions[0]
    const button = screen.getByRole('button', { name: action.label })
    button.focus()

    // Obiect NOU cu aceleași ID-uri: exact ce produce un poll care re-livrează același view.
    rerender(
      <WebChatWidgetV2
        controller={makeController({ views: [JSON.parse(JSON.stringify(view))] })}
        open
        onOpenChange={() => {}}
      />,
    )
    // Cu chei pe index, o reordonare ar muta focusul pe alt buton; cu ID-uri din payload, nodul
    // rămâne același și focusul odată cu el.
    expect(screen.getByRole('button', { name: action.label })).toBe(button)
    expect(button).toHaveFocus()
  })
})

describe('tokenii de prezentare există în CSS (verificabil fără browser)', () => {
  // jsdom nu aplică CSS (`css: false` în config), deci regulile se verifică pe SURSĂ. E o
  // verificare slabă în mod deliberat: dovada finală e matricea de browser din NX-247. Ce prinde
  // aici e ștergerea accidentală a unei reguli întregi, care altfel n-ar rupe niciun test.
  const css = readFileSync(resolve(ROOT, 'src/index.css'), 'utf8')

  it('`prefers-reduced-motion` oprește animațiile widgetului', () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
    expect(css).toMatch(/\.aria-widget \.aria-think-spinner[\s\S]*?animation:\s*none/)
  })

  it('focusul e vizibil pe orice fundal, inclusiv pe launcherul cu gradient', () => {
    expect(css).toMatch(/\.aria-widget :focus-visible/)
    expect(css).toMatch(/\.nx-chat-launcher:focus-visible/)
    // Navy, nu violetul de accent: violet pe gradient violet→roz coboară sub 3:1.
    expect(css).toMatch(/outline:\s*3px solid #16213e/)
  })

  it('regiunea live e ascunsă vizual, dar NU scoasă din arborele de accesibilitate', () => {
    const block = /\.nx-visually-hidden\s*\{([\s\S]*?)\}/.exec(css)
    expect(block).not.toBeNull()
    expect(block[1]).not.toMatch(/display:\s*none/)
    expect(block[1]).not.toMatch(/visibility:\s*hidden/)
    expect(block[1]).toMatch(/clip-path:\s*inset\(50%\)/)
  })

  it('panelul respectă zonele sigure ale ecranului', () => {
    expect(css).toMatch(/\.nx-chat-panel[\s\S]*?env\(safe-area-inset-top\)/)
  })
})
