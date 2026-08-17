// NX-244 — un rând de acțiuni de sine stătător (sugestii, chips de urmărire, retry).
//
// Chips-urile de aici erau, în v1, etichete retrimise ca text: `onSuggestion(label)`. Semantica
// se recupera ghicind din cuvinte, iar `Chip.payload` se pierdea pe drum. Acum fiecare chip poartă
// un token opac (NX-236) și tocmai de aceea o schimbare de etichetă nu schimbă ce face butonul.

import { ActionList } from '../ActionControl.jsx'

export default function ActionRowBlock({ block, onSubmitAction, disabled, onMetric }) {
  return (
    <ActionList
      actions={block.actions}
      onSubmitAction={onSubmitAction}
      disabled={disabled}
      onMetric={onMetric}
      className="mt-0"
    />
  )
}
