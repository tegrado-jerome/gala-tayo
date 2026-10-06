// Pure rules for "Gala Today": the daily creator-style post that turns what's hot into a gala plan.
// No network or AI here, so the rules that keep posts funny, safe and honest are unit-tested.
import { isSafeTrend, normalizeTopic, type ScoredTrend, type TodayTopic } from "./galaTodaySignals";

export type TodayPlace = {
  slug: string;
  name: string;
  city: string;
  category: string;
  summary: string;
  canonicalPath: string;
  /** Starting budget in pesos from the place's own data (0 = free), or null when unknown. */
  budgetMin: number | null;
  /** Gala score (0–100); higher means more iconic. */
  score: number;
};

export type FormatId =
  | "budget-challenge"
  | "24-hours"
  | "would-you-rather"
  | "tier-list"
  | "guess-the-place"
  | "starter-pack"
  | "pov"
  | "expectation-vs-reality"
  | "main-character"
  | "gem-vs-famous";

export type Tier = "S" | "A" | "B";

export type GalaTodayPick = {
  slug: string;
  name: string;
  city: string;
  canonicalPath: string;
  why: string;
  tier?: Tier;
  time?: string;
  budgetMin?: number | null;
};

export type GalaTodayPost = {
  slug: string;
  date: string;
  publishedAt: string;
  format: FormatId;
  /** The format sticker shown on cards, e.g. "₱500 Challenge". */
  sticker: string;
  title: string;
  hook: string;
  body: string;
  meme: { top: string; bottom: string };
  topic: { kind: "trend" | "evergreen"; title: string; query: string; source: string | null; url: string | null };
  /** A short human weather line (never numbers), only when rain is likely. */
  weather: string | null;
  area: string;
  /** The most iconic pick; its HD photo leads the meme card. */
  leadSlug: string;
  picks: GalaTodayPick[];
  budget?: { cap: number; total: number };
  clues?: string[];
  items?: string[];
  review?: EditorScores;
  /** Which AI model wrote it (for quality tracking; not shown). */
  model?: string;
};

type FormatSpec = { name: string; picks: 2 | 3; sticker: (context: { cap: number | null; area: string }) => string; brief: string };

export const FORMATS: Record<FormatId, FormatSpec> = {
  "budget-challenge": {
    name: "Budget challenge",
    picks: 3,
    sticker: ({ cap }) => `₱${(cap ?? 0).toLocaleString("en-PH")} Challenge`,
    brief:
      "A whole gala day under BUDGET. Use only places with a price in PLACES; their starting budgets must add up to BUDGET or less. Mention the cap and the total (TOTAL is computed for you, use those exact numbers), and make the money math part of the fun (the sukli, the 'still have change for merienda').",
  },
  "24-hours": {
    name: "24 hours in the area",
    picks: 3,
    sticker: ({ area }) => `24 Hours in ${area}`,
    brief: "A morning-to-night plan. Give every pick a 'time' like \"8 AM\", \"1 PM\", \"6 PM\" in order. Each stop is a beat in a mini story with a payoff at night.",
  },
  "would-you-rather": {
    name: "Would you rather",
    picks: 2,
    sticker: () => "Would You Rather",
    brief: "Exactly 2 picks, two very different days out. meme.top starts with \"Would you rather\". The body makes the case for both like a friendly debate; the reader should want to vote.",
  },
  "tier-list": {
    name: "Tier list",
    picks: 3,
    sticker: () => "Tier List",
    brief: "Rank the 3 picks S, A and B (one each) in each pick's 'tier'. Every 'why' is a funny, specific reason for its rank; B tier is still a compliment (it lost to the other two, not to anyone else).",
  },
  "guess-the-place": {
    name: "Guess the place",
    picks: 3,
    sticker: () => "Guess the Place",
    brief: "The FIRST pick is the answer. Give 3 'clues' (max 100 chars each) from its facts, easy to hard-but-fair, never naming it or its city. Never name the answer in the title, hook, body or meme (only in picks). The other 2 picks are nearby bonus stops.",
  },
  "starter-pack": {
    name: "Starter pack",
    picks: 3,
    sticker: () => "Starter Pack",
    brief: "The starter pack for the topic's kind of gala. Give 3–6 'items' (max 40 chars each): the relatable things you bring or do (the extra shirt, the 'one more photo'). Then the 3 picks are where to use the pack.",
  },
  pov: {
    name: "POV",
    picks: 3,
    sticker: () => "POV",
    brief: "meme.top starts with \"POV:\" and puts the reader inside a funny, relatable moment tied to the topic. The picks are where that POV happens.",
  },
  "expectation-vs-reality": {
    name: "Expectation vs reality",
    picks: 3,
    sticker: () => "Expectation vs Reality",
    brief: "meme.top starts with \"Expectation:\" and meme.bottom with \"Reality:\". The reality is the funny, BETTER-than-planned truth (you stayed 3 hours, 400 photos), never a complaint about the place.",
  },
  "main-character": {
    name: "Main character moments",
    picks: 3,
    sticker: () => "Main Character Moments",
    brief: "Each pick is a 'main character moment': the exact spot or time where you feel like the lead of a movie, from the facts. Cinematic and a little dramatic, in a fun way.",
  },
  "gem-vs-famous": {
    name: "Hidden gem vs the famous one",
    picks: 2,
    sticker: () => "Hidden Gem vs The Famous One",
    brief: "Exactly 2 picks: first an ICON from PLACES, then an UNDERRATED one. Respect both: the icon is famous for a reason, the underrated one is the friend who deserves more credit.",
  },
};

