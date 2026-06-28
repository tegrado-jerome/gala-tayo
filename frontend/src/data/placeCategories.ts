const placeCategories = [
  { value: 'activity', label: 'Activity' },
  { value: 'cafe', label: 'Cafe' },
  { value: 'cinema', label: 'Cinema' },
  { value: 'heritage', label: 'Heritage' },
  { value: 'kainan', label: 'Kainan' },
  { value: 'mall', label: 'Mall' },
  { value: 'museum', label: 'Museum' },
  { value: 'nightlife', label: 'Nightlife' },
  { value: 'parke', label: 'Parke' },
  { value: 'tourist', label: 'Tourist' },
] as const

function getPlaceCategoryLabel(categoryValue: string) {
  return placeCategories.find((category) => category.value === categoryValue)?.label ?? categoryValue
}

export { getPlaceCategoryLabel, placeCategories }
