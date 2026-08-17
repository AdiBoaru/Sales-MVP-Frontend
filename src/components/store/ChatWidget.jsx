// NX-244 — selectorul de protocol. Un singur `if`, luat la BUILD, nu la runtime.
//
// De ce contează forma exactă: `import.meta.env.VITE_CHAT_PROTOCOL_V2` e înlocuit literal de Vite
// înainte de bundling, deci condiția devine `if (true)` sau `if (false)` și Rollup elimină ramura
// moartă ÎMPREUNĂ cu importul ei. Rezultatul e cerința din card: buildul v2 nu conține widgetul
// v1, `chatDemo.js` sau `?preview=1`, iar buildul v1 nu conține rendererul v2. Dacă flagul ar fi
// citit printr-un `const` exportat din alt modul, bundlerul n-ar mai putea dovedi nimic și ambele
// arbori ar rămâne în chunk.
//
// Alegerea e explicită, de deploy (NX-249) — niciodată dedusă din forma unui răspuns de la server.
// „Payloadul arată a v2, hai să randăm v2" e exact felul în care un cutover devine imposibil de
// dat înapoi.
//
// `openAria` se re-exportă de aici pentru compatibilitate cu apelanții existenți (antetul
// vitrinei), dar vine dintr-un modul NEUTRU: dacă ar veni din widgetul v1, orice pagină care îl
// importă ar readuce v1 în buildul v2 și tree-shakingul de mai sus n-ar mai însemna nimic.

import ChatV2Entry from '@/components/store/ChatV2Entry'
import ChatWidgetV1 from '@/components/store/ChatWidgetV1'

export { openAria } from '@/components/store/ariaOpenEvent'

export default function ChatWidget() {
  if (import.meta.env.VITE_CHAT_PROTOCOL_V2 === '1') return <ChatV2Entry />
  return <ChatWidgetV1 />
}
