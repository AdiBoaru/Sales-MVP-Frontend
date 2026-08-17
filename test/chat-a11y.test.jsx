// NX-245 — accesibilitatea, verificată automat pe stările canonice.
//
// Axe nu „dovedește accesibilitatea": prinde clasa de defecte care se pot decide mecanic (nume
// lipsă, roluri imposibile, atribute ARIA invalide). Restul — că anunțul spune ceva adevărat, că
// ordinea are sens — rămâne la testarea manuală și la NX-247. De aceea fișierul are DOUĂ jumătăți:
// scanarea axe pe fiecare stare, și aserțiuni explicite pe lucrurile pe care axe nu le poate ști,
// de exemplu că numele accesibil vine de la SERVER și nu e compus în browser.

import { render, screen, within } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import WebChatWidgetV2 from '@/chat/v2/WebChatWidgetV2'
import ChatLiveRegion, { resolveAnnouncement } from '@/chat/components/ChatLiveRegion'
import { TECHNICAL_COPY } from '@/chat/v2/technicalCopy'
import { DESKTOP_WIDTH, MOBILE_WIDTH, setViewport } from './helpers/matchMedia.js'
import { VIEW_COPY, makeController, validViews } from './helpers/chatController.js'

expect.extend(toHaveNoViolations)

/** Numai `serious`/`critical` sunt gate, ca în card. `moderate` rămâne raportat, nu blocant. */
async function scan(container) {
  const results = await axe(container)
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
}

function renderWidget(controller, { open = true } = {}) {
  return render(<WebChatWidgetV2 controller={controller} open={open} onOpenChange={() => {}} />)
}

describe('axe — zero violări serious/critical pe stările canonice', () => {
  const STATES = [
    ['welcome', { views: ['greeting'] }],
    ['recommendation', { views: ['recommendation'] }],
    ['comparison', { views: ['comparison'] }],
    ['routine + fapte', { views: ['routine_and_facts'] }],
    ['order status', { views: ['order_status'] }],
    ['cart summary', { views: ['cart_summary'] }],
    ['no results', { views: ['no_result'] }],
    ['terminal failed', { views: ['terminal_failed'] }],
    ['busy (turn în curs)', { views: ['greeting'], phase: 'waiting' }],
    ['recovering', { views: ['greeting'], phase: 'recovering' }],
  ]

  for (const [label, overrides] of STATES) {
    it(`${label} — desktop`, async () => {
      setViewport(DESKTOP_WIDTH)
      renderWidget(makeController(overrides))
      expect(await scan(document.body)).toEqual([])
    })
  }

  it('welcome — mobil (modal, fundal inert)', async () => {
    setViewport(MOBILE_WIDTH)
    renderWidget(makeController({ views: ['greeting'] }))
    expect(await scan(document.body)).toEqual([])
  })

  it('launcher închis', async () => {
    renderWidget(makeController({ views: [] }), { open: false })
    expect(await scan(document.body)).toEqual([])
  })

  it('bootstrap picat — fără copy de la server, dar cu nume accesibile', async () => {
    // Starea în care `chrome`/`composer` lipsesc cu totul. Un dialog fără nume și un buton de
    // închidere fără nume sunt violări critice; fallbackul TEHNIC există exact pentru asta.
    const controller = makeController({
      phase: 'unavailable',
      chrome: null,
      composer: null,
      announcements: null,
      fault: { code: 'network', serverCode: null, serverMessage: null, retryable: true },
      canRetry: true,
    })
    renderWidget(controller)
    expect(await scan(document.body)).toEqual([])
    expect(screen.getByRole('dialog', { name: 'Asistent' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Închide' })).toBeInTheDocument()
  })
})

describe('numele accesibile vin de la server, nu din browser', () => {
  it('launcher, dialog, descriere, close și „conversație nouă"', () => {
    renderWidget(makeController({ views: ['greeting'] }), { open: false })
    expect(
      screen.getByRole('button', { name: VIEW_COPY.chrome.launcher_label }),
    ).toBeInTheDocument()

    renderWidget(makeController({ views: ['greeting'] }))
    const dialog = screen.getByRole('dialog', { name: VIEW_COPY.chrome.dialog_title })
    expect(dialog).toHaveAccessibleDescription(VIEW_COPY.chrome.dialog_description)
    expect(
      within(dialog).getByRole('button', { name: VIEW_COPY.chrome.close_label }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: VIEW_COPY.chrome.new_chat_label }),
    ).toBeInTheDocument()
  })

  it('composerul și butonul de trimitere', () => {
    renderWidget(makeController({ views: ['greeting'] }))
    expect(screen.getByRole('textbox', { name: VIEW_COPY.composer.label })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: VIEW_COPY.composer.send_label })).toBeInTheDocument()
  })

  it('fiecare acțiune poartă EXACT eticheta din payload', () => {
    renderWidget(makeController({ views: ['recommendation'] }))
    const labels = validViews.recommendation.messages
      .flatMap((message) => message.blocks)
      .flatMap((block) => block.actions ?? block.items?.flatMap((item) => item.actions ?? []) ?? [])
      .map((action) => action.label)
    expect(labels.length).toBeGreaterThan(0)
    for (const label of labels) {
      // Nici prefixat („Apasă pentru…"), nici compus cu numele produsului: exact ce a trimis
      // serverul. Un nume accesibil construit local ar fi copy inventat sub alt nume.
      // `queryAll`: aceeași etichetă apare legitim pe mai multe carduri („Vezi produsul" pe
      // fiecare produs din listă). Ce contează e că FIECARE etichetă din payload are cel puțin un
      // control cu exact acel nume accesibil.
      const controls = [
        ...screen.queryAllByRole('button', { name: label }),
        ...screen.queryAllByRole('link', { name: label }),
      ]
      expect(controls.length, `acțiunea „${label}" trebuie să poarte numele din payload`)
        .toBeGreaterThan(0)
    }
  })

  it('iconurile decorative sunt ascunse, imaginile folosesc `alt` din contract', () => {
    renderWidget(makeController({ views: ['recommendation'] }))
    const item = validViews.recommendation.messages
      .flatMap((message) => message.blocks)
      .find((block) => block.type === 'product_list')
      .items.find((entry) => entry.image !== undefined && entry.image !== null)
    expect(screen.getByAltText(item.image.alt)).toBeInTheDocument()
    for (const svg of document.querySelectorAll('svg')) {
      expect(svg.getAttribute('aria-hidden')).toBe('true')
    }
  })
})

