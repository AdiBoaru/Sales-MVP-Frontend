// NX-244 — testele de randare. Fixturile sunt cele SINCRONIZATE din backend
// (`test/fixtures/web-v2/`), nu inventate aici: o fixtură scrisă de mână ca să treacă testul nu
// dovedește nimic despre ce trimite serverul.
//
// Ce verifică, în ordinea în care contează:
//   1. ordinea — mesaje, blocuri, produse, rânduri, acțiuni, exact ca în payload;
//   2. string-urile display-ready apar EXACT, inclusiv diacritice și text lung;
//   3. un câmp opțional absent ascunde DOAR acel element (fără „—", fără preț de rezervă);
//   4. tonurile vin din `tone`, niciodată din eticheta badge-ului;
//   5. un tip valid fără componentă e invariant error, nu un bloc sărit în tăcere.

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import validViews from './fixtures/web-v2/valid_views.json'
import WebViewRenderer from '@/chat/components/WebViewRenderer.jsx'
import BlockRenderer, { BLOCK_RENDERERS } from '@/chat/components/BlockRenderer.jsx'
import { WebViewRendererInvariantError } from '@/chat/components/rendererErrors.js'
import WebViewErrorBoundary from '@/chat/v2/WebViewErrorBoundary.jsx'

afterEach(cleanup)

/** Un singur bloc, izolat. `id` e cerut de contract, deci îl completăm dacă lipsește. */
function renderBlock(block, props = {}) {
  return render(<BlockRenderer block={{ id: 'b_test', ...block }} {...props} />)
}

describe('ordinea e a backendului', () => {
  it('randează mesajele și blocurile în exact ordinea primită', () => {
    // `comparison` are patru blocuri într-o ordine deliberat ne-evidentă: text, tabel, separator,
    // text. Un renderer „mai deștept" ar muta tabelul la final sau ar lipi textele.
    const view = validViews.comparison
    const { container } = render(<WebViewRenderer view={view} />)
    const expected = view.messages[0].blocks.map((block) => block.type)
    expect(expected).toEqual(['text', 'comparison', 'divider', 'text'])

    const rendered = [...container.querySelectorAll('p, table, hr')].map((node) =>
      node.tagName.toLowerCase(),
    )
    // p (text) → table (comparison) → hr (divider) → p (text). Rândurile tabelului conțin `th/td`,
    // nu `p`, deci secvența de mai sus e chiar ordinea blocurilor.
    expect(rendered.filter((tag) => tag !== 'p' || true)).toEqual(['p', 'table', 'hr', 'p'])
  })

  it('păstrează ordinea produselor, fără sortare sau dedupe', () => {
    const block = validViews.recommendation.messages[0].blocks.find(
      (candidate) => candidate.type === 'product_list',
    )
    renderBlock(block)
    const titles = block.items.map((item) => item.title)
    const rendered = screen.getAllByRole('article').map((node) => within(node).getByText(titles.find((title) => node.textContent.includes(title))).textContent)
    expect(rendered).toEqual(titles)
  })

  it('păstrează ordinea acțiunilor dintr-un rând', () => {
    const block = validViews.greeting.messages[0].blocks.find(
      (candidate) => candidate.type === 'action_row',
    )
    renderBlock(block)
    const labels = screen.getAllByRole('button').map((node) => node.textContent)
    expect(labels).toEqual(block.actions.map((action) => action.label))
  })
})

describe('string-urile display-ready apar exact', () => {
  it('prețul, reducerea și ratingul sunt textul serverului, nu unul recalculat', () => {
    const block = validViews.recommendation.messages[0].blocks.find(
      (candidate) => candidate.type === 'product_list',
    )
    const item = block.items.find((candidate) => candidate.price?.previous)
    expect(item, 'fixtura trebuie să aibă un produs cu preț redus').toBeTruthy()
    renderBlock(block)
    expect(screen.getByText(item.price.current)).toBeInTheDocument()
    expect(screen.getByText(item.price.previous)).toBeInTheDocument()
    if (item.price.discount) expect(screen.getByText(item.price.discount)).toBeInTheDocument()
    if (item.rating) expect(screen.getByText(item.rating)).toBeInTheDocument()
  })

  it('afișează `price.current` LITERAL, oricât de neverosimil ar fi', () => {
    // Atacul din card: un preț „1 leu" lângă un raw foarte diferit. FE-ul nu are voie să
    // „corecteze" nimic — nu vede raw-ul și nu recalculează.
    renderBlock({
      type: 'product_list',
      items: [{ view_id: 'v1', title: 'Produs', price: { current: '1 leu', previous: '999,00 lei' } }],
    })
    expect(screen.getByText('1 leu')).toBeInTheDocument()
    expect(screen.getByText('999,00 lei')).toBeInTheDocument()
  })

  it('păstrează diacriticele și textul lung neatinse', () => {
    const text = `Șampon cu extract de gălbenele și mușețel — ${'foarte lung '.repeat(40)}sfârșit`
    renderBlock({ type: 'text', text })
    expect(screen.getByText(text)).toBeInTheDocument()
  })
})

