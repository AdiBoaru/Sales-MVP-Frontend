// NX-243 — randorul PASIV al unui `web-view.v2`. Minimal deliberat: forma vizuală completă
// (registry de componente, paritate cu designul) e a lui NX-244. Ce contează aici e că nu există
// nicio decizie de conținut în browser.
//
// Regulile pe care le respectă fiecare linie de mai jos:
//   • tot ce se afișează e string DEJA localizat de server — nu se parsează prețuri, nu se
//     calculează reduceri, nu se deduce tonul unui badge dintr-un cuvânt românesc;
//   • uniunea de blocuri e FINITĂ și acoperită integral. Un renderer care sare peste ce nu
//     înțelege afișează un răspuns pe jumătate și îl numește succes — de aceea `default` nu
//     există ca „ignoră", ci ca ramură imposibilă (decoderul NX-242 respinge tipurile străine);
//   • un buton `submit` retrimite tokenul opac NESCHIMBAT; eticheta nu devine niciodată mesaj.

import React from 'react'
import { ExternalLink } from 'lucide-react'

function Action({ action, onAction, disabled }) {
  const { activation, label, appearance = 'secondary', enabled = true } = action
  const base =
    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-40'
  const tone =
    appearance === 'primary'
      ? 'aria-gradient-bg text-white'
      : appearance === 'danger'
        ? 'text-red-700 bg-red-50 border border-red-200'
        : appearance === 'link'
          ? 'text-[var(--aria-purple)] underline'
          : 'text-[var(--aria-text-2)] bg-white border border-[var(--aria-border)] hover:border-[var(--aria-purple)]'

  if (activation.type === 'navigate') {
    return (
      <a
        href={activation.href}
        target={activation.target || '_self'}
        rel={activation.target === '_blank' ? 'noopener noreferrer' : undefined}
        className={`${base} ${tone}`}
      >
        {label}
        {activation.target === '_blank' ? <ExternalLink className="w-3 h-3" /> : null}
      </a>
    )
  }
  return (
    <button
      type="button"
      disabled={disabled || enabled === false}
      onClick={() => onAction?.(activation.token)}
      className={`${base} ${tone}`}
    >
      {label}
    </button>
  )
}

function ActionList({ actions, onAction, disabled }) {
  if (!actions || actions.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {actions.map((action) => (
        <Action key={action.id} action={action} onAction={onAction} disabled={disabled} />
      ))}
    </div>
  )
}

const TEXT_VARIANTS = {
  lead: 'text-[15px] leading-relaxed text-[var(--aria-text)]',
  body: 'text-[13.5px] leading-relaxed text-[var(--aria-text-2)]',
  caption: 'text-[12px] text-[var(--aria-text-4)]',
  disclosure: 'text-[11px] text-[var(--aria-text-5)]',
}

const NOTICE_LEVELS = {
  info: 'bg-[var(--aria-surface-2)] border-[var(--aria-border)] text-[var(--aria-text-2)]',
  success: 'bg-green-50 border-green-200 text-green-900',
  warning: 'bg-amber-50 border-amber-200 text-amber-900',
  error: 'bg-red-50 border-red-200 text-red-900',
}

const TONE_DOTS = {
  neutral: 'bg-[var(--aria-text-5)]',
  info: 'bg-sky-500',
  success: 'bg-green-600',
  warning: 'bg-amber-500',
  danger: 'bg-red-600',
}

