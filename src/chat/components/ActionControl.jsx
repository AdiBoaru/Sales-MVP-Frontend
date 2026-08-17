// NX-244 — singurul loc din care pleacă o acțiune.
//
// Contractul, în două rânduri:
//   • `submit`  → `onSubmitAction(activation.token)`, tokenul NESCHIMBAT, byte cu byte;
//   • `navigate`→ `activation.href`, exact, prin poarta de URL.
//
// Ce NU face, deși v1 făcea toate: nu citește `offer.kind` ca să decidă unde duce butonul, nu
// construiește `Spune-mi mai multe despre ${product.name}` ca să-l trimită ca mesaj, nu cheamă
// `addToCart()`, nu trimite eticheta în locul tokenului. Eticheta e pentru ochi, tokenul e pentru
// mașină — dacă schimbi eticheta și tokenul rămâne, requestul trebuie să fie identic.
//
// Tokenul nu e decodat, tăiat, concatenat, logat sau pus într-un atribut DOM. Singurul lui drum
// e argumentul handlerului.

import { APPEARANCE_CLASS, ICON_COMPONENT, SCHEMA_DEFAULTS, resolveToken } from './blockTokens.js'
import { RENDERER_INVARIANT_REASONS, WebViewRendererInvariantError } from './rendererErrors.js'
import SafeNavigationLink from './SafeNavigationLink.jsx'

const BASE_CLASS =
  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors'
const INACTIVE_CLASS = 'opacity-40 pointer-events-none'

function ActionIcon({ icon }) {
  if (icon === undefined || icon === null) return null
  const Icon = resolveToken(ICON_COMPONENT, icon, 'icon')
  return <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
}

/**
 * @param {{action: object, onSubmitAction?: (token: string) => void, disabled?: boolean,
 *   onMetric?: (name: string, labels: object) => void}} props
 */
export default function ActionControl({ action, onSubmitAction, disabled = false, onMetric }) {
  const { activation, label, id } = action
  // Defaults DECLARATE ÎN SCHEMĂ (`appearance: "secondary"`, `enabled: true`) — contractul spune
  // ce înseamnă absența câmpului; nu inventăm noi o preferință.
  const appearance = action.appearance ?? SCHEMA_DEFAULTS.appearance
  const enabled = action.enabled ?? SCHEMA_DEFAULTS.enabled
  const className = `${BASE_CLASS} ${resolveToken(APPEARANCE_CLASS, appearance, 'appearance')}`

  if (activation.type === 'navigate') {
    // `enabled: false` pe o navigare trebuie să producă un control INERT, nu o ancoră stilată ca
    // inactivă: un `<a href>` rămâne focusabil și se activează cu Enter chiar și cu
    // `pointer-events-none`, adică butonul „dezactivat" ar naviga oricum de la tastatură.
    if (enabled === false || disabled) {
      return (
        <span className={`${className} ${INACTIVE_CLASS}`} aria-disabled="true">
          <ActionIcon icon={action.icon} />
          {label}
        </span>
      )
    }
    return (
      <SafeNavigationLink
        href={activation.href}
        target={activation.target ?? SCHEMA_DEFAULTS.target}
        className={className}
        onBlocked={(reason) => onMetric?.('web_navigation_blocked_total', { reason })}
      >
        <ActionIcon icon={action.icon} />
        {label}
      </SafeNavigationLink>
    )
  }

  if (activation.type === 'submit') {
    return (
      <button
        type="button"
        data-action-id={id}
        disabled={disabled || enabled === false}
        onClick={() => {
          onMetric?.('web_action_activate_total', { activation_type: 'submit', appearance })
          // Tokenul, ATÂT. Fără label, fără id, fără text construit din el.
          onSubmitAction?.(activation.token)
        }}
        className={`${className} disabled:opacity-40`}
      >
        <ActionIcon icon={action.icon} />
        {label}
      </button>
    )
  }

  // Imposibil prin decoder (uniunea de activări e finită și discriminată). Dacă totuși ajunge
  // aici, e drift de build: o activare nouă în schemă fără componentă. Stare tehnică, nu buton mut.
  throw new WebViewRendererInvariantError(RENDERER_INVARIANT_REASONS.UNKNOWN_ACTIVATION_TYPE, {
    token: 'activation',
  })
}

/** Un rând de acțiuni, în ordinea din payload. Lipsa lor nu randează container gol. */
export function ActionList({ actions, onSubmitAction, disabled, onMetric, className = 'mt-2' }) {
  if (!Array.isArray(actions) || actions.length === 0) return null
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {actions.map((action) => (
        <ActionControl
          key={action.id}
          action={action}
          onSubmitAction={onSubmitAction}
          disabled={disabled}
          onMetric={onMetric}
        />
      ))}
    </div>
  )
}
