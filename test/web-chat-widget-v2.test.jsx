// NX-243 — integrarea widgetului cu protocolul v2, pe calea REALĂ (flag pornit, transport real,
// `fetch` stubuit). Restul suitei testează controllerul izolat; aici se verifică exact lucrurile
// care se pot rupe doar la îmbinare:
//
//   • cu flagul STINS, widgetul nu atinge deloc v2 (nici măcar bootstrapul);
//
// NX-244 a schimbat DELIBERAT ce se vede pe calea v2: shell-ul nu mai împrumută copy-ul inventat
// de v1 („Aria", „Întreabă orice despre produse…"). Numele launcherului, titlul și placeholderul
// vin acum din `chrome`/`composer`, adică de la server. Aserțiunile v2 de mai jos verifică exact
// asta; cele v1 au rămas neatinse, fiindcă v1 a rămas neatins.
//   • cu flagul pornit, un backend indisponibil NU produce un widget mut — starea tehnică se vede
//     și are reîncercare (bug găsit la review: `hasConversation` nu includea `fault`, iar butonul
//     de retry depindea de `fault.retryable`, care e `false` pentru defectele de transport);
//   • composerul chiar se blochează cât timp turul e activ și se deblochează pe terminal;
//   • nu se scrie niciun transcript în `localStorage`.

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import validViews from './fixtures/web-v2/valid_views.json'

const PUBLIC_TOKEN = 'pub_test_token'

/** Widgetul citește flagul la IMPORT, deci fiecare scenariu are nevoie de un modul proaspăt. */
async function loadWidget({ v2 }) {
  vi.resetModules()
  vi.stubEnv('VITE_CHAT_PUBLIC_TOKEN', PUBLIC_TOKEN)
  vi.stubEnv('VITE_CHAT_API_BASE', 'https://bot.example.invalid')
  vi.stubEnv('VITE_CHAT_PROTOCOL_V2', v2 ? '1' : '')
  const mod = await import('@/components/store/ChatWidget')
  return mod.default
}

function jsonResponse(status, body, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  }
}

// NX-244: bootstrapul real livrează și copy-ul ramei. Derivat dintr-o fixtură de view, ca forma
// să rămână legată de contract, nu de imaginația testului.
const VIEW_COPY = {
  composer: validViews.greeting.composer,
  chrome: validViews.greeting.chrome,
  a11y: validViews.greeting.a11y,
}
const bootstrapBody = {
  token: PUBLIC_TOKEN,
  visitor_id: 'web_v2',
  sig: 'v2.a.b',
  sse_url: '/web/stream',
  view_copy: VIEW_COPY,
}

function statusBody(clientTurnId, status = 'accepted') {
  return {
    schema_version: 'web-turn-status.v2',
    turn: { id: 'turn_int_1', client_turn_id: clientTurnId, status },
    status_url: '/web/v2/turns/turn_int_1',
    poll_after_ms: 5,
  }
}

function terminalBody(clientTurnId) {
  return {
    ...validViews.recommendation,
    conversation: { id: 'conv_int', revision: 3 },
    turn: { id: 'turn_int_1', client_turn_id: clientTurnId, status: 'completed' },
  }
}

let fetchMock

