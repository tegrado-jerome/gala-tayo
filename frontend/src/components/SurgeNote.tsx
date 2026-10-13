import { CalendarX } from '@phosphor-icons/react/dist/csr/CalendarX'
import { cx } from './ui'

/** The calm one-line holiday surge warning on plans and Pick for me ("Holy Week: ferries and rooms fill up; book early."). */
function SurgeNote({ text, className }: { text: string; className?: string }) {
  return (
    <p className={cx('g-sm flex items-start gap-2 rounded-[var(--r-2)] bg-[var(--fill)] px-3 py-2', className)}>
      <CalendarX weight="light" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn)]" />
      <span className="min-w-0">{text}</span>
    </p>
  )
}

export default SurgeNote
