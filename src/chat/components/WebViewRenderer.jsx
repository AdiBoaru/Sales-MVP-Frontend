// NX-244 — mesajele unui view, în ordinea primită.
//
// Ce înseamnă „pasiv", concret: fără split, fără merge, fără append semantic. Nu se intercalează
// produse în text (v1 decidea unde „încap" cardurile), nu se mută comparația înaintea prozei, nu
// se adaugă un disclaimer după fiecare replică și nu se sare peste un mesaj considerat redundant.
// Compoziția răspunsului e a projectorului (NX-240) — el are faptele și validatorul.
//
// Bulele: `role` vine de la server. Un mesaj `user` se randează ca bulă proprie doar fiindcă
// serverul spune că e al utilizatorului, nu fiindcă l-am trimis noi și ni-l amintim local.

import { useEffect, useRef } from 'react'
import BlockRenderer from './BlockRenderer.jsx'
import { WEB_VIEW_V2_SCHEMA_VERSION } from '../contract/generated/webViewV2SchemaHash.js'

function now() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

export function WebViewMessage({ message, onSubmitAction, disabled, onMetric }) {
  const mine = message.role === 'user'
  return (
    <div className={mine ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={
          mine
            ? 'max-w-[85%] rounded-2xl rounded-br-md aria-gradient-bg text-white px-3.5 py-2.5 text-[13px] whitespace-pre-line'
            : 'w-full flex flex-col gap-2.5'
        }
      >
        {message.blocks.map((block) => (
          <BlockRenderer
            key={block.id}
            block={block}
            onSubmitAction={onSubmitAction}
            disabled={disabled}
            onMetric={onMetric}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Un view întreg. `messages` poate fi gol pe stările ne-terminale (`accepted`/`working`): atunci
 * nu se randează nimic aici, iar progresul îl arată shell-ul din textul serverului.
 */
export default function WebViewRenderer({ view, onSubmitAction, disabled, onMetric }) {
  const messages = view?.messages
  // Măsurat, nu ghicit: cronometrul pornește la începutul randării și se citește în efect, adică
  // după ce DOM-ul chiar există. Etichetele sunt un vocabular ÎNCHIS — `block_type` vine din
  // uniunea finită a schemei, deci e mărginit; nimic din payload (text, preț, id, token) nu
  // devine label, fiindcă ar fi cardinalitate controlată de server.
  const startedAt = useRef(now())
  startedAt.current = now()
  // `onMetric` printr-un REF, nu prin dependență: un apelant care îl scrie ca literal inline (cum
  // scrie oricine) ar produce o funcție nouă la fiecare render, efectul s-ar reexecuta și fiecare
  // re-randare ar număra încă o dată același view. E aceeași capcană pe care NX-243 a documentat-o
  // pentru callback-urile controllerului.
  const onMetricRef = useRef(onMetric)
  onMetricRef.current = onMetric
  const turnId = view?.turn?.id
  const messageCount = Array.isArray(messages) ? messages.length : 0
  useEffect(() => {
    const emit = onMetricRef.current
    if (typeof emit !== 'function' || messageCount === 0) return
    emit('web_view_render_total', { schema_major: WEB_VIEW_V2_SCHEMA_VERSION, outcome: 'ok' })
    emit('web_view_render_ms', { ms: Math.max(0, now() - startedAt.current) })
    for (const message of messages) {
      for (const block of message.blocks) {
        emit('web_block_render_total', { block_type: block.type, outcome: 'ok' })
      }
    }
    // Un view din listă e TERMINAL și imuabil per tur (reducerul nu ține view-uri ne-terminale),
    // deci `turnId` + prezența mesajelor descriu exact „un view randat, o dată".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnId, messageCount])

  if (!Array.isArray(messages) || messages.length === 0) return null
  return (
    <>
      {messages.map((message) => (
        <WebViewMessage
          key={message.id}
          message={message}
          onSubmitAction={onSubmitAction}
          disabled={disabled}
          onMetric={onMetric}
        />
      ))}
    </>
  )
}