describe('rolurile structurale', () => {
  it('dialog + log + listă + tabel + dl + ol', () => {
    renderWidget(makeController({ views: ['comparison'] }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    const log = screen.getByRole('log')
    expect(log).toHaveAttribute('aria-live', 'polite')
    expect(log).toHaveAttribute('aria-relevant', 'additions')
    expect(within(log).getByRole('table')).toBeInTheDocument()
    // Antetele de coloană ȘI de rând: fără `scope="row"`, celulele unui rând nu au context.
    expect(within(log).getAllByRole('columnheader').length).toBeGreaterThan(0)
    expect(within(log).getAllByRole('rowheader').length).toBeGreaterThan(0)
  })

  it('rutina e `<ol>`, faptele sunt `<dl>`, criteriile sunt listă', () => {
    const { container } = renderWidget(makeController({ views: ['routine_and_facts'] }))
    expect(container.ownerDocument.querySelector('[role="log"] ol')).not.toBeNull()
    expect(container.ownerDocument.querySelector('[role="log"] dl dt')).not.toBeNull()
    expect(container.ownerDocument.querySelector('[role="log"] dl dd')).not.toBeNull()
    // `memory` = criterii; erau `<span>`-uri lipite, deci un singur șir la screen reader.
    const lists = screen.getAllByRole('list')
    expect(lists.length).toBeGreaterThan(0)
  })

  it('produsele sunt elemente de listă, nu un paragraf continuu', () => {
    renderWidget(makeController({ views: ['recommendation'] }))
    const items = validViews.recommendation.messages
      .flatMap((message) => message.blocks)
      .find((block) => block.type === 'product_list').items
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(items.length)
    expect(screen.getAllByRole('article')).toHaveLength(items.length)
  })

  it('starea de comandă e o listă, coșul la fel', () => {
    renderWidget(makeController({ views: ['order_status'] }))
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0)
  })
})

describe('regiunea live — un singur proprietar, text server-owned', () => {
  it('alege statusul de progres cât turul e în curs, terminalul după', () => {
    const announcements = VIEW_COPY.a11y.announcements
    const working = resolveAnnouncement({
      progressStatus: 'working',
      view: validViews.status_working,
      announcements,
    })
    expect(working).toMatchObject({ text: announcements.working, kind: 'progress' })

    const done = resolveAnnouncement({
      progressStatus: null,
      view: validViews.recommendation,
      announcements,
    })
    expect(done).toMatchObject({ text: announcements.completed, kind: 'completed' })

    const failed = resolveAnnouncement({
      progressStatus: null,
      view: validViews.terminal_failed,
      announcements,
    })
    expect(failed).toMatchObject({ text: announcements.failed, kind: 'failed' })
  })

  it('fără copy de la server nu inventează nimic — tace', () => {
    expect(
      resolveAnnouncement({ progressStatus: 'working', view: null, announcements: null }),
    ).toBeNull()
    render(<ChatLiveRegion progressStatus="working" view={null} announcements={null} />)
    // Nici măcar o regiune GOALĂ: ar fi un al doilea proprietar de anunțuri, exact ce evită
    // designul. Fără copy, rolul trece la rândul de progres (testul de mai jos).
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('rămâne montată, dar goală, cât timp nu s-a întâmplat nimic', () => {
    // O regiune live creată în aceeași clipă cu textul ei e ratată de o parte din cititoarele de
    // ecran. Copy-ul vine din bootstrap, deci regiunea există dinaintea primului tur.
    render(
      <ChatLiveRegion
        progressStatus={null}
        view={null}
        announcements={VIEW_COPY.a11y.announcements}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('')
  })

  it('nu anunță statusul găsit la montare (un terminal vechi nu e o știre)', () => {
    const onMetric = vi.fn()
    render(
      <ChatLiveRegion
        progressStatus={null}
        view={validViews.recommendation}
        announcements={VIEW_COPY.a11y.announcements}
        onMetric={onMetric}
      />,
    )
    expect(onMetric).not.toHaveBeenCalled()
  })

  it('anunță o SINGURĂ dată per (tur, status), oricâte re-randări ar fi', () => {
    const onMetric = vi.fn()
    const announcements = VIEW_COPY.a11y.announcements
    const { rerender } = render(
      <ChatLiveRegion
        progressStatus={null}
        view={null}
        announcements={announcements}
        onMetric={onMetric}
      />,
    )
    const progress = (
      <ChatLiveRegion
        progressStatus="working"
        view={validViews.status_working}
        announcements={announcements}
        onMetric={onMetric}
      />
    )
    rerender(progress)
    rerender(progress)
    rerender(progress)
    expect(onMetric).toHaveBeenCalledTimes(1)
    expect(onMetric).toHaveBeenCalledWith('web_widget_a11y_announcement_total', {
      kind: 'progress',
    })
    expect(screen.getByRole('status')).toHaveTextContent(announcements.working)
  })

  it('două tururi cu ACELAȘI text terminal produc două anunțuri', () => {
    // Capcana clasică a regiunilor live: dacă textul e identic, DOM-ul nu se schimbă și screen
    // readerul tace. Al doilea răspuns ar fi livrat în liniște completă.
    const onMetric = vi.fn()
    const announcements = VIEW_COPY.a11y.announcements
    const first = { ...validViews.recommendation }
    const second = {
      ...validViews.recommendation,
      turn: { ...validViews.recommendation.turn, id: 'opq_turn_next' },
    }
    const { rerender, container } = render(
      <ChatLiveRegion
        progressStatus={null}
        view={null}
        announcements={announcements}
        onMetric={onMetric}
      />,
    )
    rerender(
      <ChatLiveRegion progressStatus={null} view={first} announcements={announcements} onMetric={onMetric} />,
    )
    const firstNode = container.querySelector('[role="status"] span')
    rerender(
      <ChatLiveRegion progressStatus={null} view={second} announcements={announcements} onMetric={onMetric} />,
    )
    const secondNode = container.querySelector('[role="status"] span')
    expect(onMetric).toHaveBeenCalledTimes(2)
    // Nod NOU, deși textul e același — asta e mutația pe care o observă tehnologia asistivă.
    expect(secondNode).not.toBe(firstNode)
    expect(secondNode).toHaveTextContent(announcements.completed)
  })

  it('redă copy-ul serverului VERBATIM, nu unul compus local', () => {
    // Atacul Codex #8: un sentinel care nu seamănă cu nimic din vocabularul produsului. Dacă FE-ul
    // ar prefixa, traduce, capitaliza sau înlocui textul cu al lui, aserțiunea cade.
    const SENTINEL = 'ZZ-sentinel-anunț-42'
    const announcements = { ...VIEW_COPY.a11y.announcements, working: SENTINEL }
    const { rerender } = render(
      <ChatLiveRegion progressStatus={null} view={null} announcements={announcements} />,
    )
    rerender(
      <ChatLiveRegion
        progressStatus="working"
        view={validViews.status_working}
        announcements={announcements}
      />,
    )
    expect(screen.getByRole('status').textContent).toBe(SENTINEL)
  })

  it('și copy-ul de ramă e redat verbatim (launcher, titlu, close, composer)', () => {
    const chrome = {
      launcher_label: 'ZZ-launcher',
      dialog_title: 'ZZ-titlu',
      dialog_description: 'ZZ-descriere',
      close_label: 'ZZ-close',
      new_chat_label: 'ZZ-newchat',
    }
    const composer = {
      enabled: true,
      label: 'ZZ-label',
      placeholder: 'ZZ-placeholder',
      send_label: 'ZZ-send',
    }
    renderWidget(makeController({ views: ['greeting'], chrome, composer }))
    expect(screen.getByRole('dialog', { name: chrome.dialog_title })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: chrome.close_label })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: chrome.new_chat_label })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: composer.label })).toHaveAttribute(
      'placeholder',
      composer.placeholder,
    )
    expect(screen.getByRole('button', { name: composer.send_label })).toBeInTheDocument()
  })

  it('rândul de progres vizibil NU e a doua regiune live', () => {
    // Cu două regiuni care poartă același text, un singur eveniment produce două anunțuri.
    renderWidget(makeController({ views: ['status_working'], phase: 'waiting' }))
    const statuses = screen.getAllByRole('status')
    expect(statuses).toHaveLength(1)
    expect(statuses[0]).toHaveClass('nx-visually-hidden')
    // Textul serverului rămâne VIZIBIL pentru ochi, doar că e marcat ca duplicat.
    const progress = screen.getByText(validViews.status_working.progress.label)
    expect(progress.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('progresul nu e simulat: fără text de la server nu se afișează nimic', () => {
    renderWidget(
      makeController({ views: ['status_accepted'], phase: 'waiting', announcements: null }),
    )
    expect(screen.queryByText(/Analizez|Caut|Compar|Am găsit/i)).toBeNull()
  })

  it('dacă serverul trimite progres fără copy `a11y`, rândul vizibil preia anunțul', () => {
    // Imposibil prin schemă (anunțurile sunt obligatorii), deci e o plasă. Alternativa ar fi
    // tăcere totală pentru cine nu vede ecranul — exact ce interzice „niciodată tăcere".
    renderWidget(
      makeController({ views: ['status_working'], phase: 'waiting', announcements: null }),
    )
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(validViews.status_working.progress.label)
    expect(status).not.toHaveAttribute('aria-hidden')
  })
})

describe('frontendul nu crește copy de a11y pe cont propriu', () => {
  // Regula e ușor de respectat azi și ușor de încălcat luna viitoare, cu cea mai bună intenție:
  // cineva vede un spinner fără text, adaugă „Se încarcă…", iar tenantul maghiar primește un
  // anunț în română. Scanarea de mai jos refuză clasa întreagă, nu doar cazul de azi.
  const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const CHAT = join(ROOT, 'src', 'chat')

  function walk(dir) {
    const out = []
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        if (full.endsWith(join('contract', 'generated'))) continue
        out.push(...walk(full))
      } else if (/\.(js|jsx)$/.test(entry)) {
        out.push(full)
      }
    }
    return out
  }

  /** Literalii din cod, fără comentarii — comentariile de aici discută tocmai textele interzise. */
  function literals(source) {
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    return [...code.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)].map(
      (match) => match[1] ?? match[2],
    )
  }

  const FILES = walk(CHAT).map((path) => ({
    rel: relative(ROOT, path).replace(/\\/g, '/'),
    source: readFileSync(path, 'utf8'),
  }))
  /** Singurul loc din FE care are voie să conțină text pentru om — și numai tehnic. */
  const ALLOWED = new Set(Object.values(TECHNICAL_COPY))

  it('acoperă fișierele de chat', () => {
    expect(FILES.length).toBeGreaterThan(15)
  })

  it('niciun anunț, progres sau stare conversațională scrisă în frontend', () => {
    // Diacriticele sunt semnalul: un literal cu ă/î/ș/ț/â în `src/chat/**` e, aproape sigur, text
    // destinat unui om. Ce nu e în `TECHNICAL_COPY` n-are ce căuta acolo.
    const hits = []
    for (const file of FILES) {
      if (file.rel === 'src/chat/v2/technicalCopy.js') continue
      for (const literal of literals(file.source)) {
        if (!/[ăâîșțĂÂÎȘȚ]/.test(literal)) continue
        if (ALLOWED.has(literal)) continue
        hits.push(`${file.rel} → ${JSON.stringify(literal)}`)
      }
    }
    expect(hits).toEqual([])
  })

  it('nu conține etape de progres inventate', () => {
    const INVENTED = [/Analizez/i, /Se încarcă/i, /Caut\b/i, /Am găsit/i, /Mai încearcă/i, /Gata!/i]
    const hits = []
    for (const file of FILES) {
      for (const literal of literals(file.source)) {
        for (const pattern of INVENTED) {
          if (pattern.test(literal)) hits.push(`${file.rel} → ${JSON.stringify(literal)}`)
        }
      }
    }
    expect(hits).toEqual([])
  })
})
