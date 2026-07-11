import type { AskAiUsageStatus } from '../utils/askAiUsage'

type AskAiUsagePillProps = {
  label: string
  usageStatus: AskAiUsageStatus | null
  className?: string
}

export default function AskAiUsagePill({
  label,
  usageStatus,
  className = '',
}: AskAiUsagePillProps) {
  const usageText = usageStatus
    ? `${Math.max(usageStatus.used, 0)}/${usageStatus.limit}`
    : '--/--'

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/92 px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-[0_6px_18px_-12px_rgba(15,23,42,0.28)] backdrop-blur ${className}`}
    >
      <span className="uppercase tracking-[0.14em] text-slate-400">{label}</span>
      <span className="text-slate-900">{usageText}</span>
    </div>
  )
}