// Interleaved so neighbouring days feel different. Index = day * 3 + slot (3 is coprime with 10),
// so mornings cycle through all ten and no two consecutive posts share a format.
export const FORMAT_ORDER: FormatId[] = [
  "pov",
  "budget-challenge",
  "tier-list",
  "would-you-rather",
  "24-hours",
  "guess-the-place",
  "expectation-vs-reality",
  "starter-pack",
  "gem-vs-famous",
  "main-character",
];

const dayNumber = (date: string) => Math.floor(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 86_400_000);

/** Today's format: deterministic by date and slot, skipping unavailable ones and never repeating the previous post's. */
export function chooseFormat(date: string, slot: number, previous: FormatId | null, isAvailable: (id: FormatId) => boolean = () => true): FormatId {
  const start = dayNumber(date) * 3 + slot;
  for (let step = 0; step < FORMAT_ORDER.length; step += 1) {
    const id = FORMAT_ORDER[(start + step) % FORMAT_ORDER.length];
    if (id !== previous && isAvailable(id)) return id;
  }
  return FORMAT_ORDER.find((id) => id !== previous) ?? "pov";
}

const BUDGET_CAPS = [300, 500, 1000, 1500, 2000, 3000];

/** The smallest round cap that 3 priced places fit under, from real budget data only. Null when there isn't enough data. */
export function budgetPlan(places: TodayPlace[]): { cap: number; eligible: TodayPlace[] } | null {
  const priced = places.filter((place) => place.budgetMin !== null).sort((left, right) => (left.budgetMin ?? 0) - (right.budgetMin ?? 0));
  if (priced.length < 3) return null;
  const cheapest = priced.slice(0, 3).reduce((sum, place) => sum + (place.budgetMin ?? 0), 0);
  const cap = BUDGET_CAPS.find((value) => value >= cheapest);
  if (!cap) return null;
  return { cap, eligible: priced.filter((place) => (place.budgetMin ?? 0) <= cap) };
}

/** Every peso amount written in the text (₱500, P1,200, PHP 300, 2k pesos, 500 pesos). */
export function pesoAmounts(text: string): number[] {
  const toNumber = (digits: string, k?: string) => Number(digits.replace(/,/g, "")) * (k ? 1000 : 1);
  const amounts: number[] = [];
  for (const match of text.matchAll(/(?:₱|\bphp\s?|\bp(?=\d))\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(\s?k\b)?/gi)) amounts.push(toNumber(match[1], match[2]));
  for (const match of text.matchAll(/(?<![₱\d,.])\b(\d{1,3}(?:,\d{3})+|\d+)(\s?k)?\s?(?:pesos?|php)\b/gi)) amounts.push(toNumber(match[1], match[2]));
  return amounts;
}

/** Icons are the top third of today's places by gala score; underrated ones the bottom third. */
export function fameTiers(places: TodayPlace[]): { icons: Set<string>; gems: Set<string> } {
  const sorted = [...places].sort((left, right) => right.score - left.score);
  const third = Math.max(1, Math.floor(sorted.length / 3));
  return { icons: new Set(sorted.slice(0, third).map((place) => place.slug)), gems: new Set(sorted.slice(-third).map((place) => place.slug)) };
}

