// Plafonul de lungime al mesajului scris de utilizator.
//
// De ce există: până acum composerul nu avea niciunul. Un paste accidental de 40.000 de caractere
// pleca spre model exact ca o întrebare reală — și pleacă la FIECARE tur, fiindcă istoricul se
// retrimite. Toți jucătorii cu chat la scară au un plafon aici: Zendesk Web Widget 4.096,
// WhatsApp Business API 4.096, Salesforce Chat 6.000, Microsoft Copilot 2.000–4.000. Singurul
// fără plafon e Intercom — și e chat UMAN, unde clientul chiar lipește un log de eroare.
//
// De ce 2.000: aliniere cu Copilot, adică marginea de jos a consensului. O întrebare reală despre
// produse („am pielea grasă, 30 de ani, caut o rutină de seară sub 300 de lei") are 100–200 de
// caractere. 2.000 e de zece ori peste cazul real: cine îl atinge a lipit ceva, nu a scris.
//
// CUM se aplică — decizia care contează mai mult decât cifra: NU cu `maxLength` pe input.
// Atributul HTML taie paste-ul TĂCUT — lipești 3.000, intră 2.000, pleacă jumătate de întrebare
// și nimeni nu-ți spune. E exact clasa de bug pe care a scos-o NX-245 din composer (`readOnly` +
// `return` tăcut): un control care nu poate fi folosit trebuie să ARATE și să RAPORTEZE asta.
// Aici: textul intră integral, contorul apare din vreme, butonul se închide peste plafon.
//
// De dus la backend: plafonul ar trebui să vină din `ComposerView` ca `max_length`, lângă
// `enabled` — restul politicii de composer e deja server-owned. Schema v2 are
// `additionalProperties: false`, deci până la o versiune nouă de contract rămâne aici, ca o
// singură constantă, nu ca o cifră presărată prin componente.

export const COMPOSER_MAX_LENGTH = 2000

/**
 * Pragul de la care contorul devine vizibil — 80% din plafon. Sub el pilula rămâne curată: un
 * contor permanent pe un câmp în care 99% dintre mesaje au 150 de caractere e zgomot, nu ajutor.
 */
export const COMPOSER_COUNTER_VISIBLE_AT = Math.floor(COMPOSER_MAX_LENGTH * 0.8)

/**
 * Lungimea în CODURI PUNCT, nu în unități UTF-16.
 *
 * `String.prototype.length` numără unități UTF-16, deci dă 2 pentru un emoji. Cu el, un mesaj cu
 * emoji ar fi respins la jumătatea plafonului pe care tocmai i l-am promis omului în contor.
 * Contractul v2 numără deja tot așa (helperul `ucs2length` din validatorul generat, plus testul
 * cu 2000 de emoji din `chat-contract-v2.test.js`) — plafonul de aici folosește aceeași unitate,
 * ca „2.000" să însemne același lucru pe ambele maluri.
 *
 * Iterativ, fără `[...text]`: pe un paste de jumătate de megabait, spread-ul ar aloca un array de
 * jumătate de milion de elemente la fiecare tastă apăsată.
 */
export function messageLength(text) {
  if (typeof text !== 'string') return 0
  let count = 0
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    // Surogat înalt urmat de unul jos = o singură pereche, deci un singur cod punct. Un surogat
    // orfan (text tăiat greșit undeva în amonte) se numără ca unul singur, nu aruncă.
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) i += 1
    }
    count += 1
  }
  return count
}

/** Singura formulă de „prea lung". Composerul o afișează, controllerul o reaplică. */
export function exceedsComposerLimit(text) {
  return messageLength(text) > COMPOSER_MAX_LENGTH
}
