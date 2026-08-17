// NX-244 — acțiunile. Testul central e cel mai plictisitor: tokenul iese exact cum a intrat.
//
// De ce merită atâtea aserțiuni pentru „nu modifica string-ul": în v1 chips-ul își pierdea
// `payload`-ul și trimitea eticheta ca mesaj, iar butonul de detalii compunea
// `Spune-mi mai multe despre ${product.name}`. Ambele arată inofensiv până când eticheta e
// tradusă, produsul are un apostrof în nume, sau două produse au același nume. Un token opac nu
// are niciuna dintre problemele astea — dar numai dacă nimeni nu îl „ajută" pe drum.

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ActionControl, { ActionList } from '@/chat/components/ActionControl.jsx'
import BlockRenderer from '@/chat/components/BlockRenderer.jsx'
import { urlBlockReason, NAVIGATION_BLOCK_REASONS } from '@/chat/components/SafeNavigationLink.jsx'

afterEach(cleanup)

const submitAction = (token, overrides = {}) => ({
  id: 'a1',
  label: 'Vezi produsul',
  activation: { type: 'submit', token },
  ...overrides,
})

describe('submit — tokenul opac, neschimbat', () => {
  it('trimite EXACT tokenul, o singură dată per click', async () => {
    const onSubmitAction = vi.fn()
    const user = userEvent.setup()
    render(<ActionControl action={submitAction('opq.tok.1')} onSubmitAction={onSubmitAction} />)
    await user.click(screen.getByRole('button'))
    expect(onSubmitAction).toHaveBeenCalledTimes(1)
    expect(onSubmitAction).toHaveBeenCalledWith('opq.tok.1')
  })

  it.each([
    ['base64url cu padding', 'YWJjZA==.c2ln'],
    ['base64 standard cu + și /', 'ab+cd/ef==.Zm9v'],
    ['unicode', 'țoken.ăî.ȘȚ.😀'],
    ['spații interioare', 'tok en cu spatii'],
    ['foarte lung', `x${'y'.repeat(4000)}`],
    ['seamănă a JSON', '{"kind":"cart_add","id":1}'],
  ])('passthrough byte-identic: %s', async (_label, token) => {
    const onSubmitAction = vi.fn()
    const user = userEvent.setup()
    render(<ActionControl action={submitAction(token)} onSubmitAction={onSubmitAction} />)
    await user.click(screen.getByRole('button'))
    const [sent] = onSubmitAction.mock.calls[0]
    expect(sent).toBe(token)
    expect(sent.length).toBe(token.length) // fără trim, fără normalizare
  })

  it('eticheta nu se trimite și schimbarea ei nu schimbă tokenul', async () => {
    const onSubmitAction = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <ActionControl action={submitAction('opq.stabil')} onSubmitAction={onSubmitAction} />,
    )
    await user.click(screen.getByRole('button'))
    rerender(
      <ActionControl
        action={submitAction('opq.stabil', { label: 'ALT TEXT COMPLET DIFERIT' })}
        onSubmitAction={onSubmitAction}
      />,
    )
    await user.click(screen.getByRole('button'))
    expect(onSubmitAction.mock.calls).toEqual([['opq.stabil'], ['opq.stabil']])
    for (const [sent] of onSubmitAction.mock.calls) {
      expect(sent).not.toContain('Vezi produsul')
      expect(sent).not.toContain('ALT TEXT')
    }
  })

  it('tokenul nu ajunge într-un atribut DOM', () => {
    const { container } = render(
      <ActionControl action={submitAction('SENTINEL-TOKEN')} onSubmitAction={vi.fn()} />,
    )
    expect(container.innerHTML).not.toContain('SENTINEL-TOKEN')
  })

  it('`enabled: false` și `disabled` opresc activarea', async () => {
    const onSubmitAction = vi.fn()
    const user = userEvent.setup()
    render(
      <ActionList
        actions={[
          submitAction('t1', { id: 'a1', enabled: false }),
          submitAction('t2', { id: 'a2', label: 'Activ' }),
        ]}
        onSubmitAction={onSubmitAction}
        disabled
      />,
    )
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled()
      await user.click(button).catch(() => {})
    }
    expect(onSubmitAction).not.toHaveBeenCalled()
  })
})

