// Plafonul de lungime al mesajului scris de utilizator.
//
// Ce apără fișierul, în ordinea în care lucrurile chiar se strică:
//
//   • Plafonul se măsoară în CODURI PUNCT. Cu `String.prototype.length` (unități UTF-16) un mesaj
//     cu emoji ar fi respins la jumătatea cifrei pe care i-o promite omului chiar contorul de
//     deasupra butonului — adică minciuna ar fi scrisă în UI, nu ascunsă în cod.
//   • Textul NU se trunchiază. `maxLength` ar fi fost o singură linie și ar fi tăiat paste-ul
//     TĂCUT: omul trimite jumătate de întrebare fără să afle vreodată. Se verifică explicit că un
//     paste peste plafon rămâne ÎNTREG în câmp.
//   • Blocarea se VEDE. Un buton inactiv fără nimic care să explice de ce e exact bugul scos din
//     composer în NX-245 („scrii o frază întreagă, apeși Enter, nu se întâmplă nimic"). Contorul e
//     explicația vizuală, `aria-invalid` e cea pentru cititorul de ecran — stare ARIA standard,
//     rostită în limba utilizatorului, deci fără copy inventat în frontend (NX-244).

import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import WebChatWidgetV2 from '@/chat/v2/WebChatWidgetV2'
import {
  COMPOSER_COUNTER_VISIBLE_AT,
  COMPOSER_MAX_LENGTH,
  exceedsComposerLimit,
  messageLength,
} from '@/chat/composerLimits'
import { VIEW_COPY, makeController } from './helpers/chatController.js'

function renderWidget(controller) {
  return render(<WebChatWidgetV2 controller={controller} open onOpenChange={() => {}} />)
}

function composerParts() {
  const panel = screen.getByRole('dialog')
  const input = within(panel).getByRole('textbox')
  return {
    input,
    form: input.closest('form'),
    send: within(panel).getByRole('button', { name: VIEW_COPY.composer.send_label }),
  }
}

/**
 * `fireEvent.change`, nu `userEvent.type`: 2.000 de caractere tastate unul câte unul ar transforma
 * fiecare test într-un minut de așteptare, iar ce se verifică e valoarea ajunsă în câmp — nu
 * drumul tastelor, care are deja testul lui în `chat-keyboard.test.jsx`.
 */
function typeInto(input, value) {
  fireEvent.change(input, { target: { value } })
}

const atLimit = 'a'.repeat(COMPOSER_MAX_LENGTH)
const overLimit = 'a'.repeat(COMPOSER_MAX_LENGTH + 1)

// ── Unitatea de măsură ────────────────────────────────────────────────────────────────────────
describe('plafonul se măsoară în coduri punct', () => {
  it('un emoji e UN caracter, nu două', () => {
    // 2.000 de emoji = 4.000 de unități UTF-16. Cu `String.length`, mesajul ăsta ar fi fost respins
    // deși are exact cât scrie pe contor. Aceeași convenție ca `maxLength` din contractul v2 (vezi
    // testul-geamăn din `chat-contract-v2.test.js`), ca „2.000" să însemne același lucru pe ambele
    // maluri ale conexiunii.
    expect(messageLength('😀'.repeat(1000))).toBe(1000)
    expect(exceedsComposerLimit('😀'.repeat(COMPOSER_MAX_LENGTH))).toBe(false)
    expect(exceedsComposerLimit('😀'.repeat(COMPOSER_MAX_LENGTH + 1))).toBe(true)
  })

  it('diacriticele românești se numără o dată', () => {
    // Sunt caractere precompuse, deci o unitate fiecare — dar e limba în care scriu clienții și
    // merită să pice testul dacă cineva schimbă vreodată numărătoarea pe grafeme.
    expect(messageLength('ăâîșțĂÂÎȘȚ')).toBe(10)
  })

  it('la fix pe plafon trece, cu unul peste pică', () => {
    expect(exceedsComposerLimit(atLimit)).toBe(false)
    expect(exceedsComposerLimit(overLimit)).toBe(true)
  })

  it('un surogat orfan se numără o dată și nu aruncă', () => {
    // Text tăiat greșit undeva în amonte (clipboard, extensie). Numărătoarea trebuie să fie totală:
    // o excepție aici ar pica randarea composerului la fiecare tastă, nu doar contorul.
    expect(messageLength('\ud83d')).toBe(1)
    expect(messageLength('a\udc00b')).toBe(3)
  })

  it('intrarea care nu e text valorează zero, nu aruncă', () => {
    for (const value of [null, undefined, 42, {}, []]) expect(messageLength(value)).toBe(0)
    expect(exceedsComposerLimit(null)).toBe(false)
  })
})

