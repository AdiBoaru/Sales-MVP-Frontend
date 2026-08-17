// NX-244 — registryul FINIT `block.type → componentă`.
//
// Registryul nu e extensibil prin nume primit din rețea. Backendul nu trimite niciodată un nume
// de componentă, o clasă CSS sau markup: alege un token semantic dintr-o uniune închisă, iar
// implementarea sigură e a clientului. Un tip nou cere schemă + hash + decoder + componentă +
// teste, într-un release coordonat — nu un câmp în plus într-un payload.
//
// `default` NU există ca „ignoră". Un tip străin e imposibil (decoderul NX-242 respinge tot
// payloadul înainte); un tip VALID pentru hashul acceptat dar fără componentă înseamnă că buildul
// ăsta a rămas în urmă — și atunci alegerea onestă e o stare tehnică pe tot view-ul, nu un bloc
// omis în tăcere dintr-un răspuns care arată complet.

import ActionRowBlock from './blocks/ActionRowBlock.jsx'
import CartSummaryBlock from './blocks/CartSummaryBlock.jsx'
import ComparisonBlock from './blocks/ComparisonBlock.jsx'
import DividerBlock from './blocks/DividerBlock.jsx'
import KeyValueBlock from './blocks/KeyValueBlock.jsx'
import MemoryBlock from './blocks/MemoryBlock.jsx'
import NoticeBlock from './blocks/NoticeBlock.jsx'
import ProductListBlock from './blocks/ProductListBlock.jsx'
import RoutineBlock from './blocks/RoutineBlock.jsx'
import StatusListBlock from './blocks/StatusListBlock.jsx'
import TextBlock from './blocks/TextBlock.jsx'
import { RENDERER_INVARIANT_REASONS, WebViewRendererInvariantError } from './rendererErrors.js'

/**
 * Exhaustiv pentru `WEB_VIEW_V2_BLOCK_TYPES` (generat din schemă). Testul de boundary compară
 * cheile de aici cu allowlistul generat: dacă backendul adaugă un tip și registryul rămâne în
 * urmă, pică buildul, nu producția.
 */
export const BLOCK_RENDERERS = Object.freeze({
  text: TextBlock,
  product_list: ProductListBlock,
  comparison: ComparisonBlock,
  key_value: KeyValueBlock,
  status_list: StatusListBlock,
  routine: RoutineBlock,
  notice: NoticeBlock,
  memory: MemoryBlock,
  cart_summary: CartSummaryBlock,
  action_row: ActionRowBlock,
  divider: DividerBlock,
})

export default function BlockRenderer({ block, onSubmitAction, disabled, onMetric }) {
  const Component = BLOCK_RENDERERS[block.type]
  if (Component === undefined) {
    throw new WebViewRendererInvariantError(RENDERER_INVARIANT_REASONS.UNREGISTERED_BLOCK_TYPE)
  }
  return (
    <Component
      block={block}
      onSubmitAction={onSubmitAction}
      disabled={disabled}
      onMetric={onMetric}
    />
  )
}
