// A few place tags in the data are Filipino ("Barkada Hangout"); the app shows them in English.
const ENGLISH_TAGS: Record<string, string> = {
  'barkada hangout': 'Friends Hangout',
  'barkada activity': 'Group Activity',
  'barkada dinner': 'Group Dinner',
  'barkada snack': 'Group Snack',
  'casual gala': 'Casual Day Out',
  'rainy day gala': 'Rainy Day Out',
  'budget gala': 'Budget Day Out',
  'budget-friendly gala': 'Budget Day Out',
  'tipid gala': 'Budget Day Out',
  'active gala': 'Active Day Out',
  'weekend gala': 'Weekend Day Out',
  chillnuman: 'Chill Drinks',
}

export function goodForText(tag: string): string {
  return ENGLISH_TAGS[tag.trim().toLowerCase()] ?? tag
}