beforeEach(() => {
  localStorage.clear()
  // `EventSource` lipsește în jsdom ⇒ controllerul cade pe polling, ceea ce e exact fallbackul.
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('flag STINS — v2 nu există', () => {
  it('widgetul nu face niciun request v2 și păstrează transcriptul v1', async () => {
    const ChatWidget = await loadWidget({ v2: false })
    const user = userEvent.setup()
    render(<ChatWidget />)
    await user.click(screen.getByRole('button', { name: /aria/i }))
    await screen.findByPlaceholderText(/Întreabă orice/i)

    // Zero atingeri de rețea la montare: v1 vorbește abia la primul mesaj.
    expect(fetchMock).not.toHaveBeenCalled()
    // Oglinda locală v1 rămâne activă (se elimină la cutoverul NX-249, nu aici).
    await waitFor(() => expect(localStorage.getItem('aria-chat-messages')).not.toBeNull())
  })
})

describe('flag PORNIT — backend indisponibil', () => {
  it('nu rămâne mut: arată starea tehnică și oferă reîncercare', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const ChatWidget = await loadWidget({ v2: true })
    const user = userEvent.setup()
    render(<ChatWidget />)
    // Bootstrapul a picat, deci nu există `chrome`: launcherul poartă numele TEHNIC de rezervă.
    // Un buton fără nume accesibil ar fi mai rău decât unul generic — dar copy-ul comercial tot
    // nu se inventează.
    await user.click(await screen.findByRole('button', { name: /Asistent/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reîncearcă/i })).toBeInTheDocument()

    // Composerul e inactiv cât nu există sesiune — dar starea e VIZIBILĂ, nu tăcută. Fără
    // `composer` de la server, câmpul n-are placeholder: îl găsim după rol, nu după copy inventat.
    const input = screen.getByRole('textbox')
    expect(input).toBeDisabled()
    expect(input).not.toHaveAttribute('placeholder')

    fetchMock.mockResolvedValue(jsonResponse(200, bootstrapBody))
    await user.click(screen.getByRole('button', { name: /Reîncearcă/i }))
    await waitFor(() => expect(screen.getByRole('textbox')).toBeEnabled())
  })
})

describe('flag PORNIT — shell-ul poartă numele serverului', () => {
  it('launcher, titlu, close și placeholder vin din `view_copy`, nu din FE', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, bootstrapBody))
    const ChatWidget = await loadWidget({ v2: true })
    const user = userEvent.setup()
    render(<ChatWidget />)

    const launcher = await screen.findByRole('button', { name: VIEW_COPY.chrome.launcher_label })
    await user.click(launcher)

    expect(screen.getByRole('dialog', { name: VIEW_COPY.chrome.dialog_title })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: VIEW_COPY.chrome.close_label })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByPlaceholderText(VIEW_COPY.composer.placeholder)).toBeEnabled(),
    )

    // Copy-ul v1 a DISPĂRUT de pe calea v2 — asta e jumătate din card.
    expect(screen.queryByText(/Întreabă orice despre produse/i)).toBeNull()
    expect(screen.queryByText(/Recomandă-mi un ser pentru ten gras/i)).toBeNull()
    expect(screen.queryByText(/Sunt Aria/i)).toBeNull()
  })

  it('copy-ul supraviețuiește unui refresh, fără al doilea bootstrap', async () => {
    // Bootstrapul e rate-limitat pe server: o sesiune restaurată nu-l mai poate cere. Dacă am
    // pierde copy-ul la remount, shell-ul ar rămâne fără nume exact pe calea cea mai frecventă.
    fetchMock.mockResolvedValue(jsonResponse(200, bootstrapBody))
    const ChatWidget = await loadWidget({ v2: true })
    const user = userEvent.setup()
    const first = render(<ChatWidget />)
    await user.click(await screen.findByRole('button', { name: VIEW_COPY.chrome.launcher_label }))
    await waitFor(() =>
      expect(screen.getByPlaceholderText(VIEW_COPY.composer.placeholder)).toBeEnabled(),
    )
    first.unmount()

    fetchMock.mockClear()
    render(<ChatWidget />)
    await user.click(await screen.findByRole('button', { name: VIEW_COPY.chrome.launcher_label }))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('flag PORNIT — turul complet', () => {
  it('blochează composerul pe durata turului, randează view-ul serverului, nu persistă transcript', async () => {
    let clientTurnId = null
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).includes('/web/bootstrap')) return jsonResponse(200, bootstrapBody)
      if (init?.method === 'POST') {
        clientTurnId = JSON.parse(init.body).client_turn_id
        return jsonResponse(202, statusBody(clientTurnId))
      }
      return jsonResponse(200, terminalBody(clientTurnId))
    })

    const ChatWidget = await loadWidget({ v2: true })
    const user = userEvent.setup()
    render(<ChatWidget />)
    await user.click(await screen.findByRole('button', { name: VIEW_COPY.chrome.launcher_label }))

    const input = await screen.findByPlaceholderText(VIEW_COPY.composer.placeholder)
    await waitFor(() => expect(input).toBeEnabled())

    // Enter în câmp = submit-ul formularului, adică exact calea folosită de utilizator.
    await user.type(input, 'ser pentru ten gras{Enter}')

    // Cât turul e activ, composerul e blocat — nu doar guardat în `send()` ca în v1.
    await waitFor(() => expect(input).toBeDisabled())

    // Rezultatul serverului ajunge pe ecran, cu textul LUI (display-ready, neatins de FE).
    // Fără SSE în jsdom, drumul e polling la cadența server-owned (`poll_after_ms`), deci
    // așteptarea depășește pragul implicit al lui `findBy*`.
    const firstBlock = validViews.recommendation.messages[0].blocks.find((b) => b.type === 'text')
    expect(await screen.findByText(firstBlock.text, {}, { timeout: 5000 })).toBeInTheDocument()
    // Prețul e cel formatat de backend; browserul nu recalculează nimic.
    expect(screen.getByText('89,00 lei')).toBeInTheDocument()

    await waitFor(() => expect(screen.getByRole('textbox')).toBeEnabled())

    // POST exact o dată; restul sunt bootstrap + status.
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(posts).toHaveLength(1)

    // Zero transcript local: doar recordul tehnic + copy-ul de ramă, sub cheia lor.
    expect(localStorage.getItem('aria-chat-messages')).toBeNull()
    const dump = JSON.stringify(Object.entries(localStorage))
    expect(dump).not.toContain('ser pentru ten gras')
    expect(dump).not.toContain('89,00 lei')
  })
})
