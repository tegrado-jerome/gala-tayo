export type PromptBuilderFieldId =
  | 'plan'
  | 'location'
  | 'companion'
  | 'vibe'
  | 'budget'

export type PromptBuilderState = Record<PromptBuilderFieldId, string[]> & {
  custom: Record<PromptBuilderFieldId, string>
}

export type PromptBuilderSection = {
  id: PromptBuilderFieldId
  title: string
  chips: string[]
  customLabel: string
  helperText: string
  placeholder: string
  multiSelect: boolean
}

export type PromptBuilderOutputs = {
  aiPrompt: string
  searchKeyword: string
  galaTayoSearchPhrase: string
}

export type ExternalLink = {
  label: string
  href: string
  helper?: string
}

export const promptBuilderSections: PromptBuilderSection[] = [
  {
    id: 'plan',
    title: 'What are you planning?',
    chips: ['Date', 'Hangout with friends', 'Family day', 'Solo day out', 'Food trip', 'Cafe hopping', 'Study session', 'Tourist day', 'Museum / culture trip', 'Night out', 'Celebration', 'Quick chill'],
    customLabel: 'Other plan',
    helperText: 'Not in the choices? Type your own plan here.',
    placeholder: 'Type your plan here...',
    multiSelect: false,
  },
  {
    id: 'location',
    title: 'Where do you want to go?',
    chips: ['Makati', 'BGC / Taguig', 'Manila', 'Quezon City', 'Pasay', 'Pasig', 'Mandaluyong', 'San Juan', 'Paranaque', 'Anywhere in Metro Manila', 'Tagaytay', 'Baguio', 'La Union', 'Near me'],
    customLabel: 'Custom location',
    helperText: 'Type a city, mall, landmark, station, or area if it is not listed.',
    placeholder: 'Type location here...',
    multiSelect: false,
  },
  {
    id: 'companion',
    title: 'Who are you going with?',
    chips: ['Date', 'Friends', 'Family', 'Kids', 'Classmates', 'Workmates', 'Solo', 'Large group'],
    customLabel: 'Custom companion',
    helperText: 'Add who you are going with if the choices do not match your plan.',
    placeholder: 'e.g. parents, cousins, partner, group of 10',
    multiSelect: false,
  },
  {
    id: 'vibe',
    title: 'What vibe do you want?',
    chips: ['Relaxed', 'Fun & adventurous', 'Romantic', 'Cultural', 'Budget-friendly', 'Luxury', 'Trendy / modern'],
    customLabel: 'Other vibe',
    helperText: 'Describe the atmosphere or feeling you are going for.',
    placeholder: 'Type vibe here...',
    multiSelect: false,
  },
  {
    id: 'budget',
    title: 'What is your budget?',
    chips: ['Free', 'Under PHP 500', 'PHP 500-PHP 1,000', 'PHP 1,000-PHP 2,000', 'PHP 2,000+', 'No strict budget'],
    customLabel: 'Custom budget',
    helperText: 'Type your own budget if the choices do not fit your plan.',
    placeholder: 'PHP 300 each, PHP 1,500 total for two people',
    multiSelect: false,
  },
]

const fieldIds = promptBuilderSections.map((section) => section.id)

export function createEmptyPromptBuilderState(): PromptBuilderState {
  const base = fieldIds.reduce((values, id) => {
    values[id] = []
    return values
  }, {} as Record<PromptBuilderFieldId, string[]>)
  const custom = fieldIds.reduce((values, id) => {
    values[id] = ''
    return values
  }, {} as Record<PromptBuilderFieldId, string>)

  return { ...base, custom }
}

export function combineSelections(state: PromptBuilderState, fieldId: PromptBuilderFieldId): string[] {
  const chipValues = state[fieldId].filter((value) => value.trim())
  const customValue = state.custom[fieldId].trim()

  return customValue ? [...chipValues, customValue] : chipValues
}

function joinValues(values: string[]) {
  return values.join(', ')
}

function getValue(state: PromptBuilderState, fieldId: PromptBuilderFieldId) {
  return joinValues(combineSelections(state, fieldId))
}

export function hasPromptBuilderInput(state: PromptBuilderState): boolean {
  return fieldIds.some((id) => combineSelections(state, id).length > 0)
}

export function buildAiPrompt(state: PromptBuilderState): string {
  const details = [
    ['Plan', getValue(state, 'plan')],
    ['Location', getValue(state, 'location')],
    ['With', getValue(state, 'companion')],
    ['Vibe', getValue(state, 'vibe')],
    ['Budget', getValue(state, 'budget')],
  ].filter(([, value]) => value)

  const detailText = details.map(([label, value]) => `${label}: ${value}`).join('. ')

  const prompt = [
    getValue(state, 'location') ? 'Help me plan a practical day out in the Philippines.' : 'Help me plan a practical day out in Metro Manila.',
    detailText,
    'Recommend the best area or place choices for this.',
    'Give 3 strong options with why each fits, rough budget, and best time to go.',
    'Keep it realistic, commute-aware and good value.',
    'Use friendly natural Taglish and end with one best final pick.',
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

  return prompt.length <= 950 ? prompt : `${prompt.slice(0, 947).trimEnd()}...`
}

function compactValues(values: string[]) {
  return values
    .map((value) => value.toLowerCase().replace(/[^\w\s/-]/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

export function buildSearchKeyword(state: PromptBuilderState): string {
  const values = [
    ...combineSelections(state, 'vibe'),
    ...combineSelections(state, 'plan'),
    ...combineSelections(state, 'location'),
    ...combineSelections(state, 'budget'),
  ]

  return compactValues(values).join(' ').split(/\s+/).slice(0, 12).join(' ')
}

export function buildGalaTayoSearchPhrase(state: PromptBuilderState): string {
  const plan = getValue(state, 'plan')
  const vibe = getValue(state, 'vibe')
  const location = getValue(state, 'location')
  const budget = getValue(state, 'budget')
  const companion = getValue(state, 'companion')
  const parts = [vibe, plan, companion ? `with ${companion}` : '', location ? `in ${location}` : '', budget]

  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
}

export function buildPromptBuilderOutputs(state: PromptBuilderState): PromptBuilderOutputs {
  return {
    aiPrompt: buildAiPrompt(state),
    searchKeyword: buildSearchKeyword(state),
    galaTayoSearchPhrase: buildGalaTayoSearchPhrase(state),
  }
}

export function getExternalAiLinks(): ExternalLink[] {
  return [
    { label: 'ChatGPT', href: 'https://chatgpt.com/' },
    { label: 'Gemini', href: 'https://gemini.google.com/' },
    { label: 'Claude', href: 'https://claude.ai/' },
    { label: 'Perplexity', href: 'https://www.perplexity.ai/' },
  ]
}

export function getExternalSearchLinks(keyword: string): ExternalLink[] {
  const encodedKeyword = encodeURIComponent(keyword)

  return [
    { label: 'Facebook', href: keyword ? `https://www.facebook.com/search/top/?q=${encodedKeyword}` : 'https://www.facebook.com/' },
    { label: 'TikTok', href: keyword ? `https://www.tiktok.com/search?q=${encodedKeyword}` : 'https://www.tiktok.com/search' },
    { label: 'Instagram', href: 'https://www.instagram.com/explore/search/keyword/', helper: 'Instagram may ask you to paste the keyword manually.' },
    { label: 'X', href: keyword ? `https://x.com/search?q=${encodedKeyword}&src=typed_query` : 'https://x.com/search' },
  ]
}
