// Links into Plan with AI. Chosen places travel as slugs next to the prompt, so the planner keeps every one of
// them instead of guessing from names in the text.

const MAX_PLACES = 6
const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/

export function planWithAiHref(prompt: string, placeSlugs: string[] = []): string {
  const params = new URLSearchParams()
  if (prompt.trim()) params.set('q', prompt.trim())
  const slugs = [...new Set(placeSlugs.filter((slug) => SLUG.test(slug)))].slice(0, MAX_PLACES)
  if (slugs.length > 0) params.set('places', slugs.join(','))
  const query = params.toString()
  return query ? `/plan-with-ai?${query}` : '/plan-with-ai'
}

export function readPlanWithAiParams(search: string): { prompt: string; placeSlugs: string[] } {
  const params = new URLSearchParams(search)
  const placeSlugs = (params.get('places') ?? '')
    .split(',')
    .map((slug) => slug.trim())
    .filter((slug) => SLUG.test(slug))
    .slice(0, MAX_PLACES)
  return { prompt: params.get('q') ?? '', placeSlugs: [...new Set(placeSlugs)] }
}
