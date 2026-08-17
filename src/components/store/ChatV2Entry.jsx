// NX-244 — punctul în care aplicația îi dă widgetului v2 configurația lui.
//
// De ce e AICI și nu în `src/chat/v2/`: `src/chat/**` e frontiera de contract și n-are voie să
// importe nimic din domeniu — nici măcar `@/api/chatClient`, care știe `apiBase` și tokenul
// public (lint + testul de boundary o impun). Așa că wiring-ul stă în `components/`, unde îi e
// locul, iar shell-ul rămâne o funcție de `controller`, testabilă fără rețea și fără env.
//
// Entry-ul nu ține stare proprie și nu compune text. Creează controllerul NX-243 (unul singur —
// layoutul persistent garantează o singură instanță montată) și îl dă mai departe.

import { useEffect, useState } from 'react'
import { useWebChatController } from '@/chat/state/useWebChatController'
import WebChatWidgetV2 from '@/chat/v2/WebChatWidgetV2'
import { CHAT_TRANSPORT_CONFIG } from '@/api/chatClient'
import { ARIA_OPEN_EVENT } from '@/components/store/ariaOpenEvent'

export default function ChatV2Entry() {
  const controller = useWebChatController({
    enabled: true,
    apiBase: CHAT_TRANSPORT_CONFIG.apiBase,
    publicToken: CHAT_TRANSPORT_CONFIG.publicToken,
  })
  const [open, setOpen] = useState(false)

  // Deschiderea din afară: butonul din antet și `?chat=1`. Ține de aplicație (rutare, `window`),
  // deci stă aici, nu în shell. `?preview=1` NU e tratat nicăieri pe v2 — nu există conversație
  // de probă pe calea asta, în niciun mediu.
  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(ARIA_OPEN_EVENT, onOpen)
    const params = new URLSearchParams(window.location.search)
    if (params.get('chat') === '1') {
      setOpen(true)
      params.delete('chat')
      const query = params.toString()
      window.history.replaceState({}, document.title, window.location.pathname + (query ? `?${query}` : ''))
    }
    return () => window.removeEventListener(ARIA_OPEN_EVENT, onOpen)
  }, [])

  return <WebChatWidgetV2 controller={controller} open={open} onOpenChange={setOpen} />
}