const STOPWORDS = new Set(["the", "a", "an", "in", "of", "and", "for", "to", "vs", "on", "at", "with", "your", "my", "is", "are", "ng", "sa", "ang", "mga"]);
const significantWords = (text: string) => normalizeTopic(text).split(" ").filter((word) => word.length >= 3 && !STOPWORDS.has(word));

/** A clean, readable slug of 3–6 complete words. Uses the model's slug when it's clean, else whole words of the title. */
export function cleanSlug(raw: string, title: string): string {
  const fromRaw = normalizeTopic(raw).split(" ").filter(Boolean);
  if (fromRaw.length >= 3 && fromRaw.length <= 6) return fromRaw.join("-");
  const words = normalizeTopic(title).split(" ").filter(Boolean).slice(0, 6);
  while (words.length > 3 && STOPWORDS.has(words[words.length - 1])) words.pop();
  return words.join("-") || "gala-today";
}

/** A unique slug: the clean slug, with the date added only when it's already taken. */
export function uniqueSlug(slug: string, date: string, taken: Set<string>): string {
  if (!taken.has(slug)) return slug;
  const dated = `${slug}-${date}`;
  return taken.has(dated) ? `${dated}-2` : dated;
}

// Tagalog grammar words: a few are fine, more means machine-made Taglish that tourists can't read.
const TAGALOG_GRAMMAR = ["ang", "ng", "mga", "sa", "pa", "rin", "din", "kahit", "pero", "lang", "naman", "ba", "yung", "ito", "kasi", "talaga", "mo", "ko", "niya", "nila", "natin", "tayo", "kayo"];

export function tagalogGrammarCount(text: string): number {
  return normalizeTopic(text).split(" ").filter((word) => TAGALOG_GRAMMAR.includes(word)).length;
}

const HEDGE_PATTERN = /\b(check|confirm|verify|call ahead|subject to change|may change|may vary|be sure to)\b/i;
const SLOP_PATTERN = /\b(unlock|elevate|seamless|delve|tapestry|game-changer|look no further|whether you're|hidden gems? await|nestled)\b/i;
// Never the butt of a joke: bodies, intelligence, class, faith.
const UNKIND_PATTERN = /\b(fat|fatty|ugly|stupid|idiot|dumb|bobo|tanga|pangit|jologs|squammy|skwater|cheapskate|god|jesus|bible|devil|demon|hell|pray|praying|prayer|holy)\b/i;
const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;

// Claims the model may only make when the place's own facts already say them.
const SUPERLATIVES = ["biggest", "largest", "oldest", "the first", "the only", "best", "most", "highest", "longest", "tallest", "#1", "number one"];

/** Superlatives in the text that none of the picked places' facts back up. */
export function unbackedSuperlatives(text: string, facts: string): string[] {
  const lowerFacts = facts.toLowerCase();
  return SUPERLATIVES.filter((word) => new RegExp(`(^|\\W)${word.replace("#", "\\#")}(\\W|$)`, "i").test(text) && !lowerFacts.includes(word));
}

/** "8 AM", "8:30pm", "12 NN" → minutes after midnight; null when unreadable. */
export function parseClock(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|nn|noon)$/i);
  if (!match) return null;
  const hour = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  if (hour < 1 || hour > 12 || minutes > 59) return null;
  const meridiem = match[3].toLowerCase();
  if (meridiem === "nn" || meridiem === "noon") return hour === 12 ? 720 + minutes : null;
  return ((hour % 12) + (meridiem === "pm" ? 12 : 0)) * 60 + minutes;
}

const peso = (value: number) => (value === 0 ? "free" : `₱${value.toLocaleString("en-PH")}`);

export type PromptInput = {
  date: string;
  topic: TodayTopic;
  format: FormatId;
  places: TodayPlace[];
  areaName: string;
  weather: string | null;
  day: string;
  budget: { cap: number } | null;
  editorNotes?: string | null;
};

export function topicQuery(topic: TodayTopic) {
  return topic.kind === "trend" ? topic.trend.query : topic.query;
}