describe('navigate — href-ul exact, prin poarta de URL', () => {
  const navigateAction = (href, overrides = {}) => ({
    id: 'n1',
    label: 'Deschide',
    activation: { type: 'navigate', href, ...overrides },
  })

  it('folosește href-ul neschimbat', () => {
    render(<ActionControl action={navigateAction('/produs/ser-vitamina-c?ref=chat')} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/produs/ser-vitamina-c?ref=chat')
  })

  it('`_blank` primește `noopener noreferrer` (anti tabnabbing)', () => {
    render(<ActionControl action={navigateAction('https://shop.example/p/1', { target: '_blank' })} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('`_self` (defaultul din schemă) nu primește rel', () => {
    render(<ActionControl action={navigateAction('/p/1')} />)
    expect(screen.getByRole('link').getAttribute('rel')).toBeNull()
  })

  it.each([
    ['javascript:', 'javascript:alert(1)', NAVIGATION_BLOCK_REASONS.FORBIDDEN_SCHEME],
    ['data:', 'data:text/html,<script>1</script>', NAVIGATION_BLOCK_REASONS.FORBIDDEN_SCHEME],
    ['blob:', 'blob:https://x/y', NAVIGATION_BLOCK_REASONS.FORBIDDEN_SCHEME],
    ['http simplu', 'http://shop.example', NAVIGATION_BLOCK_REASONS.FORBIDDEN_SCHEME],
    ['protocol-relativ', '//evil.example/x', NAVIGATION_BLOCK_REASONS.PROTOCOL_RELATIVE],
    ['cu newline în schemă', 'java\nscript:alert(1)', NAVIGATION_BLOCK_REASONS.MALFORMED],
    ['cu backslash', 'https://a\\b', NAVIGATION_BLOCK_REASONS.MALFORMED],
  ])('respinge %s', (_label, href, reason) => {
    expect(urlBlockReason(href)).toBe(reason)
  })

  it.each([
    ['cale absolută', '/produs/1'],
    ['https', 'https://shop.example/p/1'],
  ])('acceptă %s', (_label, href) => {
    expect(urlBlockReason(href)).toBeNull()
  })

  it('o navigare `enabled: false` nu rămâne activabilă de la tastatură', () => {
    // `pointer-events-none` oprește mouse-ul, nu Enter pe o ancoră focusată. Un CTA „dezactivat"
    // care tot navighează e mai rău decât unul care lipsește.
    render(<ActionControl action={{ ...navigateAction('/p/1'), enabled: false }} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('Deschide')).toHaveAttribute('aria-disabled', 'true')
  })

  it('`disabled` (turn activ) inertează și navigările', () => {
    render(<ActionControl action={navigateAction('/p/1')} disabled />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('un href respins produce control INACTIV + diagnostic, nu o navigare', () => {
    const onMetric = vi.fn()
    render(<ActionControl action={navigateAction('javascript:alert(1)')} onMetric={onMetric} />)
    // Niciun `<a href>`: nu există nimic de apăsat care să ducă undeva.
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('Deschide')).toHaveAttribute('aria-disabled', 'true')
    expect(onMetric).toHaveBeenCalledWith('web_navigation_blocked_total', {
      reason: NAVIGATION_BLOCK_REASONS.FORBIDDEN_SCHEME,
    })
  })
})

describe('nicio semantică de acțiune în browser', () => {
  it('nu există rută de coș hardcodată, oricare ar fi eticheta', () => {
    const { container } = render(
      <ActionList
        actions={[
          { id: 'a1', label: 'Adaugă în coș', activation: { type: 'submit', token: 'opq.1' } },
          { id: 'a2', label: 'Finalizează comanda', activation: { type: 'submit', token: 'opq.2' } },
        ]}
        onSubmitAction={vi.fn()}
      />,
    )
    // Etichete comerciale, dar amândouă sunt butoane de submit: niciun `<a href="/Cart">`.
    expect(container.querySelectorAll('a')).toHaveLength(0)
    expect(container.innerHTML).not.toContain('/Cart')
  })

  it('`appearance` alege doar clasa; nu schimbă tipul de control', async () => {
    const onSubmitAction = vi.fn()
    const user = userEvent.setup()
    render(
      <ActionList
        actions={['primary', 'secondary', 'chip', 'link', 'danger'].map((appearance, i) => ({
          id: `a${i}`,
          label: appearance,
          appearance,
          activation: { type: 'submit', token: `opq.${appearance}` },
        }))}
        onSubmitAction={onSubmitAction}
      />,
    )
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(5)
    // Inclusiv `link`: e un SUBMIT cu aspect de link, deci rămâne buton, nu ancoră.
    for (const button of buttons) await user.click(button)
    expect(onSubmitAction.mock.calls.map(([token]) => token)).toEqual([
      'opq.primary', 'opq.secondary', 'opq.chip', 'opq.link', 'opq.danger',
    ])
  })

  it('acțiunile dintr-un `cart_summary` sunt tot tokenuri opace', async () => {
    const onSubmitAction = vi.fn()
    const user = userEvent.setup()
    render(
      <BlockRenderer
        block={{
          id: 'c1',
          type: 'cart_summary',
          title: 'Coșul tău',
          lines: [{ view_id: 'l1', title: 'Ser', quantity: '1 bucată', price: { current: '89,00 lei' } }],
          total: { current: '89,00 lei' },
          actions: [{ id: 'a1', label: 'Finalizează', activation: { type: 'submit', token: 'opq.checkout' } }],
        }}
        onSubmitAction={onSubmitAction}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Finalizează' }))
    expect(onSubmitAction).toHaveBeenCalledWith('opq.checkout')
  })
})

describe('metrici — etichete închise, zero conținut', () => {
  it('activarea raportează doar tipul și aspectul', async () => {
    const onMetric = vi.fn()
    const user = userEvent.setup()
    render(
      <ActionControl
        action={submitAction('SENTINEL-TOKEN', { label: 'SENTINEL-LABEL', appearance: 'chip' })}
        onSubmitAction={vi.fn()}
        onMetric={onMetric}
      />,
    )
    await user.click(screen.getByRole('button'))
    expect(onMetric).toHaveBeenCalledWith('web_action_activate_total', {
      activation_type: 'submit',
      appearance: 'chip',
    })
    const serialized = JSON.stringify(onMetric.mock.calls)
    expect(serialized).not.toContain('SENTINEL-TOKEN')
    expect(serialized).not.toContain('SENTINEL-LABEL')
  })
})
