// Checks that keep answers to facts we hold: prices must come from the user or our place data, and we hold no opening hours.

const PRICE_PATTERN = /(?:₱|php\s?|p(?=\d))\s?(\d[\d,]*(?:\.\d+)?)(?:\s?k\b)?|(\d[\d,]*)\s?(?:pesos|php)\b/gi;

export function pricesIn(text: string): number[] {
  const found: number[] = [];
  for (const match of text.matchAll(PRICE_PATTERN)) {
    const raw = (match[1] ?? match[2] ?? "").replace(/,/g, "");
    let value = Number(raw);
    if (/k\b/i.test(match[0])) value *= 1000;
    if (Number.isFinite(value) && value > 0) found.push(value);
  }
  return found;
}

/** Numbers a price may honestly come from: the user's own words and the referenced places' data. */
export function allowedPrices(userText: string, places: Array<{ budget_min: number | null; budget_note: string | null }>): Set<number> {
  const allowed = new Set<number>();
  for (const value of pricesIn(userText)) allowed.add(value);
  for (const raw of userText.match(/\d[\d,]*/g) ?? []) allowed.add(Number(raw.replace(/,/g, "")));
  for (const place of places) {
    if (place.budget_min != null) allowed.add(place.budget_min);
    for (const raw of (place.budget_note ?? "").match(/\d[\d,]*/g) ?? []) allowed.add(Number(raw.replace(/,/g, "")));
  }
  // Sums and per-head splits of allowed amounts are honest arithmetic.
  const base = [...allowed];
  for (const a of base) for (const b of base) allowed.add(a + b);
  for (const a of base) for (const n of [2, 3, 4, 5, 6, 8, 10]) {
    allowed.add(Math.round(a / n));
    allowed.add(a * n);
  }
  return allowed;
}

const HOURS_PATTERN = /\b(open(?:s|ing)?|close[sd]?|closing|bukas|sarado|hours?)\b[^.\n]{0,40}?\b\d{1,2}(?::\d{2})?\s?(?:am|pm|nn|a\.m\.|p\.m\.)/i;

export function claimsHours(text: string): boolean {
  return HOURS_PATTERN.test(text);
}
