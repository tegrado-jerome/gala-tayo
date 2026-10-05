import destinationData from "../data/phDestinations.json";

// Keep in sync with frontend/src/data/phDestinations.json (a unit test checks both copies match).

export type Destination = {
  slug: string;
  name: string;
  /** Display spelling when it differs from `name` (for example "Las Piñas"). */
  label: string;
  type: "city" | "municipality";
  center: [number, number];
  aliases: string[];
  keywords: string[];
  featured: boolean;
  regionSlug: string;
  regionName: string;
  provinceSlug: string;
  provinceName: string;
};

export type Region = {
  slug: string;
  name: string;
  officialName: string;
  center: [number, number];
  destinations: Destination[];
};

type RawCity = {
  slug: string;
  name: string;
  label?: string;
  type: string;
  center: number[];
  aliases: string[];
  keywords?: string[];
  featured?: boolean;
};

type RawRegion = {
  slug: string;
  name: string;
  officialName: string;
  center: number[];
  provinces: Array<{ slug: string; name: string; cities: RawCity[] }>;
};

export const METRO_MANILA_REGION_SLUG = "metro-manila";

export function normalizeLocationText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toCenter(value: number[]): [number, number] {
  return [value[0], value[1]];
}

export const REGIONS: Region[] = (destinationData.regions as RawRegion[]).map((region) => ({
  slug: region.slug,
  name: region.name,
  officialName: region.officialName,
  center: toCenter(region.center),
  destinations: region.provinces.flatMap((province) =>
    province.cities.map((city) => ({
      slug: city.slug,
      name: city.name,
      label: city.label ?? city.name,
      type: city.type === "municipality" ? "municipality" : "city",
      center: toCenter(city.center),
      aliases: city.aliases,
      keywords: city.keywords ?? [],
      featured: city.featured === true,
      regionSlug: region.slug,
      regionName: region.name,
      provinceSlug: province.slug,
      provinceName: province.name,
    }))
  ),
}));

export const DESTINATIONS: Destination[] = REGIONS.flatMap((region) => region.destinations);

const destinationBySlug = new Map(DESTINATIONS.map((destination) => [destination.slug, destination]));
const regionBySlug = new Map(REGIONS.map((region) => [region.slug, region]));

/** Every normalized name a place's `city` or `area` may use for a destination. */
export function getDestinationNameKeys(destination: Destination): string[] {
  const names = [destination.slug, destination.name, destination.label, ...destination.aliases];
  if (!/\bcity$/i.test(destination.name)) {
    names.push(`${destination.name} City`);
  }
  return [...new Set(names.map(normalizeLocationText).filter(Boolean))];
}

const destinationByNameKey = new Map<string, Destination>();
for (const destination of DESTINATIONS) {
  for (const key of getDestinationNameKeys(destination)) {
    if (!destinationByNameKey.has(key)) {
      destinationByNameKey.set(key, destination);
    }
  }
}

export function getDestinationBySlug(slug: string | null | undefined): Destination | null {
  return slug ? destinationBySlug.get(slug.trim().toLowerCase()) ?? null : null;
}

export function getRegionBySlug(slug: string | null | undefined): Region | null {
  return slug ? regionBySlug.get(slug.trim().toLowerCase()) ?? null : null;
}

export function findDestinationByName(value: string | null | undefined): Destination | null {
  const key = value ? normalizeLocationText(value) : "";
  return key ? destinationByNameKey.get(key) ?? null : null;
}

/**
 * Maps a place's `city`/`area` to a destination. "City + area" is tried first so
 * "San Juan" + "La Union" lands in La Union while plain "San Juan" stays in Metro Manila.
 */
export function resolveDestination(city: string | null | undefined, area: string | null | undefined): Destination | null {
  const cleanCity = city?.trim() || "";
  const cleanArea = area?.trim() || "";
  const candidates = [cleanCity && cleanArea ? `${cleanCity} ${cleanArea}` : "", cleanCity, cleanArea].filter(Boolean);

  for (const candidate of candidates) {
    const match = findDestinationByName(candidate);
    if (match) {
      return match;
    }
  }

  return null;
}

export function isMetroManilaDestination(destination: Destination | null | undefined): boolean {
  return destination?.regionSlug === METRO_MANILA_REGION_SLUG;
}

/** City values to match in the database for an area slug (a destination or a whole region). */
export function getLocationNamesForAreaSlug(areaSlug: string | null | undefined): string[] {
  const destination = getDestinationBySlug(areaSlug);
  const destinations = destination ? [destination] : getRegionBySlug(areaSlug)?.destinations ?? [];
  return [...new Set(destinations.flatMap((item) => [item.slug, item.name, item.label, ...item.aliases]))];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasPhrase(normalizedText: string, phrase: string): boolean {
  const normalizedPhrase = normalizeLocationText(phrase);
  return Boolean(normalizedPhrase) && new RegExp(`(^|\\s)${escapeRegExp(normalizedPhrase)}($|\\s)`).test(normalizedText);
}

/** Destinations outside Metro Manila named in free text, longest match first. */
export function inferProvincialDestinationsFromQuery(query: string): Array<{ destination: Destination; matchedPhrase: string }> {
  const normalizedQuery = normalizeLocationText(query);
  if (!normalizedQuery) {
    return [];
  }

  const matches: Array<{ destination: Destination; matchedPhrase: string }> = [];
  for (const destination of DESTINATIONS) {
    if (isMetroManilaDestination(destination)) {
      continue;
    }

    const phrases = [...getDestinationNameKeys(destination), ...destination.keywords.map(normalizeLocationText)]
      .filter((phrase) => hasPhrase(normalizedQuery, phrase))
      .sort((left, right) => right.length - left.length);

    if (phrases.length > 0) {
      matches.push({ destination, matchedPhrase: phrases[0] });
    }
  }

  return matches.sort((left, right) => right.matchedPhrase.length - left.matchedPhrase.length);
}
