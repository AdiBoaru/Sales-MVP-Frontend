import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App'
import '@/index.css'

// Modalitatea ultimei interacțiuni, marcată pe <html>. Există fiindcă `:focus-visible`
// nu o poate exprima pentru un câmp de text: browserul îl consideră „focus vizibil" și
// la click, deci CSS-ul singur nu distinge „am dat click în composer" (unde un inel de
// focus e zgomot) de „am ajuns aici cu Tab" (unde e obligatoriu). Vezi regula
// `[data-nav="kbd"] .nx-composer-pill` din index.css.
// Capture, ca un handler care oprește propagarea să nu ne lase cu flagul blocat.
const navRoot = document.documentElement
addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Tab') navRoot.dataset.nav = 'kbd'
  },
  true,
)
addEventListener(
  'pointerdown',
  () => {
    delete navRoot.dataset.nav
  },
  true,
)

const rootEl = document.getElementById('root')
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