// ── Contorul ──────────────────────────────────────────────────────────────────────────────────
describe('contorul apare abia când are ce spune', () => {
  it('sub prag pilula rămâne curată', () => {
    renderWidget(makeController({ views: ['greeting'] }))
    const { input } = composerParts()
    typeInto(input, 'am pielea grasă, caut o rutină de seară')
    expect(screen.queryByText(new RegExp(`/${COMPOSER_MAX_LENGTH}$`))).toBeNull()
  })

  it('peste prag arată exact câte caractere au fost scrise', () => {
    renderWidget(makeController({ views: ['greeting'] }))
    const { input } = composerParts()
    const length = COMPOSER_COUNTER_VISIBLE_AT + 1
    typeInto(input, 'a'.repeat(length))
    expect(screen.getByText(`${length}/${COMPOSER_MAX_LENGTH}`)).toBeInTheDocument()
  })

  it('numără codurile punct, nu unitățile — contorul spune ce spune și guardul', () => {
    renderWidget(makeController({ views: ['greeting'] }))
    const { input, send } = composerParts()
    typeInto(input, '😀'.repeat(COMPOSER_MAX_LENGTH))
    // Contorul afișează plafonul plin, iar butonul e ÎNCĂ activ: cele două citesc aceeași formulă.
    expect(screen.getByText(`${COMPOSER_MAX_LENGTH}/${COMPOSER_MAX_LENGTH}`)).toBeInTheDocument()
    expect(send).toBeEnabled()
  })
})

// ── Blocarea ──────────────────────────────────────────────────────────────────────────────────
describe('peste plafon se blochează trimiterea, nu textul', () => {
  it('la FIX pe plafon mesajul încă pleacă', () => {
    const controller = makeController({ views: ['greeting'] })
    renderWidget(controller)
    const { input, form, send } = composerParts()
    typeInto(input, atLimit)
    expect(send).toBeEnabled()
    expect(input).toHaveAttribute('aria-invalid', 'false')
    fireEvent.submit(form)
    expect(controller.sendText).toHaveBeenCalledWith(atLimit, { source: 'composer' })
  })

  it('cu unul peste: buton inactiv, câmp marcat invalid, submit refuzat', () => {
    const controller = makeController({ views: ['greeting'] })
    renderWidget(controller)
    const { input, form, send } = composerParts()
    typeInto(input, overLimit)
    expect(send).toBeDisabled()
    // Singurul anunț pentru cititorul de ecran — și e rostit în limba LUI, nu în copy scris de noi.
    expect(input).toHaveAttribute('aria-invalid', 'true')
    // Submitul programatic e drumul care ocolește atributul `disabled` (Enter în anumite motoare,
    // `dispatchEvent` dintr-o extensie). Guardul din composer trebuie să-l prindă și pe ăsta.
    fireEvent.submit(form)
    expect(controller.sendText).not.toHaveBeenCalled()
  })

  it('textul lipit peste plafon rămâne ÎNTREG în câmp', () => {
    // Testul care justifică absența lui `maxLength`. Dacă cineva îl adaugă „ca să fie simplu",
    // aici cade: câmpul ar conține 2.000 de caractere, nu 5.000, iar restul ar fi dispărut tăcut.
    const pasted = 'x'.repeat(5000)
    renderWidget(makeController({ views: ['greeting'] }))
    const { input } = composerParts()
    typeInto(input, pasted)
    expect(input).not.toHaveAttribute('maxlength')
    expect(input.value).toBe(pasted)
    expect(input.value).toHaveLength(5000)
  })

  it('după ce omul taie surplusul, trimiterea se redeschide', () => {
    // Ieșirea din starea blocată trebuie să existe și să fie evidentă: altfel plafonul nu e o
    // limită, e o fundătură.
    const controller = makeController({ views: ['greeting'] })
    renderWidget(controller)
    const { input, form, send } = composerParts()
    typeInto(input, overLimit)
    expect(send).toBeDisabled()
    typeInto(input, atLimit)
    expect(send).toBeEnabled()
    expect(input).toHaveAttribute('aria-invalid', 'false')
    fireEvent.submit(form)
    expect(controller.sendText).toHaveBeenCalledTimes(1)
  })

  it('spațiile de la coadă nu închid butonul', () => {
    // Contorul și guardul citesc textul TRIMIS (trimmed). Dacă unul ar citi textul brut, ar exista
    // o fâșie în care butonul e inactiv din cauza unor spații pe care submitul oricum le taie —
    // adică un buton blocat fără motiv vizibil, fix ce evită composerul.
    const controller = makeController({ views: ['greeting'] })
    renderWidget(controller)
    const { input, form, send } = composerParts()
    typeInto(input, `${atLimit}   `)
    expect(send).toBeEnabled()
    fireEvent.submit(form)
    expect(controller.sendText).toHaveBeenCalledWith(atLimit, { source: 'composer' })
  })
})
