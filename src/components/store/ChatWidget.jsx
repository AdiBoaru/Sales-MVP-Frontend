// Punctul de montare al widgetului. UN singur widget: protocolul v2 de vedere (envelope de
// blocuri) a fost ȘTERS din produs, deci nu mai există nimic de selectat la build.
//
// `openAria` se re-exportă de aici pentru apelanții existenți (antetul vitrinei), dar vine dintr-un
// modul NEUTRU, nu din widget: un import de convenience care ar trage tot arborele widgetului în
// fiecare pagină care vrea doar să-l deschidă e exact felul în care un bundle crește pe nesimțite.

import ChatWidgetV1 from '@/components/store/ChatWidgetV1'

export { openAria } from '@/components/store/ariaOpenEvent'

export default function ChatWidget() {
  return <ChatWidgetV1 />
}
