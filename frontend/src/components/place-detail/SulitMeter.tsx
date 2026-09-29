// "Sulit" = good value. Levels follow typical Metro Manila per-person spend for a gala stop.
const LEVELS = [
  { max: 0, label: 'Libre!' },
  { max: 250, label: 'Super sulit' },
  { max: 600, label: 'Sulit' },
  { max: 1200, label: 'Sakto lang' },
  { max: 2500, label: 'Medyo pricey' },
  { max: Number.POSITIVE_INFINITY, label: 'Splurge' },
]

export function getSulitLevel(pesos: number) {
  const index = LEVELS.findIndex((level) => pesos <= level.max)
  return { index, label: LEVELS[index].label }
}

function SulitMeter({ pesos, compact = false }: { pesos: number | null | undefined; compact?: boolean }) {
  if (pesos == null || !Number.isFinite(Number(pesos))) return null

  const amount = Math.max(0, Math.round(Number(pesos)))
  const { index, label } = getSulitLevel(amount)
  // Libre (index 0) fills nothing; each level after that adds one ₱ out of five.
  const filled = index

  return (
    <div
      className={`inline-flex items-center gap-2.5 rounded-full border border-[var(--line)] bg-[var(--card)] ${compact ? 'px-2.5 py-1' : 'px-3 py-1.5'}`}
      role="img"
      aria-label={`Sulit Meter: ${label}, about ₱${amount.toLocaleString('en-PH')} per person`}
    >
      <span className="font-data text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">Sulit</span>
      <span className="flex items-center gap-0.5" aria-hidden="true">
        {Array.from({ length: 5 }, (_, position) => (
          <span
            key={position}
            className={`font-data flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold ${
              position < filled ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg-soft)] text-[var(--text-disabled)]'
            }`}
          >
            ₱
          </span>
        ))}
      </span>
      <span className="text-[12px] font-semibold text-[var(--text-main)]">{label}</span>
      {!compact ? (
        <span className="font-data text-[12px] text-[var(--text-muted)]">
          {amount === 0 ? 'free entry' : `~₱${amount.toLocaleString('en-PH')}/tao`}
        </span>
      ) : null}
    </div>
  )
}

export default SulitMeter
