// NX-244 — plasa pentru invarianții de renderer.
//
// Un `WebViewRendererInvariantError` înseamnă că payloadul e valid pentru schema negociată, dar
// buildul ăsta nu îl poate randa integral. Alegerea e între „arată tot ce înțelegi" și „spune că
// nu poți". Cardul cere a doua, iar motivul e simplu: un răspuns din care lipsește tăcut blocul
// de preț arată exact ca un răspuns complet. Cumpărătorul n-are cum să afle, iar noi nici atât.
//
// De aceea boundary-ul acoperă TOT view-ul, nu blocul: un „UI parțial" cu o gaură în mijloc e mai
// periculos decât o stare tehnică onestă. Erorile care nu sunt invarianți de renderer se re-aruncă
// — nu transformăm un bug oarecare într-un mesaj liniștitor.

import React from 'react'
import { WebViewRendererInvariantError } from '../components/rendererErrors.js'
import { TECHNICAL_COPY } from './technicalCopy.js'

export default class WebViewErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError(error) {
    if (error instanceof WebViewRendererInvariantError) return { failed: true }
    throw error
  }

  componentDidCatch(error) {
    if (!(error instanceof WebViewRendererInvariantError)) return
    // `reason` e low-cardinality și nu conține nimic din payload: tipul brut al blocului nu devine
    // niciodată label (ar fi controlat de server, deci nemărginit).
    this.props.onMetric?.('web_view_render_total', {
      outcome: 'renderer_invariant_error',
      reason: error.reason,
    })
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div
        role="alert"
        className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900"
      >
        {TECHNICAL_COPY.renderUnavailable}
      </div>
    )
  }
}