function ProductItem({ item, onAction, disabled }) {
  return (
    <div className="flex gap-3 bg-white border border-[var(--aria-border)] rounded-xl p-2.5 shadow-sm">
      {item.image ? (
        <div className="w-16 h-16 rounded-lg bg-[var(--aria-surface-2)] overflow-hidden shrink-0">
          <img src={item.image.src} alt={item.image.alt} className="w-full h-full object-cover" />
        </div>
      ) : null}
      <div className="flex-1 min-w-0">
        {item.subtitle ? (
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--aria-text-4)]">{item.subtitle}</p>
        ) : null}
        <p className="text-[13px] font-semibold leading-snug text-[var(--aria-text)]">{item.title}</p>
        {item.badges?.length ? (
          <div className="flex flex-wrap gap-1 mt-1">
            {item.badges.map((badge, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-[var(--aria-surface-2)] border border-[var(--aria-border-2)]"
              >
                <span className={`w-1 h-1 rounded-full ${TONE_DOTS[badge.tone || 'neutral']}`} />
                {badge.label}
              </span>
            ))}
          </div>
        ) : null}
        {/* Prețul vine formatat de server: "89,00 lei". Zero aritmetică în browser. */}
        {item.price ? (
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-[13px] font-bold text-[var(--aria-text)]">{item.price.current}</span>
            {item.price.previous ? (
              <span className="text-[11px] line-through text-[var(--aria-text-5)]">{item.price.previous}</span>
            ) : null}
            {item.price.discount ? (
              <span className="text-[11px] font-semibold text-red-600">{item.price.discount}</span>
            ) : null}
          </p>
        ) : null}
        {item.rating ? <p className="text-[11px] text-[var(--aria-text-4)] mt-0.5">{item.rating}</p> : null}
        {item.availability ? (
          <p className="text-[11px] text-[var(--aria-text-4)]">{item.availability}</p>
        ) : null}
        {item.reason ? (
          <p className="text-[12px] leading-snug text-[var(--aria-text-3)] mt-1">{item.reason}</p>
        ) : null}
        <ActionList actions={item.actions} onAction={onAction} disabled={disabled} />
      </div>
    </div>
  )
}

