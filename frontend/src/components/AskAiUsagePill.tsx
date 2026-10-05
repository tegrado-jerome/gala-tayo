import type { AskAiUsageStatus } from '../utils/askAiUsage'
import { cx } from './ui'

type AskAiUsagePillProps = {
  usageStatus: Pick<AskAiUsageStatus, 'limit' | 'remaining'> | null
  className?: string
}

/** Quiet "3 of 5 left today" counter shown next to AI composers. */
export default function AskAiUsagePill({ usageStatus, className }: AskAiUsagePillProps) {
  const text = usageStatus
    ? `${Math.max(usageStatus.remaining, 0)} of ${usageStatus.limit} left today`
    : 'Checking limit…'

  return (
    <span className={cx('g-xs g-fnt whitespace-nowrap', className)} aria-live="polite">
      {text}
    </span>
  )
}
