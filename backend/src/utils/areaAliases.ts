// Metro Manila nicknames and districts mapped to the city names stored on places.
export const AREA_ALIASES: Record<string, string> = {
  bgc: "taguig",
  "bonifacio global city": "taguig",
  "fort bonifacio": "taguig",
  "the fort": "taguig",
  mckinley: "taguig",
  "mckinley hill": "taguig",
  "uptown bgc": "taguig",
  poblacion: "makati",
  legazpi: "makati",
  salcedo: "makati",
  rockwell: "makati",
  greenbelt: "makati",
  glorietta: "makati",
  "ayala center": "makati",
  moa: "pasay",
  "mall of asia": "pasay",
  "ccp complex": "pasay",
  intramuros: "manila",
  ermita: "manila",
  malate: "manila",
  binondo: "manila",
  chinatown: "manila",
  quiapo: "manila",
  luneta: "manila",
  "rizal park": "manila",
  divisoria: "manila",
  maynila: "manila",
  qc: "quezon city",
  "q.c.": "quezon city",
  cubao: "quezon city",
  maginhawa: "quezon city",
  "teachers village": "quezon city",
  "tomas morato": "quezon city",
  diliman: "quezon city",
  katipunan: "quezon city",
  banawe: "quezon city",
  eastwood: "quezon city",
  "araneta city": "quezon city",
  ortigas: "pasig",
  kapitolyo: "pasig",
  greenhills: "san juan",
  alabang: "muntinlupa",
  "entertainment city": "parañaque",
  okada: "parañaque",
  paranaque: "parañaque",
  "las pinas": "las piñas",
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word match that also works for names with dots or accents ("q.c.", "parañaque"). */
export function mentionsPhrase(text: string, phrase: string) {
  return new RegExp(`(^|[^a-z0-9ñ])${escapeRegExp(phrase)}(?=$|[^a-z0-9ñ])`).test(text);
}

const NEAR_MANILA = /\b(?:near|malapit\s+(?:lang\s+)?sa|outside|around|labas\s+ng|day\s+trip\s+from|from)\s+(?:metro\s+)?manila\b/g;

/** "Beach near Manila" asks for places outside the city, not in it. */
export function isNearManila(text: string) {
  return new RegExp(NEAR_MANILA.source).test(text.toLowerCase());
}

/**
 * Lowercased request text without words that don't pin a city: "Metro Manila" names the region,
 * and "near Manila" means somewhere else.
 */
export function locationText(text: string) {
  return text.toLowerCase().replace(NEAR_MANILA, " ").replace(/\bmetro\s+manila\b/g, " ");
}

/** Cities (lowercase, as stored on places) and the alias words that named them. */
export function detectAliasedCities(text: string): { cities: Set<string>; aliases: Set<string> } {
  const lower = locationText(text);
  const cities = new Set<string>();
  const aliases = new Set<string>();
  for (const [alias, city] of Object.entries(AREA_ALIASES)) {
    if (mentionsPhrase(lower, alias)) {
      cities.add(city);
      aliases.add(alias);
    }
  }
  return { cities, aliases };
}
