// "Sulit" = good value. Levels follow typical Metro Manila per-person spend for a gala stop.
const SULIT_LEVELS = [
  { max: 0, label: 'Free' },
  { max: 250, label: 'Great value' },
  { max: 600, label: 'Good value' },
  { max: 1200, label: 'Fair' },
  { max: 2500, label: 'Pricey' },
  { max: Number.POSITIVE_INFINITY, label: 'Splurge' },
]

export function getSulitLevel(pesos: number) {
  const index = SULIT_LEVELS.findIndex((level) => pesos <= level.max)
  return { index, label: SULIT_LEVELS[index].label }
}
