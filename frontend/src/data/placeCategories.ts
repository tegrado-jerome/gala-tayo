const placeCategories = [
  { value: 'activity', label: 'Activity' },
  { value: 'cafe', label: 'Cafe' },
  { value: 'cinema', label: 'Cinema' },
  { value: 'food', label: 'Food' },
  { value: 'heritage', label: 'Heritage' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'mall', label: 'Mall' },
  { value: 'museum', label: 'Museum' },
  { value: 'nightlife', label: 'Nightlife' },
  { value: 'park', label: 'Park' },
] as const

function getPlaceCategoryLabel(categoryValue: string) {
  return placeCategories.find((category) => category.value === categoryValue)?.label ?? categoryValue
}

export { getPlaceCategoryLabel, placeCategories }
