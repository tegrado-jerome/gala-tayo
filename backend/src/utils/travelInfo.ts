// "Know before you go" facts for visitors (places.travel_info). Mirrors the type in frontend/src/utils/travelInfo.ts.
//
// Every section carries the URLs its facts came from. A section with no text or no source is dropped,
// so the app never shows an unsourced fact.

export const TRAVEL_SECTION_FIELDS = {
  getting_there: ["hub", "route", "time", "notes"],
  money: ["text"],
  fees: ["local", "foreigner", "other"],
  seasons: ["best", "avoid"],
  safety: ["text"],
  dress: ["text"],
} as const;

type SectionKey = keyof typeof TRAVEL_SECTION_FIELDS;
type SectionFields<K extends SectionKey> = Partial<Record<(typeof TRAVEL_SECTION_FIELDS)[K][number], string>>;

export type TravelInfo = { [K in SectionKey]?: SectionFields<K> & { sources: string[] } } & { checked?: string };

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanSources(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const urls = value.filter((url): url is string => typeof url === "string" && /^https?:\/\/\S+$/.test(url.trim())).map((url) => url.trim());
  return [...new Set(urls)];
}

/** Keeps only sourced, non-empty sections from the database; anything else is unknown (null). */
export function parseTravelInfo(value: unknown): TravelInfo | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const info: Record<string, unknown> = {};
  for (const [key, fields] of Object.entries(TRAVEL_SECTION_FIELDS)) {
    const raw = record[key];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const section = raw as Record<string, unknown>;
    const sources = cleanSources(section.sources);
    if (sources.length === 0) continue;
    const texts = Object.fromEntries(fields.map((field) => [field, cleanText(section[field])]).filter(([, text]) => text));
    if (Object.keys(texts).length > 0) info[key] = { ...texts, sources };
  }
  if (Object.keys(info).length === 0) return null;
  const checked = cleanText(record.checked);
  return { ...info, ...(checked && /^\d{4}-\d{2}$/.test(checked) ? { checked } : {}) } as TravelInfo;
}
