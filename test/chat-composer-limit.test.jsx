// Plafonul de lungime al mesajului scris de utilizator, la nivel de MODUL.
//
// Suita dinainte îl verifica prin widgetul v2, care nu mai există. Regula pe care o apără nu
// dispare odată cu el — `ChatWidgetV1` folosește exact aceleași funcții — deci testul se mută pe
// modulul pur, unde oricum trăia adevărul:
//
//   • Plafonul se măsoară în CODURI PUNCT. Cu `String.prototype.length` (unități UTF-16) un mesaj
//     cu emoji ar fi respins la jumătatea cifrei pe care i-o promite omului chiar contorul de
//     deasupra butonului — adică minciuna ar fi scrisă în UI, nu ascunsă în cod.
//   • Textul NU se trunchiază: verificarea spune DACĂ se depășește, nu taie. `maxLength` pe input
//     ar fi tăiat paste-ul tăcut, iar omul ar fi trimis jumătate de întrebare fără să afle.

import { describe, expect, it } from 'vitest'
import {
  COMPOSER_COUNTER_VISIBLE_AT,
  COMPOSER_MAX_LENGTH,
  exceedsComposerLimit,
  messageLength,
} from '@/chat/composerLimits'

describe('lungimea se măsoară în coduri punct', () => {
  it('un emoji e UN caracter, nu două', () => {
    expect(messageLength('😀')).toBe(1)
    expect('😀'.length).toBe(2) // exact capcana pe care o evită
  })

  it('perechile surogat nu consumă dublu din plafon', () => {
    const emojis = '😀'.repeat(COMPOSER_MAX_LENGTH)
    expect(messageLength(emojis)).toBe(COMPOSER_MAX_LENGTH)
    expect(exceedsComposerLimit(emojis)).toBe(false)
  })

  it('diacriticele românești rămân un caracter', () => {
    expect(messageLength('șamponul pentru păr creț')).toBe(24)
  })
})

describe('poarta e la plafon, nu înainte și nu după', () => {
  it('exact la plafon încă trece', () => {
    expect(exceedsComposerLimit('a'.repeat(COMPOSER_MAX_LENGTH))).toBe(false)
  })

  it('un caracter peste plafon se blochează', () => {
    expect(exceedsComposerLimit('a'.repeat(COMPOSER_MAX_LENGTH + 1))).toBe(true)
  })

  it('textul gol nu depășește nimic', () => {
    expect(exceedsComposerLimit('')).toBe(false)
    expect(messageLength('')).toBe(0)
  })
})

describe('pragul contorului', () => {
  it('e sub plafon, ca avertismentul să apară înainte de blocaj', () => {
    expect(COMPOSER_COUNTER_VISIBLE_AT).toBeLessThan(COMPOSER_MAX_LENGTH)
    expect(COMPOSER_COUNTER_VISIBLE_AT).toBeGreaterThan(0)
  })
})