export function buildPrompt({ date, topic, format, places, areaName, weather, day, budget, editorNotes }: PromptInput) {
  const spec = FORMATS[format];
  const { icons, gems } = fameTiers(places);
  const system = `You are the head writer of "Gala Today" on GalaTayo, an app of famous, gala-worthy places in the Philippines. Write like a top creator: one big, clear idea a stranger gets in 2 seconds, a twist that makes them smile, and a real reason to go out today.

VOICE
- Mostly simple English with a light Filipino flavour: at most 2–3 well-known words such as tara, sulit, barkada, kilig, chika, merienda, G. Never full Tagalog sentences or mixed Tagalog grammar ("may planong galang pa rin" is wrong). A foreign tourist must understand every line.
- Punchy, witty, wholesome. Short sentences. Specific beats generic: every joke uses a real detail from that place's facts.
- The humour comes from relatable truths about going out (the 400 photos, the group chat that never decides, "one more round", the budget math), surprise and playful exaggeration. Never from making fun of anyone.

HARD LIMITS (break one and the post is thrown away)
- No politics, religion or religious jokes, tragedy, crime, disasters, illness, body shaming, stereotypes about any group or place, punching down, real private people, gossip, or mocking any brand or business. Celebrities and shows only as a friendly nod.
- Facts only from PLACES. Never invent prices, hours, distances, events, menus, awards, rankings or superlatives (biggest, oldest, first, best…). Peso amounts only from the numbers given. If a place's facts don't mention the topic, never claim it has or serves it: link by vibe ("after the concert", "same energy", "for your post-hype merienda").
- No hedges ("check", "confirm", "may change"), no hashtags, no emojis.
- When WEATHER is given, every pick must work in that weather. Weather is never the joke or the headline.

THE POST
- TOPIC is the hook. Build the title around the search phrase in QUERY so people searching it find us, and make the title state the plan and the payoff. Max 70 chars.
- FORMAT decides the shape (FORMAT RULES). Commit to it; it is the joke engine.
- Never write peso amounts or prices unless a BUDGET block is given, and then only the numbers in it.
- meme: two caption lines for a photo meme of the first pick, max 60 chars each (count them; shorter is funnier). top sets it up, bottom lands the punchline. Both must make sense on a photo of that place.
- slug: 3–6 lowercase complete words joined by hyphens, readable, with the topic words (like "500-peso-intramuros-challenge"). No dates.
- hook: one line, max 120 chars. body: 40–90 words that deliver the format's payoff and end with a nudge to go.
- picks: choose only from PLACES by slug. "why" = one specific, funny line from that place's facts, max 110 chars.
Return JSON only: {"title": string, "slug": string, "hook": string, "body": string, "meme": {"top": string, "bottom": string}, "picks": [{"slug": string, "why": string, "tier"?: "S"|"A"|"B", "time"?: string}], "clues"?: [string, string, string], "items"?: string[]}`;

  const topicLines =
    topic.kind === "trend"
      ? [`TOPIC: ${topic.trend.title} (trending now on ${topic.trend.source})`, `QUERY: ${topic.trend.query}`]
      : [`TOPIC: no safe trend fits today, so use the top gala search for the area`, `QUERY: ${topic.query}`];
  const user = [
    `DATE: ${date}`,
    ...topicLines,
    `FORMAT: ${spec.name} (${spec.picks} picks)`,
    `FORMAT RULES: ${spec.brief}`,
    `STICKER: ${spec.sticker({ cap: budget?.cap ?? null, area: areaName })}`,
    `AREA: ${areaName} (all PLACES are here; frame the post for ${areaName})`,
    weather ? `WEATHER: ${weather}` : null,
    `DAY: ${day}`,
    budget ? `BUDGET: ₱${budget.cap} (only the priced places below; their budgets must add up to ₱${budget.cap} or less)` : null,
    "PLACES (slug | name | category, city | budget | fame | facts):",
    ...places.map((place) =>
      [
        place.slug,
        place.name,
        `${place.category}, ${place.city}`,
        place.budgetMin === null ? "budget unknown" : `from ${peso(place.budgetMin)}`,
        icons.has(place.slug) ? "ICON" : gems.has(place.slug) ? "UNDERRATED" : "-",
        place.summary,
      ].join(" | "),
    ),
    editorNotes ? `EDITOR NOTES ON THE LAST DRAFT (fix these): ${editorNotes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return { system, user };
}

export type ValidationContext = {
  topic: TodayTopic;
  format: FormatId;
  places: TodayPlace[];
  areaName: string;
  weather: string | null;
  budget: { cap: number } | null;
  date: string;
  now: Date;
  takenSlugs?: Set<string>;
};

export type ValidationResult = { ok: true; post: GalaTodayPost } | { ok: false; reason: string };

const TIER_ORDER: Tier[] = ["S", "A", "B"];

/** Turns the model's JSON into a post, or explains why it can't be published. */
export function validateDraft(raw: Record<string, unknown>, context: ValidationContext): ValidationResult {
  const { topic, format, places, areaName, weather, budget, date, now } = context;
  const spec = FORMATS[format];
  const text = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
  const list = (value: unknown) => (Array.isArray(value) ? value.map(text).filter(Boolean) : []);
  const title = text(raw.title);
  const hook = text(raw.hook);
  const body = text(raw.body);
  const memeRaw = raw.meme && typeof raw.meme === "object" ? (raw.meme as Record<string, unknown>) : {};
  const meme = { top: text(memeRaw.top), bottom: text(memeRaw.bottom) };
  const clues = list(raw.clues);
  const items = list(raw.items);
  const bySlug = new Map(places.map((place) => [place.slug, place]));
  const rawPicks = Array.isArray(raw.picks) ? raw.picks : [];
  let picks = rawPicks
    .map((pick) => (pick && typeof pick === "object" ? (pick as Record<string, unknown>) : {}))
    .map((pick) => ({ place: bySlug.get(text(pick.slug)), why: text(pick.why), tier: text(pick.tier).toUpperCase(), time: text(pick.time) }))
    .filter((pick): pick is { place: TodayPlace; why: string; tier: string; time: string } => Boolean(pick.place && pick.why))
    .filter((pick, index, all) => all.findIndex((other) => other.place.slug === pick.place.slug) === index);

  if (title.length < 10 || title.length > 80) return { ok: false, reason: "title length" };
  if (hook.length < 10 || hook.length > 140) return { ok: false, reason: "hook length" };
  const words = body.split(" ").length;
  if (words < 30 || words > 120) return { ok: false, reason: "body length" };
  if (meme.top.length < 3 || meme.top.length > 60 || meme.bottom.length < 3 || meme.bottom.length > 60) return { ok: false, reason: "meme length" };
  if (meme.top.toLowerCase() === meme.bottom.toLowerCase()) return { ok: false, reason: "meme lines repeat" };
  if (picks.length < spec.picks) return { ok: false, reason: `needs ${spec.picks} valid picks` };
  picks = picks.slice(0, spec.picks);
  if (picks.some((pick) => pick.why.length > 130)) return { ok: false, reason: "why length" };

  // The topic's real search phrasing must be in the title, so the post can rank for it.
  const titleWords = new Set(significantWords(`${title} ${text(raw.slug)}`));
  const required = topic.kind === "trend" ? significantWords(topic.trend.title).slice(0, 3) : significantWords(areaName).slice(-1);
  if (required.some((word) => !titleWords.has(word))) return { ok: false, reason: "title misses the topic" };

  // Format rules.
  if (format === "tier-list") {
    const tiers = picks.map((pick) => pick.tier);
    if (TIER_ORDER.some((tier) => tiers.filter((value) => value === tier).length !== 1)) return { ok: false, reason: "tier list needs one S, one A and one B" };
    picks.sort((left, right) => TIER_ORDER.indexOf(left.tier as Tier) - TIER_ORDER.indexOf(right.tier as Tier));
  }
  if (format === "24-hours") {
    const times = picks.map((pick) => parseClock(pick.time));
    if (times.some((time) => time === null) || times.some((time, index) => index > 0 && (time ?? 0) <= (times[index - 1] ?? 0))) {
      return { ok: false, reason: "24 hours needs ordered times" };
    }
  }
  if (format === "guess-the-place") {
    if (clues.length !== 3 || clues.some((clue) => clue.length < 8 || clue.length > 100)) return { ok: false, reason: "guess needs 3 clues" };
    const answer = picks[0].place;
    const names = [normalizeTopic(answer.name), ...significantWords(answer.name).filter((word) => word.length >= 5)];
    const said = (words: string[], where: string) => words.some((word) => word && new RegExp(`\\b${word}\\b`).test(normalizeTopic(where)));
    // The city may be in the title (it's the area); it just can't be a clue.
    if (said(names, [title, hook, body, meme.top, meme.bottom, ...clues].join(" ")) || said([normalizeTopic(answer.city)], clues.join(" "))) {
      return { ok: false, reason: "guess gives away the answer" };
    }
  }
  if (format === "starter-pack" && (items.length < 3 || items.length > 6 || items.some((item) => item.length > 40))) return { ok: false, reason: "starter pack needs 3-6 short items" };
  if (format === "pov" && !/^pov\b/i.test(meme.top)) return { ok: false, reason: "pov meme must start with POV" };
  if (format === "expectation-vs-reality" && !(/^expectation\b/i.test(meme.top) && /^reality\b/i.test(meme.bottom))) return { ok: false, reason: "expectation vs reality captions" };
  if (format === "would-you-rather" && !/^would you rather\b/i.test(meme.top)) return { ok: false, reason: "would you rather caption" };
  if (format === "gem-vs-famous") {
    const { icons, gems } = fameTiers(places);
    if (!icons.has(picks[0].place.slug) || !gems.has(picks[1].place.slug)) return { ok: false, reason: "gem vs famous needs an icon then an underrated pick" };
  }

  // Money: every peso amount must come from the places' own budgets (and the code-computed totals).
  let budgetResult: { cap: number; total: number } | undefined;
  const allowed = new Set(picks.map((pick) => pick.place.budgetMin).filter((value): value is number => value !== null));
  if (format === "budget-challenge") {
    if (!budget) return { ok: false, reason: "budget challenge without budget data" };
    if (picks.some((pick) => pick.place.budgetMin === null)) return { ok: false, reason: "budget pick without a price" };
    const total = picks.reduce((sum, pick) => sum + (pick.place.budgetMin ?? 0), 0);
    if (total > budget.cap) return { ok: false, reason: "budget picks go over the cap" };
    budgetResult = { cap: budget.cap, total };
    [budget.cap, total, budget.cap - total].forEach((value) => allowed.add(value));
  }
  const allText = [title, hook, body, meme.top, meme.bottom, ...clues, ...items, ...picks.map((pick) => pick.why)].join(" ");
  const invented = pesoAmounts(allText).filter((amount) => !allowed.has(amount));
  if (invented.length > 0) return { ok: false, reason: `unbacked peso amount: ${invented.join(", ")}` };

  // Voice and safety.
  if (HEDGE_PATTERN.test(allText)) return { ok: false, reason: "hedge" };
  if (SLOP_PATTERN.test(allText)) return { ok: false, reason: "slop words" };
  if (EMOJI_PATTERN.test(`${title} ${meme.top} ${meme.bottom}`)) return { ok: false, reason: "emoji in title or meme" };
  if (/#\w/.test(allText)) return { ok: false, reason: "hashtag" };
  if (!isSafeTrend(allText)) return { ok: false, reason: "unsafe topic" };
  if (UNKIND_PATTERN.test(allText)) return { ok: false, reason: "unkind or religious joke" };
  if (tagalogGrammarCount(allText) > 3) return { ok: false, reason: "too much Tagalog grammar" };
  const facts = picks.map((pick) => `${pick.place.name} ${pick.place.summary}`).join(" ");
  const unbacked = unbackedSuperlatives(allText, facts);
  if (unbacked.length > 0) return { ok: false, reason: `unbacked claim: ${unbacked.join(", ")}` };

  const lead = [...picks].sort((left, right) => right.place.score - left.place.score)[0].place;
  const slug = uniqueSlug(cleanSlug(text(raw.slug), title), date, context.takenSlugs ?? new Set());
  return {
    ok: true,
    post: {
      slug,
      date,
      publishedAt: now.toISOString(),
      format,
      sticker: spec.sticker({ cap: budget?.cap ?? null, area: areaName }),
      title,
      hook,
      body,
      meme,
      topic:
        topic.kind === "trend"
          ? { kind: "trend", title: topic.trend.title, query: topic.trend.query, source: topic.trend.source, url: topic.trend.url }
          : { kind: "evergreen", title: topic.query, query: topic.query, source: null, url: null },
      weather,
      area: areaName,
      leadSlug: format === "guess-the-place" ? picks[0].place.slug : lead.slug,
      picks: picks.map(({ place, why, tier, time }) => ({
        slug: place.slug,
        name: place.name,
        city: place.city,
        canonicalPath: place.canonicalPath,
        why,
        budgetMin: place.budgetMin,
        ...(format === "tier-list" ? { tier: tier as Tier } : {}),
        ...(format === "24-hours" ? { time } : {}),
      })),
      ...(budgetResult ? { budget: budgetResult } : {}),
      ...(format === "guess-the-place" ? { clues } : {}),
      ...(format === "starter-pack" ? { items } : {}),
    },
  };
}

export type EditorScores = { funny: number; purpose: number; accuracy: number; natural: number; safe: number };

/** The second pass: a strict editor scores the draft before anything is published. */
export function buildEditorPrompt(post: GalaTodayPost, places: TodayPlace[]) {
  const facts = post.picks
    .map((pick) => places.find((place) => place.slug === pick.slug))
    .filter((place): place is TodayPlace => Boolean(place))
    .map((place) => `- ${place.name} (${place.category}, ${place.city}; ${place.budgetMin === null ? "budget unknown" : `from ${peso(place.budgetMin)}`}): ${place.summary}`);
  const system = `You are the toughest editor at a viral travel brand. Score this "Gala Today" post from 1 to 10 on each line. Be strict: 8 means you would proudly post it today; average AI copy is a 5.
- funny: would a stranger smile or laugh? Generic or forced jokes score 5 or less.
- purpose: can a reader tell in 2 seconds what to do today and why? Vague posts score 5 or less.
- accuracy: every claim is backed by FACTS, picks fit WEATHER (if given), nothing invented.
- natural: reads like a native English speaker with light, correct Filipino words. Awkward or machine-made Taglish scores 4 or less.
- safe: 10 unless it touches politics, religion jokes, tragedy, crime, body shaming, stereotypes, punching down, private people, gossip or brand mockery.
Return JSON only: {"funny": number, "purpose": number, "accuracy": number, "natural": number, "safe": number, "fix": string (the one change that would most improve it, max 200 chars)}`;
  const user = [
    `FORMAT: ${FORMATS[post.format].name}`,
    `TOPIC: ${post.topic.title}`,
    post.weather ? `WEATHER: ${post.weather}` : null,
    `TITLE: ${post.title}`,
    `HOOK: ${post.hook}`,
    `MEME: ${post.meme.top} / ${post.meme.bottom}`,
    `BODY: ${post.body}`,
    post.clues ? `CLUES: ${post.clues.join(" | ")}` : null,
    post.items ? `ITEMS: ${post.items.join(" | ")}` : null,
    post.budget ? `BUDGET: ₱${post.budget.cap} cap, ₱${post.budget.total} total` : null,
    "PICKS:",
    ...post.picks.map((pick) => `- ${pick.tier ? `[${pick.tier}] ` : ""}${pick.time ? `${pick.time} ` : ""}${pick.name}: ${pick.why}`),
    "FACTS:",
    ...facts,
  ]
    .filter(Boolean)
    .join("\n");
  return { system, user };
}

/** Publish only when funny, purpose, accuracy and natural are all ≥ 8 and safety is ≥ 9. */
export function parseEditorReview(raw: Record<string, unknown> | null): { pass: boolean; scores: EditorScores | null; fix: string } {
  if (!raw) return { pass: false, scores: null, fix: "Editor reply was unreadable." };
  const score = (value: unknown) => (typeof value === "number" && value >= 1 && value <= 10 ? value : typeof value === "string" && /^\d+(\.\d+)?$/.test(value) ? Number(value) : 0);
  const scores: EditorScores = { funny: score(raw.funny), purpose: score(raw.purpose), accuracy: score(raw.accuracy), natural: score(raw.natural), safe: score(raw.safe) };
  const pass = scores.funny >= 8 && scores.purpose >= 8 && scores.accuracy >= 8 && scores.natural >= 8 && scores.safe >= 9;
  const fix = typeof raw.fix === "string" ? raw.fix.slice(0, 240) : "";
  return { pass, scores, fix };
}

export type { ScoredTrend, TodayTopic };