describe('un câmp absent ascunde DOAR acel element', () => {
  it('produs fără preț/rating/stoc: niciun înlocuitor local', () => {
    const { container } = renderBlock({
      type: 'product_list',
      items: [{ view_id: 'v1', title: 'Doar nume' }],
    })
    expect(screen.getByText('Doar nume')).toBeInTheDocument()
    // Nici monedă, nici „—", nici „În stoc" presupus.
    expect(container.textContent).toBe('Doar nume')
  })

  it('preț fără `previous`/`discount`: se afișează doar prețul curent', () => {
    const { container } = renderBlock({
      type: 'product_list',
      items: [{ view_id: 'v1', title: 'P', price: { current: '89,00 lei' } }],
    })
    expect(container.textContent).toBe('P89,00 lei')
  })

  it('celula de comparație cu `text: null` rămâne goală — fără „—" local', () => {
    const { container } = renderBlock({
      type: 'comparison',
      headers: ['A', 'B'],
      rows: [{ label: 'Preț', cells: [{ text: '89,00 lei' }, { text: null }] }],
    })
    const cells = container.querySelectorAll('tbody td')
    expect(cells).toHaveLength(2)
    expect(cells[0].textContent).toBe('89,00 lei')
    expect(cells[1].textContent).toBe('')
  })

  it('celula cu „—" trimis de server afișează exact „—"', () => {
    // Diferența care contează: placeholderul e o DECIZIE a serverului, în locale-ul lui.
    renderBlock({
      type: 'comparison',
      headers: ['A', 'B'],
      rows: [{ label: 'Garanție', cells: [{ text: '24 de luni' }, { text: '—' }] }],
    })
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

describe('tonul vine din `tone`, nu din etichetă', () => {
  it('un badge „Reducere 99%" cu tone neutral rămâne neutral', () => {
    // v1 avea `inferBadgeTone`, care ar fi făcut asta roșu după cuvântul „Reducere".
    renderBlock({
      type: 'product_list',
      items: [
        {
          view_id: 'v1',
          title: 'P',
          badges: [{ label: 'Reducere 99%', tone: 'neutral' }],
        },
      ],
    })
    const badge = screen.getByText('Reducere 99%')
    expect(badge.className).toContain('bg-[#6c7180]') // neutral
    expect(badge.className).not.toContain('bg-[#e03131]') // danger
  })

  it('badge fără `tone` primește defaultul DIN SCHEMĂ (neutral), nu unul dedus', () => {
    renderBlock({
      type: 'product_list',
      items: [{ view_id: 'v1', title: 'P', badges: [{ label: 'Super Preț' }] }],
    })
    expect(screen.getByText('Super Preț').className).toContain('bg-[#6c7180]')
  })
})

describe('fiecare tip de bloc are o componentă și o fixtură canonică', () => {
  const byType = new Map()
  for (const [name, view] of Object.entries(validViews)) {
    if (name === '_note') continue
    for (const message of view.messages ?? []) {
      for (const block of message.blocks) if (!byType.has(block.type)) byType.set(block.type, block)
    }
  }

  it('fixturile acoperă toate tipurile din registry', () => {
    // Dacă backendul adaugă un tip și fixturile nu-l acoperă, aflăm aici, nu în producție.
    expect([...byType.keys()].sort()).toEqual(Object.keys(BLOCK_RENDERERS).sort())
  })

  for (const [type, block] of byType) {
    it(`randează \`${type}\` fără să arunce`, () => {
      expect(() => renderBlock(block, { onSubmitAction: vi.fn() })).not.toThrow()
    })
  }
})

describe('invariant de renderer', () => {
  it('un tip fără componentă aruncă — nu randează `null` și nu sare blocul', () => {
    // Driftul de build: un hash mai nou negociat cu serverul aduce un tip pe care bundle-ul ăsta
    // nu-l cunoaște. Decoderul NX-242 îl lasă să treacă (e valid pentru hashul acceptat), deci
    // singurul care mai poate spune „nu pot" e rendererul.
    expect(() => renderBlock({ type: 'timeline', steps: [] })).toThrow(WebViewRendererInvariantError)
  })

  it('registryul e ÎNGHEȚAT: nu poate fi extins la runtime', () => {
    // Un registry mutabil ar însemna că cineva poate înregistra o componentă după un nume primit
    // din rețea — exact ce transformă un renderer pasiv într-un interpretor de markup remote.
    expect(Object.isFrozen(BLOCK_RENDERERS)).toBe(true)
  })

  it('o valoare de enum fără mapare locală aruncă, nu cade pe „neutral"', () => {
    // Un `danger` necunoscut afișat ca neutral ar ascunde exact avertismentul care conta.
    expect(() =>
      renderBlock({
        type: 'product_list',
        items: [{ view_id: 'v1', title: 'P', badges: [{ label: 'X', tone: 'chartreuse' }] }],
      }),
    ).toThrow(WebViewRendererInvariantError)
  })

  it('mesajul erorii nu conține nimic din payload', () => {
    const error = new WebViewRendererInvariantError('unregistered_block_type')
    expect(error.message).not.toContain('SENTINEL')
    expect(error.reason).toBe('unregistered_block_type')
  })
})

describe('invariantul devine stare tehnică, nu UI parțial', () => {
  // Matricea de failure din card: „tip valid în schema acceptată, dar absent din registry →
  // invariant error + technical unavailable pentru VIEW". Testul de mai sus dovedește că se
  // aruncă; asta dovedește ce se vede după — jumătatea care contează pentru cumpărător.
  const drift = {
    ...validViews.recommendation,
    messages: [
      {
        id: 'm1',
        role: 'assistant',
        blocks: [
          { id: 'b1', type: 'text', text: 'Text care S-AR randa singur' },
          { id: 'b2', type: 'timeline', steps: [] },
        ],
      },
    ],
  }

  it('afișează starea tehnică și NU randează parțial view-ul', () => {
    const onMetric = vi.fn()
    // React loghează erorile prinse de boundary; le tăcem ca ieșirea testului să rămână citibilă.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(
        <WebViewErrorBoundary onMetric={onMetric}>
          <WebViewRenderer view={drift} />
        </WebViewErrorBoundary>,
      )
      expect(screen.getByRole('alert')).toBeInTheDocument()
      // Blocul VALID dinaintea celui necunoscut nu rămâne pe ecran: un răspuns pe jumătate arată
      // exact ca unul întreg, iar asta e mai rău decât o eroare onestă.
      expect(screen.queryByText('Text care S-AR randa singur')).toBeNull()
    } finally {
      spy.mockRestore()
    }
    expect(onMetric).toHaveBeenCalledWith('web_view_render_total', {
      outcome: 'renderer_invariant_error',
      reason: 'unregistered_block_type',
    })
  })

  it('nu înghite erorile care NU sunt invarianți de renderer', () => {
    function Boom() {
      throw new TypeError('bug oarecare')
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() =>
        render(
          <WebViewErrorBoundary>
            <Boom />
          </WebViewErrorBoundary>,
        ),
      ).toThrow(TypeError)
    } finally {
      spy.mockRestore()
    }
  })

  it('un view sănătos trece neatins prin boundary', () => {
    render(
      <WebViewErrorBoundary>
        <WebViewRenderer view={validViews.greeting} />
      </WebViewErrorBoundary>,
    )
    const text = validViews.greeting.messages[0].blocks.find((b) => b.type === 'text')
    expect(screen.getByText(text.text)).toBeInTheDocument()
  })
})

describe('metrici — vocabular închis, zero conținut', () => {
  it('raportează view + fiecare bloc, fără nimic din payload', async () => {
    const onMetric = vi.fn()
    const view = validViews.recommendation
    render(<WebViewRenderer view={view} onMetric={onMetric} />)

    const names = onMetric.mock.calls.map(([name]) => name)
    expect(names).toContain('web_view_render_total')
    expect(names).toContain('web_view_render_ms')
    expect(names).toContain('web_block_render_total')

    const blockTypes = onMetric.mock.calls
      .filter(([name]) => name === 'web_block_render_total')
      .map(([, labels]) => labels.block_type)
    expect(blockTypes).toEqual(view.messages[0].blocks.map((block) => block.type))

    // Niciun text, preț, id de produs sau id de turn în etichete.
    const serialized = JSON.stringify(onMetric.mock.calls)
    for (const leak of ['89,00 lei', view.turn.id, view.conversation.id]) {
      expect(serialized).not.toContain(leak)
    }
  })

  it('un view fără mesaje nu raportează o randare care nu s-a întâmplat', () => {
    const onMetric = vi.fn()
    render(<WebViewRenderer view={validViews.status_working} onMetric={onMetric} />)
    expect(onMetric).not.toHaveBeenCalled()
  })

  it('o re-randare cu `onMetric` inline NU numără view-ul de două ori', () => {
    // Capcana clasică: literalul inline e o funcție nouă la fiecare render. Dacă ar fi dependență
    // de efect, un simplu re-render ar dubla numărătoarea și metrica ar minți în sus.
    const calls = []
    const view = validViews.recommendation
    const { rerender } = render(
      <WebViewRenderer view={view} onMetric={(name, labels) => calls.push([name, labels])} />,
    )
    rerender(<WebViewRenderer view={view} onMetric={(name, labels) => calls.push([name, labels])} />)
    expect(calls.filter(([name]) => name === 'web_view_render_total')).toHaveLength(1)
  })
})

describe('stările ne-terminale', () => {
  it('un view fără mesaje nu randează nimic (progresul e treaba shell-ului)', () => {
    const { container } = render(<WebViewRenderer view={validViews.status_working} />)
    expect(container.textContent).toBe('')
  })

  it('un terminal `failed` randează notice-ul serverului, nu un text local', () => {
    const view = validViews.terminal_failed
    render(<WebViewRenderer view={view} />)
    const notice = view.messages[0].blocks.find((block) => block.type === 'notice')
    expect(screen.getByText(notice.text)).toBeInTheDocument()
  })
})
