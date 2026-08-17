// NX-243 — layoutul care ține widgetul MONTAT peste rutele de vitrină.
//
// Înainte, `ChatWidget` era randat din `Store.jsx` ȘI din `ProductDetail.jsx`. Fiecare navigare
// `/store ↔ /product/:id` îl demonta și îl remonta: se pierdea starea turului, se re-executau
// efectele, iar conversația „supraviețuia" doar pentru că era oglindită în `localStorage` — adică
// exact a doua sursă de adevăr pe care cardul o scoate. Cu un layout persistent, `<Outlet />`
// schimbă pagina, iar instanța widgetului rămâne aceeași: turul în lucru nu are de unde să se
// piardă.
//
// Allowlist deliberat: DOAR `/store` și `/product/:id`. Widgetul nu urcă pe landing, pe `/Cart`
// sau pe alte rute fără o decizie de produs — un asistent care apare peste tot nu e o
// îmbunătățire, e o schimbare de scop.

import { Outlet } from 'react-router-dom'
import ChatWidget from '@/components/store/ChatWidget'

export default function ProtectedStorefrontChatLayout() {
  return (
    <>
      <Outlet />
      <ChatWidget />
    </>
  )
}