function Block({ block, onAction, disabled }) {
  switch (block.type) {
    case 'text':
      return <p className={TEXT_VARIANTS[block.variant || 'body']}>{block.text}</p>

    case 'notice':
      return (
        <div className={`rounded-xl border px-3 py-2.5 ${NOTICE_LEVELS[block.level]}`}>
          {block.title ? <p className="text-[13px] font-semibold">{block.title}</p> : null}
          <p className="text-[12.5px] leading-relaxed">{block.text}</p>
          <ActionList actions={block.actions} onAction={onAction} disabled={disabled} />
        </div>
      )

    case 'product_list':
      return (
        <div className="flex flex-col gap-2">
          {block.items.map((item) => (
            <ProductItem key={item.view_id} item={item} onAction={onAction} disabled={disabled} />
          ))}
        </div>
      )

    case 'comparison':
      return (
        <div className="overflow-x-auto rounded-xl border border-[var(--aria-border)] bg-white">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[var(--aria-border-2)]">
                <th className="text-left px-2.5 py-2 font-medium text-[var(--aria-text-4)]" />
                {block.headers.map((header, i) => (
                  <th key={i} className="text-left px-2.5 py-2 font-semibold text-[var(--aria-text)]">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-b border-[var(--aria-border-2)] last:border-0">
                  <td className="px-2.5 py-2 text-[var(--aria-text-4)]">{row.label}</td>
                  {row.cells.map((cell, j) => (
                    <td key={j} className="px-2.5 py-2 text-[var(--aria-text-2)]">
                      {cell.text ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )

    case 'key_value':
      return (
        <div className="rounded-xl border border-[var(--aria-border)] bg-white px-3 py-2.5">
          {block.title ? (
            <p className="text-[12px] font-semibold text-[var(--aria-text)] mb-1">{block.title}</p>
          ) : null}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
            {block.rows.map((row, i) => (
              <React.Fragment key={i}>
                <dt className="text-[var(--aria-text-4)]">{row.label}</dt>
                <dd className="text-[var(--aria-text-2)]">{row.value}</dd>
              </React.Fragment>
            ))}
          </dl>
        </div>
      )

    case 'status_list':
      return (
        <div className="flex flex-col gap-1.5">
          {block.items.map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-[12px]">
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${TONE_DOTS[item.tone || 'neutral']}`} />
              <span className="text-[var(--aria-text-2)]">
                <span className="font-medium">{item.label}</span>
                {item.detail ? <span className="text-[var(--aria-text-4)]"> {item.detail}</span> : null}
                {item.freshness ? (
                  <span className="text-[var(--aria-text-5)]"> · {item.freshness}</span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      )

    case 'memory':
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {block.title ? (
            <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--aria-text-3)]">
              {block.title}
            </span>
          ) : null}
          {block.criteria.map((criterion, i) => (
            <span
              key={i}
              className="px-2.5 py-1 bg-[rgba(47,102,76,0.07)] border border-[rgba(47,102,76,0.22)] rounded-full text-[11px] text-[var(--aria-purple)]"
            >
              {criterion}
            </span>
          ))}
        </div>
      )

    case 'routine':
      return (
        <div className="rounded-xl border border-[var(--aria-border)] bg-white px-3 py-2.5">
          {block.title ? (
            <p className="text-[12px] font-semibold text-[var(--aria-text)] mb-1.5">{block.title}</p>
          ) : null}
          <ol className="flex flex-col gap-1.5">
            {block.steps.map((step, i) => (
              <li key={i} className="flex gap-2 text-[12px]">
                <span className="w-4 h-4 rounded-full bg-[var(--aria-surface-2)] text-[10px] font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span>
                  <span className="font-medium text-[var(--aria-text)]">{step.title}</span>
                  {step.detail ? (
                    <span className="block text-[var(--aria-text-4)]">{step.detail}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )

    case 'cart_summary':
      return (
        <div className="rounded-xl border border-[var(--aria-border)] bg-white px-3 py-2.5">
          {block.title ? (
            <p className="text-[12px] font-semibold text-[var(--aria-text)] mb-1.5">{block.title}</p>
          ) : null}
          <ul className="flex flex-col gap-1 text-[12px]">
            {(block.lines || []).map((line) => (
              <li key={line.view_id} className="flex justify-between gap-3">
                <span className="text-[var(--aria-text-2)] truncate">
                  {line.quantity}× {line.title}
                </span>
                {line.price ? (
                  <span className="text-[var(--aria-text)] font-medium shrink-0">{line.price.current}</span>
                ) : null}
              </li>
            ))}
          </ul>
          {block.total ? (
            <div className="flex justify-between mt-2 pt-2 border-t border-[var(--aria-border-2)] text-[12.5px]">
              <span className="text-[var(--aria-text-4)]">Total</span>
              <span className="font-bold text-[var(--aria-text)]">{block.total.current}</span>
            </div>
          ) : null}
          <ActionList actions={block.actions} onAction={onAction} disabled={disabled} />
        </div>
      )

    case 'action_row':
      return <ActionList actions={block.actions} onAction={onAction} disabled={disabled} />

    case 'divider':
      return <hr className="border-[var(--aria-border-2)]" />

    default:
      // Imposibil prin construcție: `decodeWebViewV2` respinge orice `type` din afara uniunii
      // finite, deci un payload cu bloc necunoscut nu ajunge niciodată aici.
      return null
  }
}

/** Un mesaj server (`role` + blocuri). Rolul vine de la server; nu inventăm bule locale. */
export function ChatV2Message({ message, onAction, disabled }) {
  const mine = message.role === 'user'
  return (
    <div className={mine ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={
          mine
            ? 'max-w-[85%] rounded-2xl rounded-br-md aria-gradient-bg text-white px-3.5 py-2.5 text-[13px]'
            : 'w-full flex flex-col gap-2.5'
        }
      >
        {message.blocks.map((block) => (
          <Block key={block.id} block={block} onAction={onAction} disabled={disabled} />
        ))}
      </div>
    </div>
  )
}

/** Toate mesajele unui view. */
export default function ChatV2View({ view, onAction, disabled }) {
  if (!view?.messages?.length) return null
  return (
    <>
      {view.messages.map((message) => (
        <ChatV2Message key={message.id} message={message} onAction={onAction} disabled={disabled} />
      ))}
    </>
  )
}
