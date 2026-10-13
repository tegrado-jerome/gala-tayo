import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { AirplaneLanding } from '@phosphor-icons/react/dist/csr/AirplaneLanding'
import { CalendarCheck } from '@phosphor-icons/react/dist/csr/CalendarCheck'
import { Money } from '@phosphor-icons/react/dist/csr/Money'
import { ShieldCheck } from '@phosphor-icons/react/dist/csr/ShieldCheck'
import { Ticket } from '@phosphor-icons/react/dist/csr/Ticket'
import { TShirt } from '@phosphor-icons/react/dist/csr/TShirt'
import type { ForeignCurrency } from '../../data/fxRates'
import { foreignRateNote, uniqueSourceHosts, withForeignPrice, type TravelInfo } from '../../utils/travelInfo'

type Line = { label?: string; text: string | undefined; warn?: boolean }
type Row = { key: string; icon: PhosphorIcon; title: string; lines: Line[] }

/** "2026-10" -> "Oct 2026". */
function formatChecked(checked: string | undefined) {
  const match = checked?.match(/^(\d{4})-(\d{2})$/)
  if (!match) return null
  return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)))
}

/** Getting there, money, fees, seasons, safety and dress code for visitors. Only sourced facts; empty lines are hidden. */
export default function TravelEssentials({ info, currency }: { info: TravelInfo; currency: ForeignCurrency | null }) {
  const price = (text: string | undefined) => (text ? withForeignPrice(text, currency) : text)
  const rows: Row[] = [
    {
      key: 'getting-there',
      icon: AirplaneLanding,
      title: 'Getting there',
      lines: [
        { label: 'Arrive at', text: info.getting_there?.hub },
        { label: 'Route', text: info.getting_there?.route },
        { label: 'Travel time', text: info.getting_there?.time },
        { text: info.getting_there?.notes },
      ],
    },
    { key: 'money', icon: Money, title: 'Cash and cards', lines: [{ text: info.money?.text }] },
    {
      key: 'fees',
      icon: Ticket,
      title: 'Fees',
      lines: [
        // "Filipinos" only reads right next to a foreigner rate; on its own the fee is for everyone.
        { label: info.fees?.foreigner ? 'Filipinos' : 'Entry', text: price(info.fees?.local) },
        { label: 'Foreigners', text: price(info.fees?.foreigner) },
        { label: 'Also pay', text: price(info.fees?.other) },
      ],
    },
    {
      key: 'seasons',
      icon: CalendarCheck,
      title: 'When to go',
      lines: [
        { label: 'Best', text: info.seasons?.best },
        { label: 'Rough weather', text: info.seasons?.avoid, warn: true },
      ],
    },
    { key: 'safety', icon: ShieldCheck, title: 'Safety', lines: [{ text: info.safety?.text }] },
    { key: 'dress', icon: TShirt, title: 'Dress code', lines: [{ text: info.dress?.text }] },
  ]
    .map((row) => ({ ...row, lines: row.lines.filter((line) => line.text) }))
    .filter((row) => row.lines.length > 0)

  if (rows.length === 0) return null

  const sources = [info.getting_there, info.money, info.fees, info.seasons, info.safety, info.dress].flatMap((section) => section?.sources ?? [])
  const uniqueSources = uniqueSourceHosts(sources)
  const checked = formatChecked(info.checked)

  return (
    <div className="pd-ti">
      <dl>
        {rows.map((row) => {
          const RowIcon = row.icon
          return (
            <div key={row.key}>
              <RowIcon weight="light" aria-hidden="true" />
              <dt>{row.title}</dt>
              {row.lines.map((line, index) => (
                <dd key={index} className={line.warn ? 'is-warn' : undefined}>
                  {line.label ? <span>{line.label}: </span> : null}
                  {line.text}
                </dd>
              ))}
            </div>
          )
        })}
      </dl>
      {uniqueSources.length > 0 ? (
        <details className="pd-ti-src">
          <summary>
            {uniqueSources.length} {uniqueSources.length === 1 ? 'source' : 'sources'}
            {checked ? `, checked ${checked}` : null}
          </summary>
          <ul>
            {uniqueSources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer nofollow">
                  {source.host}
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

const CURRENCY_CHOICES: Array<{ value: ForeignCurrency | null; label: string }> = [
  { value: null, label: 'PHP' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
]

/** Tiny PHP / USD / EUR switch; PHP always stays the main price. */
export function PriceToggle({ currency, onChange }: { currency: ForeignCurrency | null; onChange: (next: ForeignCurrency | null) => void }) {
  return (
    <div className="pd-fx">
      <div role="group" aria-label="Show approximate prices in">
        <span aria-hidden="true">Prices in</span>
        {CURRENCY_CHOICES.map((choice) => (
          <button key={choice.label} type="button" aria-pressed={currency === choice.value} onClick={() => onChange(choice.value)}>
            <span>{choice.value ? `≈ ${choice.label}` : choice.label}</span>
          </button>
        ))}
      </div>
      {currency ? <p>{foreignRateNote(currency)}</p> : null}
    </div>
  )
}
