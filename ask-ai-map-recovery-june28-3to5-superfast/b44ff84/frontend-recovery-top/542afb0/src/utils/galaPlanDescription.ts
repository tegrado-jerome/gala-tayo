type GalaPlanDateMode = 'anytime' | 'na' | 'date'

const DATE_MARKER_PATTERN = /^\[gala_date:(anytime|na|\d{4}-\d{2}-\d{2})\]\n?/i

function parseGalaPlanDescription(description: string | null | undefined) {
  const rawDescription = description ?? ''
  const match = rawDescription.match(DATE_MARKER_PATTERN)
  const markerValue = match?.[1] ?? 'anytime'
  const cleanDescription = match ? rawDescription.replace(DATE_MARKER_PATTERN, '').trimStart() : rawDescription

  return {
    dateMode: markerValue === 'anytime' || markerValue === 'na' ? markerValue as GalaPlanDateMode : 'date' as GalaPlanDateMode,
    date: markerValue === 'anytime' || markerValue === 'na' ? '' : markerValue,
    description: cleanDescription,
  }
}

function composeGalaPlanDescription({
  description,
  dateMode,
  date,
}: {
  description: string
  dateMode: GalaPlanDateMode
  date: string
}) {
  const markerValue = dateMode === 'date' && date ? date : dateMode
  const cleanDescription = description.trim()
  return `[gala_date:${markerValue}]${cleanDescription ? `\n${cleanDescription}` : ''}`
}

function formatGalaPlanDate(description: string | null | undefined) {
  const parsed = parseGalaPlanDescription(description)

  if (parsed.dateMode === 'na') {
    return 'N/A'
  }

  if (parsed.dateMode === 'anytime' || !parsed.date) {
    return 'Anytime'
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${parsed.date}T00:00:00`))
}

export { composeGalaPlanDescription, formatGalaPlanDate, parseGalaPlanDescription }
export type { GalaPlanDateMode }
