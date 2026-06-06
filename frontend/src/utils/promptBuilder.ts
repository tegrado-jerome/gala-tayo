import type {
  ExternalLink,
  PromptBuilderFieldId,
  PromptBuilderOutputs,
  PromptBuilderSection,
  PromptBuilderState,
} from '../types/promptBuilder'

export const promptBuilderSections: PromptBuilderSection[] = [
  {
    id: 'plan',
    title: 'What are you planning?',
    chips: ['Date', 'Barkada hangout', 'Family day', 'Solo gala', 'Food trip', 'Cafe hopping', 'Study session', 'Tourist day', 'Museum / culture trip', 'Night out', 'Celebration', 'Quick chill'],
    customLabel: 'Other plan',
    helperText: 'Not in the choices? Type your own plan here, like "graduation dinner," "first meetup," or "anniversary date."',
    placeholder: 'graduation dinner, first meetup, anniversary date',
    multiSelect: false,
  },
  {
    id: 'location',
    title: 'Where do you want to go?',
    chips: ['Makati', 'BGC / Taguig', 'Manila', 'Quezon City', 'Pasay', 'Pasig', 'Mandaluyong', 'San Juan', 'Paranaque', 'Anywhere in Metro Manila', 'Near me'],
    customLabel: 'Custom location',
    helperText: 'Type a city, mall, landmark, station, or area if it is not listed.',
    placeholder: 'near MOA, Intramuros, SM North, LRT Buendia',
    multiSelect: false,
  },
  {
    id: 'companion',
    title: 'Who are you going with?',
    chips: ['Date', 'Friends / barkada', 'Family', 'Kids', 'Classmates', 'Workmates', 'Solo', 'Large group'],
    customLabel: 'Custom companion',
    helperText: 'Add who you are going with if the choices do not match your plan.',
    placeholder: 'parents, cousins, partner, group of 10',
    multiSelect: false,
  },
  {
    id: 'priorities',
    title: 'What matters most?',
    chips: ['Budget-friendly', 'Easy commute', 'Indoor', 'Rain-friendly', 'Not crowded', 'Photo-friendly', 'Walkable', 'With parking', 'Safe at night', 'Good for talking', 'Many food options', 'Aesthetic'],
    customLabel: 'Other preference',
    helperText: 'Add your own preference if the choices do not match what you need.',
    placeholder: 'not awkward for first date, senior-friendly, near MRT',
    multiSelect: true,
  },
  {
    id: 'vibe',
    title: 'What vibe do you want?',
    chips: ['Chill', 'Romantic', 'Cozy', 'Fun', 'Classy', 'Trendy', 'Quiet', 'Lively', 'Casual', 'Relaxing', 'Gen Z'],
    customLabel: 'Custom vibe',
    helperText: 'Type your own vibe if you want something more specific.',
    placeholder: 'soft date vibe, lowkey but cute',
    multiSelect: true,
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
  {
    id: 'time',
    title: 'When are you going?',
    chips: ['Today', 'This weekend', 'Weekday', 'Weekend', 'Morning', 'Afternoon', 'Evening', 'Late night', 'Not sure yet'],
    customLabel: 'Custom time',
    helperText: 'Add your own schedule if you already have a date or time in mind.',
    placeholder: 'Saturday 3 PM, after class, after work',
    multiSelect: false,
  },
  {
    id: 'outputStyle',
    title: 'What kind of answer do you want?',
    chips: ['Best pick only', 'Place list', 'Simple itinerary', 'Budget plan', 'Compare options', 'Commute guide', 'Date plan', 'Food trip route', 'Pros and cons', 'Ranked list'],
    customLabel: 'Custom answer style',
    helperText: 'Tell GalaTayo how you want the answer to be arranged.',
    placeholder: '3-hour plan, short answer only',
    multiSelect: false,
  },
  {
    id: 'currentInfo',
    title: 'Do you need current info checked?',
    chips: ['Open now', 'Hours today', 'Entrance fee', 'Events', 'Promos', 'Recent reviews', 'Parking rates', 'Holiday schedule', 'Reservation rules'],
    customLabel: 'Other current info',
    helperText: 'Add anything you want another AI or platform to verify online.',
    placeholder: 'last entry time, dress code, reservation needed',
    multiSelect: true,
  },
  {
    id: 'avoid',
    title: 'Anything to avoid?',
    chips: ['Too crowded', 'Too expensive', 'Hard commute', 'Outdoor only', 'Long walking', 'Noisy places', 'Long lines', 'Awkward for date', 'Too far apart'],
    customLabel: 'Things to avoid',
    helperText: 'Type anything you do not want in the recommendation.',
    placeholder: 'too noisy, too far from MRT, places with long queues',
    multiSelect: true,
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
  const fields = [
    ['My goal', getValue(state, 'plan')],
    ['Preferred location', getValue(state, 'location')],
    ['People going', getValue(state, 'companion')],
    ['Budget', getValue(state, 'budget')],
    ['Schedule or timing', getValue(state, 'time')],
    ['Vibe I want', getValue(state, 'vibe')],
    ['Important preferences', getValue(state, 'priorities')],
    ['Things I want to avoid', getValue(state, 'avoid')],
    ['Current details I need checked', getValue(state, 'currentInfo')],
    ['Answer style I want', getValue(state, 'outputStyle')],
  ].filter(([, value]) => value)
  const currentInfo = getValue(state, 'currentInfo')
  const fieldLines = fields.map(([label, value]) => `${label}: ${value}`)
  const currentInfoInstruction = currentInfo
    ? [
        '',
        'If I asked for current information, search online and verify details like opening hours, entrance fees, promos, closures, events, parking, reservation rules, or recent reviews before answering. If something is uncertain, clearly say what I should double-check.',
      ]
    : []

  return [
    'You are my practical local gala planner. Help me make a realistic, sulit, and easy-to-follow recommendation based on my needs.',
    '',
    ...fieldLines,
    '',
    'Do not give generic suggestions or random places that are far from each other. Think like a real local planner. Consider travel time, walking distance, commute convenience, Metro Manila traffic, weather, crowd level, safety, budget, opening hours, and whether the places actually make sense together.',
    '',
    'Please answer with this structure:',
    '',
    '1. Best overall recommendation',
    'Choose the best area, place, route, or plan for my situation. Explain why it fits better than other options.',
    '',
    '2. Suggested options',
    'Give 3 to 5 strong options. For each one, include:',
    '- why it fits my goal',
    '- what I can do there',
    '- estimated cost or budget fit',
    '- best time to go',
    '- commute or travel notes',
    '- possible downside or thing to watch out for',
    '',
    '3. Recommended flow',
    'If a plan or itinerary makes sense, arrange the options in a practical order so the trip does not feel tiring, awkward, or inefficient.',
    '',
    '4. Comparison and decision help',
    'Briefly explain which option is best for my situation, which is the safest choice, and which one to choose only if I want a different vibe.',
    '',
    '5. Backup plan',
    'Give backup options in case it rains, gets crowded, the place is closed, the budget becomes tight, or the commute is difficult.',
    '',
    '6. Final pick',
    'End with one clear final recommendation and a simple reason why it is the best choice for me.',
    ...currentInfoInstruction,
    '',
    'Use a friendly natural Taglish tone. Be specific, practical, realistic, and helpful. Avoid vague answers.',
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function compactValues(values: string[]) {
  return values
    .map((value) => value.toLowerCase().replace(/[^\w\s/-]/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

export function buildSearchKeyword(state: PromptBuilderState): string {
  const values = [
    ...combineSelections(state, 'vibe'),
    ...combineSelections(state, 'priorities').slice(0, 3),
    ...combineSelections(state, 'plan'),
    ...combineSelections(state, 'location'),
    ...combineSelections(state, 'budget'),
    ...combineSelections(state, 'currentInfo').slice(0, 2),
  ]

  return compactValues(values).join(' ').split(/\s+/).slice(0, 12).join(' ')
}

export function buildGalaTayoSearchPhrase(state: PromptBuilderState): string {
  const plan = getValue(state, 'plan')
  const vibe = getValue(state, 'vibe')
  const location = getValue(state, 'location')
  const budget = getValue(state, 'budget')
  const priorities = combineSelections(state, 'priorities').slice(0, 3).join(' ')
  const parts = [vibe, plan, location ? `in ${location}` : '', budget, priorities]

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
    { label: 'Google Maps', href: keyword ? `https://www.google.com/maps/search/${encodedKeyword}` : 'https://www.google.com/maps' },
    { label: 'TikTok', href: keyword ? `https://www.tiktok.com/search?q=${encodedKeyword}` : 'https://www.tiktok.com/search' },
    { label: 'Instagram', href: 'https://www.instagram.com/explore/search/keyword/', helper: 'Instagram may ask you to paste the keyword manually.' },
    { label: 'Facebook', href: keyword ? `https://www.facebook.com/search/top?q=${encodedKeyword}` : 'https://www.facebook.com/search/top' },
    { label: 'X', href: keyword ? `https://x.com/search?q=${encodedKeyword}&src=typed_query` : 'https://x.com/search' },
  ]
}
