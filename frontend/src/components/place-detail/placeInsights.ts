import { goodForText } from '../../utils/goodForText'
import { cleanString, titleCase, uniqueList } from './helpers'

/** Splits prose into trimmed sentences; keeps abbreviations like "St." mostly intact by requiring a capital or digit after the break. */
export function splitSentences(text: string | null | undefined) {
  return cleanString(text)
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"‘'])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

/** "Early morning (6–9 AM) on weekdays; avoid…" → "Early morning". Keeps the sticky bar to one line. */
export function shortBestTime(value: string | null | undefined, maxLength = 26) {
  const first = cleanString(value).split(/[;,(]|\s[–—-]\s/)[0]?.trim() ?? ''
  if (first.length <= maxLength) return first
  const cut = first.slice(0, maxLength + 1)
  return `${cut.slice(0, cut.lastIndexOf(' ')).trim()}…`
}

const TIP_PATTERN = /\b(wear|bring|dress|shoes|sunscreen|sun protection|umbrella|cash|water|modest|sleeves)\b/i
const ADMIN_PATTERN = /^(check|confirm|call|verify)\b/i

/** Packing and dress advice that the place description already gives. */
export function describedTips(description: string | null | undefined) {
  return splitSentences(description).filter((sentence, index) => index > 0 && TIP_PATTERN.test(sentence) && sentence.length <= 220)
}

type HighlightInput = {
  description?: string | null
  highlights?: string[]
  good_for?: string[]
  tags?: Array<{ name: string }>
  nearby_context?: string | null
  decision_reason?: string | null
  commute_friendly?: boolean | null
  isRainSafe: boolean
}

function joinList(values: string[]) {
  if (values.length <= 1) return values.join('')
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`
}

/** "Why go" bullets, built only from fields the place already has. */
export function buildHighlights(place: HighlightInput, max = 4) {
  const bullets: string[] = []
  const add = (value: string | null | undefined) => {
    const text = cleanString(value).replace(/\s+/g, ' ')
    if (text && !bullets.some((bullet) => bullet.toLowerCase() === text.toLowerCase())) bullets.push(text)
  }

  uniqueList(place.highlights ?? []).slice(0, 3).forEach(add)

  const goodFor = uniqueList((place.good_for ?? []).map(goodForText)).map((value) => value.toLowerCase())
  if (goodFor.length > 0) add(`Good for ${joinList(goodFor.slice(0, 5))}`)

  const tagNames = uniqueList((place.tags ?? []).map((tag) => titleCase(tag.name)))
  if (tagNames.length > 0) add(`Known for ${joinList(tagNames.slice(0, 3).map((name) => name.toLowerCase()))}`)

  add(splitSentences(place.decision_reason)[0])
  add(splitSentences(place.nearby_context)[0])
  if (place.isRainSafe) add('Mostly indoors, so it still works on a rainy day')
  if (place.commute_friendly) add('Easy to reach by commute')

  if (bullets.length < 3) {
    splitSentences(place.description)
      .slice(1)
      .filter((sentence) => sentence.length <= 200 && !TIP_PATTERN.test(sentence) && !ADMIN_PATTERN.test(sentence))
      .slice(0, 3 - bullets.length)
      .forEach(add)
  }

  return bullets.slice(0, max)
}

const STOP_WORDS = new Set(
  (
    'about after again also always because been before being best better both came come could didnt does doing dont down each even ever every from going good great have here into just know less like made make many more most much must nice only other over pero place pretty quite really same should since some spot still such sure than that thats their them then there these they thing things this those though through time very visit want were what when where which while will with worth would your yung yong kung lang naman talaga sobrang dito diyan mga para kasi kami tayo sila nila ako ikaw siya niya pala sana ganun ganon parang medyo ayos okay'
  ).split(' '),
)

/** Words several different reviewers used, shown as chips. Empty unless at least 3 reviews repeat something. */
export function reviewHighlights(texts: string[], max = 5) {
  if (texts.length < 3) return []
  const counts = new Map<string, number>()
  for (const text of texts) {
    const words = new Set(
      text
        .toLowerCase()
        .replace(/[’']/g, '')
        .match(/[a-zñ]{4,}/g) ?? [],
    )
    words.forEach((word) => {
      if (!STOP_WORDS.has(word)) counts.set(word, (counts.get(word) ?? 0) + 1)
    })
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([word]) => word)
}
