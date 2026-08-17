// NX-245 — SINGURA regiune live care anunță starea turului.
//
// „Singura" e cerința, nu o preferință de stil. Două regiuni live care poartă același text produc
// două anunțuri pentru un singur eveniment; utilizatorul de screen reader aude „Pregătesc
// răspunsul. Pregătesc răspunsul." și nu are cum să știe dacă s-a întâmplat ceva de două ori.
// De aceea rândul de progres VIZIBIL (`ChatProgress`) e `aria-hidden` și oglindește doar pentru
// ochi ce se anunță de aici.
//
// Textul e INTEGRAL server-owned: `a11y.announcements[status]`, câte unul pentru fiecare status de
// sârmă (NX-228 le-a făcut obligatorii tocmai pentru asta). Frontendul nu are „Analizez…",
// „Caut…", „Am găsit!" și nici traduceri de rezervă — fără copy de la server, tace, fiindcă un
// anunț inventat în română pe un tenant maghiar e mai rău decât tăcerea.
//
// „O singură dată" se impune pe cheia (tur, status): un re-render, o reconectare SSE sau un poll
// care repetă același status nu re-anunță nimic.

import { useEffect, useRef } from 'react'

/** Vocabular ÎNCHIS pentru `web_widget_a11y_announcement_total`. Fără ID-uri, fără text. */
export const ANNOUNCEMENT_KINDS = Object.freeze({
  PROGRESS: 'progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
})

/**
 * Statusul care trebuie anunțat ACUM: progresul raportat de server dacă turul e în curs, altfel
 * statusul terminal al ultimului view. `cancelled` intră la `failed` fiindcă eticheta metricii e
 * închisă și ambele înseamnă „nu s-a livrat un răspuns" — distincția fină rămâne în TEXT, care e
 * al serverului.
 */
function kindOf(status) {
  if (status === 'completed') return ANNOUNCEMENT_KINDS.COMPLETED
  if (status === 'failed' || status === 'cancelled') return ANNOUNCEMENT_KINDS.FAILED
  return ANNOUNCEMENT_KINDS.PROGRESS
}

/**
 * Pur: aceleași intrări ⇒ același rezultat, fără ceas și fără I/O.
 * @returns {{key: string, status: string, text: string, kind: string}|null}
 */
export function resolveAnnouncement({ progressStatus, view, announcements }) {
  if (announcements === null || announcements === undefined) return null
  const status = progressStatus ?? view?.turn?.status ?? null
  if (status === null) return null
  const text = announcements[status]
  if (typeof text !== 'string' || text.length === 0) return null
  return { key: `${view?.turn?.id ?? 'pending'}:${status}`, status, text, kind: kindOf(status) }
}

/**
 * @param {{progressStatus: string|null, view: object|null, announcements: object|null,
 *   onMetric?: (name: string, labels: object) => void}} props
 */
export default function ChatLiveRegion({ progressStatus, view, announcements, onMetric }) {
  const announcement = resolveAnnouncement({ progressStatus, view, announcements })
  const key = announcement === null ? null : announcement.key
  // `undefined` = încă n-am văzut niciun status. Prima valoare se ÎNREGISTREAZĂ fără să fie
  // anunțată: la remount (refresh, navigare înapoi) ultimul view e un terminal vechi, iar
  // „Răspunsul este gata" strigat pentru un tur încheiat acum zece minute e o minciună despre
  // prezent. Se anunță tranzițiile, nu starea găsită la sosire.
  const seenRef = useRef(undefined)
  const onMetricRef = useRef(onMetric)
  onMetricRef.current = onMetric

  useEffect(() => {
    if (seenRef.current === key) return
    const wasFirst = seenRef.current === undefined
    seenRef.current = key
    if (wasFirst || key === null || announcement === null) return
    onMetricRef.current?.('web_widget_a11y_announcement_total', { kind: announcement.kind })
    // `announcement` e derivat sincron din `key`; dependența pe cheie e cea corectă.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Fără copy de la server nu există regiune, nu una goală: două elemente cu `role="status"` în
  // aceeași pagină înseamnă doi proprietari ai anunțurilor, iar ăsta e chiar defectul pe care
  // fișierul îl previne. Când lipsește, rândul de progres preia rolul (`ChatProgress`).
  //
  // Când copy-ul EXISTĂ, regiunea rămâne montată chiar și goală: o regiune live creată în aceeași
  // clipă cu textul ei nu e anunțată de o parte din cititoarele de ecran, care se abonează la
  // regiunile prezente. Anunțurile vin din bootstrap, deci e montată dinaintea primului tur.
  if (announcements === null || announcements === undefined) return null

  return (
    <div
      // `status` + `polite`: anunțul nu întrerupe ce citește userul. `alert`/`assertive` ar tăia
      // peste el la fiecare tick de progres — zgomot, nu accesibilitate.
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="nx-visually-hidden"
    >
      {/* `key` forțează un nod NOU la fiecare schimbare de (tur, status). Contează pentru cazul în
          care două tururi la rând se termină cu ACELAȘI text („Răspunsul este gata."): fără
          înlocuirea nodului, conținutul regiunii ar rămâne identic, iar screen readerul — care
          reacționează la mutații, nu la intenții — n-ar anunța al doilea răspuns deloc.
          Invers, un re-render care nu schimbă cheia nu atinge DOM-ul, deci nu re-anunță nimic. */}
      {announcement === null ? null : <span key={key}>{announcement.text}</span>}
    </div>
  )
}
