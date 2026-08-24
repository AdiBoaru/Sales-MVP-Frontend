// NX-243 — o singură instanță de widget, care supraviețuiește navigării.
//
// Bug-ul reparat: `ChatWidget` era randat din `Store.jsx` ȘI din `ProductDetail.jsx`. React nu
// vede „aceeași componentă" în două subarbori diferite, deci fiecare navigare `/store ↔
// /product/:id` o demonta și o remonta — pierzând starea turului și re-rulând efectele. Testul de
// comportament de mai jos e mai tare decât un contor de mount: dacă widgetul s-ar remonta,
// panoul deschis s-ar închide, fiindcă `open` pornește din `false`.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import ProtectedStorefrontChatLayout from '@/layouts/ProtectedStorefrontChatLayout'

// Rădăcina proiectului: vitest rulează cu cwd = root, iar asertările de mai jos sunt pe SURSĂ
// (nu pe bundle), fiindcă „cine montează widgetul" e o proprietate a structurii, nu a runtime-ului.
const readSource = (relative) => readFileSync(resolve(process.cwd(), relative), 'utf8')

function StubStore() {
  return (
    <div>
      <h1>Magazin</h1>
      <Link to="/product/42">Vezi produsul</Link>
    </div>
  )
}

function StubProduct() {
  return (
    <div>
      <h1>Produs 42</h1>
      <Link to="/store">Înapoi</Link>
    </div>
  )
}

/** Oglindă a structurii din `App.jsx`: rutele de vitrină sub layoutul persistent. */
function renderStorefront(initialEntry = '/store') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/" element={<h1>Landing</h1>} />
        <Route element={<ProtectedStorefrontChatLayout />}>
          <Route path="/store" element={<StubStore />} />
          <Route path="/product/:id" element={<StubProduct />} />
        </Route>
        <Route path="/Cart" element={<h1>Coș</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('mount unic pe rutele de vitrină', () => {
  it('există exact un launcher pe /store', () => {
    renderStorefront('/store')
    expect(screen.getAllByRole('button', { name: /aria/i })).toHaveLength(1)
  })

  it('există exact un launcher pe /product/:id', () => {
    renderStorefront('/product/42')
    expect(screen.getAllByRole('button', { name: /aria/i })).toHaveLength(1)
  })

  it('widgetul NU se remontează la navigarea /store → /product → /store', async () => {
    const user = userEvent.setup()
    renderStorefront('/store')

    // Deschidem panoul: starea trăiește în instanța widgetului.
    await user.click(screen.getByRole('button', { name: /aria/i }))
    expect(await screen.findByPlaceholderText(/Caută produse sau inspirație/i)).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: /Vezi produsul/i }))
    await screen.findByText('Produs 42')
    // Dacă s-ar fi remontat, `open` ar fi redevenit `false` și inputul ar fi dispărut.
    expect(screen.getByPlaceholderText(/Caută produse sau inspirație/i)).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: /Înapoi/i }))
    await screen.findByText('Magazin')
    expect(screen.getByPlaceholderText(/Caută produse sau inspirație/i)).toBeInTheDocument()
    // Și tot una singură, nu două panouri suprapuse.
    expect(screen.getAllByPlaceholderText(/Caută produse sau inspirație/i)).toHaveLength(1)
  })

  it('rutele din afara allowlistului nu primesc widgetul', async () => {
    renderStorefront('/Cart')
    await waitFor(() => expect(screen.getByText('Coș')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /aria/i })).toBeNull()

    renderStorefront('/')
    expect(screen.getByText('Landing')).toBeInTheDocument()
  })
})

describe('sursa: mountul a plecat din pagini', () => {
  it('Store.jsx nu mai randează widgetul (păstrează doar seam-ul `openAria`)', () => {
    const source = readSource('src/pages/Store.jsx')
    expect(source).not.toMatch(/<ChatWidget\s*\/>/)
    expect(source).not.toMatch(/import\s+ChatWidget/)
    expect(source).toContain('openAria')
  })

  it('ProductDetail.jsx nu mai importă și nu mai randează widgetul', () => {
    const source = readSource('src/pages/ProductDetail.jsx')
    expect(source).not.toMatch(/<ChatWidget\s*\/>/)
    expect(source).not.toMatch(/import\s+ChatWidget/)
  })

  it('App.jsx montează widgetul o singură dată, prin layout, doar pe rutele aprobate', () => {
    const source = readSource('src/App.jsx')
    expect(source).toContain('ProtectedStorefrontChatLayout')
    // Layoutul NU e lazy: un layout suspendabil s-ar remonta la prima navigare între copii.
    expect(source).not.toMatch(/lazy\(\(\)\s*=>\s*import\('@\/layouts/)
    // Rutele de vitrină sunt copii ai layoutului; /Cart și landing rămân în afara lui.
    const layoutBlock = source.slice(
      source.indexOf('<Route element={<ProtectedStorefrontChatLayout />}>'),
      source.indexOf('</Route>'),
    )
    expect(layoutBlock).toContain('path="/store"')
    expect(layoutBlock).toContain('path="/product/:id"')
    expect(layoutBlock).not.toContain('path="/Cart"')
    expect(layoutBlock).not.toContain('path="/"')
  })

  it('layoutul randează `<Outlet />` + un singur `<ChatWidget />`', () => {
    const source = readSource('src/layouts/ProtectedStorefrontChatLayout.jsx')
    expect(source).toContain('<Outlet />')
    expect(source.match(/<ChatWidget\s*\/>/g)).toHaveLength(1)
  })
})

describe('calea v1 rămâne neatinsă cât timp v2 e stins', () => {
  it('widgetul nu pornește niciun request v2 cu flagul OFF', () => {
    // `VITE_CHAT_PROTOCOL_V2` nu e setat în teste ⇒ controllerul e inert (`enabled: false`).
    const source = readSource('src/api/chatClient.js')
    expect(source).toContain('import.meta.env.VITE_CHAT_PROTOCOL_V2 === "1"')
    // Nicio auto-detectare după forma payloadului: comutarea e explicită, la build.
    expect(source).not.toMatch(/schema_version\s*===\s*["']web-view\.v2["']/)
  })

  it('calea v1 (`/web/chat` + normalizeReply) e neschimbată', () => {
    const source = readSource('src/api/chatClient.js')
    expect(source).toContain('url("/web/chat")')
    expect(source).toContain('export function normalizeReply')
  })
})
