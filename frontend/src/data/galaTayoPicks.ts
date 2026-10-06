// Places that scored 80+ in the gala-worthy scoring (gala-tayo-benchmarks/gala-worthy/scores.json), best first.
// Only these get the "GalaTayo Pick" badge.
const galaTayoPickScores: Array<[slug: string, score: number]> = [
  ['fort-santiago', 100],
  ['national-museum-of-fine-arts', 100],
  ['national-museum-of-natural-history', 100],
  ['binondo-chinatown', 99],
  ['intramuros', 99],
  ['toyo-eatery', 98],
  ['san-agustin-church', 98],
  ['gallery-by-chele', 96],
  ['rizal-park-luneta-park', 94],
  ['manila-cathedral', 92],
  ['manila-ocean-park', 92],
  ['the-mind-museum', 92],
  ['ayala-museum', 89],
  ['ayala-triangle-gardens', 88],
  ['sm-mall-of-asia', 86],
  ['casa-manila', 80],
  ['cultural-center-of-the-philippines-complex', 80],
]

const pickSlugs = new Set(galaTayoPickScores.map(([slug]) => slug))

export const galaTayoPickSlugs = galaTayoPickScores.map(([slug]) => slug)

export function isGalaTayoPick(slug: string | null | undefined) {
  return Boolean(slug && pickSlugs.has(slug.trim().toLowerCase()))
}
