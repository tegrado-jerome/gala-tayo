// Pure rules for "Gala Today": the daily creator-style post that turns what's hot into a plan to go out.
// No network or AI here, so the rules that keep posts funny, safe and honest are unit-tested.
import { isSafePostText, normalizeTopic, type ScoredTrend, type TodayTopic } from "./galaTodaySignals";

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

type FormatSpec = {
  name: string;
  picks: 2 | 3;
  sticker: (context: { cap: number | null; area: string }) => string;
  brief: string;
  /** Gold-standard lines in the owner's voice, from real GalaTayo facts (Oct 2026). The bar to beat, never to copy. */
  examples: string[];
};

export const FORMATS: Record<FormatId, FormatSpec> = {
  "budget-challenge": {
    name: "Budget challenge",
    picks: 3,
    sticker: ({ cap }) => `₱${(cap ?? 0).toLocaleString("en-PH")} Challenge`,
    brief:
      "A whole day out under BUDGET. Use only places with a price in PLACES; their starting budgets must add up to BUDGET or less. Mention the cap and the total (TOTAL is computed for you, use those exact numbers), and make the money math part of the fun (the leftover change, the 'still enough for merienda').",
    examples: [
      'Title "₱300 Challenge: Three Manila Icons, ₱75 Spent" | hook "We gave ourselves ₱300 for a Manila day. We came home with ₱225 and a Spoliarium selfie!" | meme "Me with ₱300 and a whole day in Manila" / "Me at 6 PM with ₱225 left and zero regrets" | why (National Museum of Fine Arts) "Free entry, air-con and Juan Luna\'s Spoliarium. The flex costs nothing!"',
      'Title "₱300 Day in Cebu: Waterfall, Sardines, Change Left" | hook "A milky-blue waterfall and millions of sardines for under ₱300? Watch the math!" | meme "Spent ₱200 on a waterfall and a sardine swim" / "The leftover ₱100 is going to dinner"',
    ],
  },
  "24-hours": {
    name: "24 hours in the area",
    picks: 3,
    sticker: ({ area }) => `24 Hours in ${area}`,
    brief: "A morning-to-night plan. Give every pick a 'time' like \"8 AM\", \"1 PM\", \"6 PM\" in order. Each stop is a beat in a mini story with a payoff at night.",
    examples: [
      'Title "24 Hours in Manila: Dumplings, Masterpieces, Sunset on the Walls" | hook "Breakfast in one of the oldest Chinatowns in the world, sunset on the Intramuros walls. One day, zero wasted hours!" | 8 AM Binondo "Dumplings and hopia before the lunch crowd. Pace yourself!" | 5 PM Intramuros "A slow sunset walk on the walls. The credits roll here."',
      'meme "8 AM: just one dumpling" / "11 AM: why are we still in Ongpin" | body beat "By lunch you\'ve met Juan Luna\'s Spoliarium in free air-con, and the day is only half done!"',
    ],
  },
  "would-you-rather": {
    name: "Would you rather",
    picks: 2,
    sticker: () => "Would You Rather",
    brief: "Exactly 2 picks, two very different days out. meme.top starts with \"Would you rather\". The body makes the case for both like a friendly debate; the reader should want to vote.",
    examples: [
      'meme "Would you rather swim with a cloud of sardines" / "or ride a bamboo raft under a turquoise waterfall?" | hook "Moalboal or Kawasan? Your group chat has one hour to decide!"',
      'meme "Would you rather walk under sharks" / "or stand face to face with the Spoliarium?" | why (Manila Ocean Park) "A 25-meter glass tunnel where sharks swim over your head. Zero umbrella needed!"',
    ],
  },
  "tier-list": {
    name: "Tier list",
    picks: 3,
    sticker: () => "Tier List",
    brief: "Rank the 3 picks S, A and B (one each) in each pick's 'tier'. Every 'why' is a funny, specific reason for its rank; B tier is still a compliment (it lost to the other two, not to anyone else).",
    examples: [
      'Title "Rainy Day Activities in Metro Manila: The Official Tier List" | meme "Ranking Manila\'s rainy-day spots" / "The sharks took the A rank personally"',
      'S (The Mind Museum) "More than 250 hands-on exhibits. You came for the kids, you stayed for the planetarium." | B (Art in Island) "Still a win. It only lost because you have to share the camera."',
    ],
  },
  "guess-the-place": {
    name: "Guess the place",
    picks: 3,
    sticker: () => "Guess the Place",
    brief: "The FIRST pick is the answer. Give 3 'clues' (max 100 chars each) from its facts, easy to hard-but-fair, never naming it or its city. Never name the answer in the title, hook, body or meme (only in picks). The other 2 picks are nearby bonus stops.",
    examples: [
      'Title "Guess the Place: Bohol\'s Most Famous View in 3 Clues" (only because the facts call it that) | clues "Its name comes from a color it only turns in the dry months." / "Local legend blames two feuding giants." / "You climb stairs to a viewing deck for the classic shot." | meme "This view is named after a snack" / "Guess it before you scroll!"',
      'clues "Free entry, free air-con." / "It sits in a grand old building where lawmakers once met." / "A giant Juan Luna painting waits inside."',
    ],
  },
  "starter-pack": {
    name: "Starter pack",
    picks: 3,
    sticker: () => "Starter Pack",
    brief: "The starter pack for the topic's kind of outing. Give 3–6 'items' (max 40 chars each): the relatable things you bring or do (the extra shirt, the 'one more photo'). Then the 3 picks are where to use the pack.",
    examples: [
      'Title "Moalboal Weekend Starter Pack: Sardines, Falls and Sun" | items "Mask and fins" / "A dry shirt for the ride home" / "A friend who films underwater" / "Zero plans after 6 PM" | meme "The Moalboal starter pack" / "Your camera roll is not ready"',
      'items "An empty stomach" / "Small bills" / "Comfy walking shoes" | why (Binondo) "Founded in 1594 and still serving dumplings. Your stomach has a schedule today."',
    ],
  },
  pov: {
    name: "POV",
    picks: 3,
    sticker: () => "POV",
    brief: "meme.top starts with \"POV:\" and puts the reader inside a funny, relatable moment tied to the topic. The picks are where that POV happens.",
    examples: [
      'Title "Rainy Day Activities in Metro Manila: 3 Indoor Wins" | hook "Rain outside? Perfect. These three spots were made for this weather!" | meme "POV: the rain cancels your outdoor plans" / "and you end up inside a 3D painting instead"',
      'meme "POV: you swim a few meters off the beach" / "and millions of sardines swim around you" | why (Moalboal Sardine Run) "No boat needed. The sardines come to you!"',
    ],
  },
  "expectation-vs-reality": {
    name: "Expectation vs reality",
    picks: 3,
    sticker: () => "Expectation vs Reality",
    brief: "meme.top starts with \"Expectation:\" and meme.bottom with \"Reality:\". The reality is the funny, BETTER-than-planned truth (you stayed all afternoon, the camera roll exploded), never a complaint about the place.",
    examples: [
      'meme "Expectation: a quick museum stop" / "Reality: you are still in the Spoliarium hall at 4 PM" | why (National Museum of Fine Arts) "Too big to see in one go, so the plan was always a lie. Free entry, though!"',
      'meme "Expectation: one photo on Calle Crisologo" / "Reality: you came back at night for the lamps" | hook "Vigan\'s cobblestone street has two moods, and you will want both!"',
    ],
  },
  "main-character": {
    name: "Main character moments",
    picks: 3,
    sticker: () => "Main Character Moments",
    brief: "Each pick is a 'main character moment': the exact spot or time where you feel like the lead of a movie, from the facts. Cinematic and a little dramatic, in a fun way.",
    examples: [
      'meme "Me walking the Intramuros walls at sunset" / "The soundtrack is playing in my head" | why (National Museum of Natural History) "Standing under the Tree of Life\'s glass dome like it\'s your opening scene."',
      'hook "Three spots where you are the lead of the movie and the extras are sharks!" | why (White Beach) "The sunset walk while paraw sailboats glide past. Cue the slow motion."',
    ],
  },
  "gem-vs-famous": {
    name: "Hidden gem vs the famous one",
    picks: 2,
    sticker: () => "Hidden Gem vs The Famous One",
    brief: "Exactly 2 picks: first an ICON from PLACES, then an UNDERRATED one. Respect both: the icon is famous for a reason, the underrated one is the friend who deserves more credit.",
    examples: [
      'meme "Everyone knows Intramuros" / "Fewer people know this museum next door" | hook "One famous, one underrated. Do both and win the day!"',
      'why (icon) "Famous for a reason: a whole walled city, not just one spot." | why (underrated) "The friend who deserves more credit, with free air-con as a bonus."',
    ],
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

const STOPWORDS = new Set(["the", "a", "an", "in", "of", "and", "for", "to", "vs", "on", "at", "with", "your", "my", "is", "are", "this", "ng", "sa", "ang", "mga"]);
// Long enough for place names like "Surigao del Norte" (6 words cut "things to do in surigao del").
const MAX_SLUG_WORDS = 8;
const significantWords = (text: string) => normalizeTopic(text).split(" ").filter((word) => word.length >= 3 && !STOPWORDS.has(word));

/** A clean, readable slug of 3–8 complete words. Uses the model's slug when it's clean, else whole words of the title. */
export function cleanSlug(raw: string, title: string): string {
  const fromRaw = normalizeTopic(raw).split(" ").filter(Boolean);
  if (fromRaw.length >= 3 && fromRaw.length <= MAX_SLUG_WORDS) return fromRaw.join("-");
  const words = normalizeTopic(title).split(" ").filter(Boolean).slice(0, MAX_SLUG_WORDS);
  while (words.length > 3 && STOPWORDS.has(words[words.length - 1])) words.pop();
  return words.join("-") || "gala-today";
}

/** A unique slug: the clean slug, with the date added only when it's already taken. */
export function uniqueSlug(slug: string, date: string, taken: Set<string>): string {
  if (!taken.has(slug)) return slug;
  const dated = `${slug}-${date}`;
  return taken.has(dated) ? `${dated}-2` : dated;
}

// Posts are English only. Tagalog grammar words and slang give Taglish away; one is allowed for the "Gala tayo" tagline.
const TAGALOG_WORDS = ["ang", "ng", "mga", "sa", "pa", "rin", "din", "kahit", "pero", "lang", "naman", "ba", "yung", "ito", "kasi", "talaga", "mo", "ko", "niya", "nila", "natin", "tayo", "kayo", "tara", "sulit", "barkada", "tropa", "kilig", "chika", "sukli", "lakad", "na"];

/** Tagalog words in the text, except ones the place facts use themselves (names like "Bahay na Bato"). */
export function tagalogWordCount(text: string, facts = ""): number {
  const inFacts = new Set(normalizeTopic(facts).split(" "));
  return normalizeTopic(text).split(" ").filter((word) => TAGALOG_WORDS.includes(word) && !inFacts.has(word)).length;
}

// "Check" alone is too broad: "long after the check arrives" is a restaurant bill, not a hedge.
const HEDGE_PATTERN = /\b(check (ahead|first|before|again|the (hours|schedule|website|page|status))|double-check|confirm|verify|call ahead|subject to change|may change|may vary|be sure to)\b/i;
const SLOP_PATTERN = /\b(unlock|elevate|seamless|delve|tapestry|game-changer|look no further|whether you're|whether you are|hidden gems? await|nestled|embark|vibrant|make (some )?memories|rain or shine|your ticket to|level up|don't let|epic)\b/i;
// "100% chance", "50 percent": raw percentages are never part of a post.
const PERCENT_PATTERN = /\d\s?%|\bpercent\b/i;
// Never the butt of a joke: bodies, intelligence, class, faith.
const UNKIND_PATTERN = /\b(fat|fatty|ugly|stupid|idiot|dumb|bobo|tanga|pangit|jologs|squammy|skwater|cheapskate|god|jesus|bible|devil|demon|hell|pray|praying|prayer|holy)\b/i;
const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;

// Claims the model may only make when the place's own facts already say them.
const SUPERLATIVES = ["biggest", "largest", "oldest", "the first", "the only", "best", "most", "highest", "longest", "tallest", "grandest", "greatest", "finest",
  "coolest", "cutest", "prettiest", "cleanest", "clearest", "coziest", "chillest", "wildest", "craziest", "tastiest", "freshest",
  "cheapest", "easiest", "ultimate", "legendary", "world-class", "world-famous", "#1", "number one"];

/** Superlatives in the text that none of the picked places' facts back up. */
export function unbackedSuperlatives(text: string, facts: string): string[] {
  const lowerFacts = facts.toLowerCase();
  return SUPERLATIVES.filter((word) => new RegExp(`(^|\\W)${word.replace("#", "\\#")}(\\W|$)`, "i").test(text) && !lowerFacts.includes(word));
}

/**
 * Numbers above 10 that the facts don't contain ("400 photos", "3,000 steps"). Peso amounts and clock times are
 * checked elsewhere; small counts ("3 stops", "2 picks") are just structure.
 */
export function unbackedNumbers(text: string, facts: string): string[] {
  const factNumbers = new Set((facts.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((value) => value.replace(/,/g, "")));
  const stripped = text
    .replace(/(?:₱|\bphp\s?|\bp(?=\d))\s?[\d,.]+(\s?k\b)?/gi, " ")
    .replace(/\b[\d,]+(\s?k)?\s?(?:pesos?|php)\b/gi, " ")
    .replace(/\b\d{1,2}(?::\d{2})?\s?(?:am|pm|nn|noon)\b/gi, " ");
  return (stripped.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((value) => value.replace(/,/g, "")).filter((value) => Number(value) > 10 && !factNumbers.has(value));
}

/** True when the text pastes 12+ words in a row from the facts ("air-con" and "Luna's" count as two), not a twist in the writer's words. */
export function copiesFacts(text: string, facts: string, run = 12): boolean {
  const words = normalizeTopic(text).split(" ");
  const source = ` ${normalizeTopic(facts)} `;
  for (let start = 0; start + run <= words.length; start += 1) {
    if (source.includes(` ${words.slice(start, start + run).join(" ")} `)) return true;
  }
  return false;
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
  /** The last draft's JSON, revised with the notes instead of starting over (a fresh draft lost what already worked). */
  previousDraft?: string | null;
};

export function topicQuery(topic: TodayTopic) {
  return topic.kind === "trend" ? topic.trend.query : topic.query;
}

export function buildPrompt({ date, topic, format, places, areaName, weather, day, budget, editorNotes, previousDraft }: PromptInput) {
  const spec = FORMATS[format];
  const { icons, gems } = fameTiers(places);
  const system = `You are the head writer of "Gala Today" on GalaTayo, an app of famous, gala-worthy places in the Philippines. Each post is a scroll-stopper in the style of the best travel creators on TikTok and Instagram: one big idea a stranger gets in 2 seconds, a twist that makes them smile, and a plan to go out TODAY to real places.

VOICE
- Simple, lively English that Filipinos and foreign tourists both get at once, like your funniest friend who knows every spot. Exclamation points are welcome.
- English only. No Tagalog or Taglish at all (no "gala tayo", tara, sulit, barkada, kilig, chika). Place names and food names (merienda, halo-halo, hopia) are the only exceptions.
- Hooks like top creators: open with a specific detail, a contrast, a challenge or a curiosity gap from the facts ("Free entry, air-con and the huge Spoliarium!"). Never a generic opener ("Looking for things to do?", "Explore the beauty of...").
- Short sentences. Every joke and every "why" uses a real detail from that place's facts. Humour comes from relatable truths about going out (the camera roll, the group chat that never decides, the snack stop, the budget math), surprise and playful exaggeration in words. Never from making fun of anyone.
- Comedy that works: the twist ("You came for the kids, you stayed for the planetarium"), the place reacting ("The sharks took this personally"), the honest confession ("The plan was always a lie"), the escalation ("8 AM: one dumpling. 11 AM: still in Ongpin"). Filler that kills it (and some of it gets the post thrown away): "stay completely dry", "maximum fun", "awesome spots", "epic", "unforgettable", "don't let X stop you", "make memories", "rain or shine", "level up".

HARD LIMITS (break one and the post is thrown away)
- No politics, religion or religious jokes, tragedy, crime, disasters, illness, body shaming, stereotypes about any group or place, punching down, real private people, gossip, or mocking any brand or business. Celebrities and shows only as a friendly nod.
- Facts only from PLACES. Never invent prices, hours, distances, travel times, events, menus, awards, rankings, opening days, or exhibits, animals and dishes the facts don't name. Never upgrade a fact: a MICHELIN Guide listing is not a Michelin star, "one of the largest" is not "the largest".
- Every number must appear in that place's facts (or the BUDGET block). No made-up counts ("400 photos"), no percentages, no "100% chance".
- Superlatives and hype (best, biggest, most, oldest, first, only, coolest, ultimate, legendary, #1) only when that place's facts say exactly that.
- Peso amounts only when a BUDGET block is given, and then only its numbers and the places' budgets.
- No hedges ("check", "confirm", "may change"), no hashtags, no emojis.
- When WEATHER is given, every pick must work in that weather. Light rain jokes are fine (the umbrella, the cancelled beach plan); never floods, storms or disasters.

THE POST
- TOPIC is the hook and QUERY is what people search. The title states the plan and the payoff, contains the QUERY words once, naturally, and stays under 70 characters. Don't repeat the QUERY in the meme or hook; they talk like people.
- Times of day and days must fit each place's facts and DAY (no "until midnight" unless the facts say it; a place best on weekends isn't tonight's pick on a Tuesday).
- If a place's facts don't mention the topic, never claim it has it: link by vibe ("same energy", "your post-festival cooldown").
- FORMAT decides the shape (FORMAT RULES). Commit to it; it is the joke engine. GOLD EXAMPLES show the bar: match their energy and specificity with today's places, never copy their lines.
- meme: two caption lines for a photo meme of the first pick, max 60 chars each (count them; shorter is funnier). top sets it up, bottom lands the punchline. Both must make sense on a photo of that place.
- slug: 3–8 lowercase complete words joined by hyphens, readable, with the topic words (like "rainy-day-manila-museum-wins"). No dates.
- hook: one line, max 120 chars. body: 40–90 words that deliver the format's payoff, give each pick one concrete detail from its facts, and end with a clear nudge to go today.
- picks: only from PLACES, by their exact slug. "why" = a real detail plus a twist, in your own words, max 110 chars ("A 25-meter glass tunnel where sharks swim over your head. Zero umbrella needed!"). Never paste a sentence from the facts.
- meme.bottom is a punchline (a twist, a confession, a reaction), never a plain description.
- Before you answer, check every line: is each fact, number, time and day in FACTS and DAY? Any superlative? Is the hook a specific, funny detail a stranger would stop for?
Return JSON only: {"title": string, "slug": string, "hook": string, "body": string, "meme": {"top": string, "bottom": string}, "picks": [{"slug": string, "why": string, "tier"?: "S"|"A"|"B", "time"?: string}], "clues"?: [string, string, string], "items"?: string[]}`;

  const topicLines =
    topic.kind === "trend"
      ? [`TOPIC: ${topic.trend.title} (trending now on ${topic.trend.source})`, `QUERY: ${topic.trend.query}`]
      : [`TOPIC: ${topic.note ?? `a day out in ${areaName}`}`, `QUERY: ${topic.query}`];
  const user = [
    `DATE: ${date}`,
    ...topicLines,
    `FORMAT: ${spec.name} (${spec.picks} picks)`,
    `FORMAT RULES: ${spec.brief}`,
    `GOLD EXAMPLES (other days and places):`,
    ...spec.examples.map((example) => `- ${example}`),
    `STICKER: ${spec.sticker({ cap: budget?.cap ?? null, area: areaName })}`,
    `AREA: ${areaName} (all PLACES are a day trip apart; frame the post for ${areaName})`,
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
    previousDraft ? `PREVIOUS DRAFT (revise it: keep what works, rewrite what the notes name): ${previousDraft}` : null,
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
  // Models sometimes return the place name instead of its slug; both point to the same real place.
  const bySlug = new Map(places.flatMap((place) => [[place.slug, place], [normalizeTopic(place.name), place]] as Array<[string, TodayPlace]>));
  const rawPicks = Array.isArray(raw.picks) ? raw.picks : [];
  let picks = rawPicks
    .map((pick) => (pick && typeof pick === "object" ? (pick as Record<string, unknown>) : {}))
    .map((pick) => ({ place: bySlug.get(text(pick.slug)) ?? bySlug.get(normalizeTopic(text(pick.slug))) ?? bySlug.get(normalizeTopic(text(pick.name))), why: text(pick.why), tier: text(pick.tier).toUpperCase(), time: text(pick.time) }))
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
  if (format === "would-you-rather" && (!/^would you rather\b/i.test(meme.top) || !/\bor\b/i.test(`${meme.top} ${meme.bottom}`))) return { ok: false, reason: "would you rather caption" };
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
  if (!isSafePostText(allText)) return { ok: false, reason: "unsafe topic" };
  if (UNKIND_PATTERN.test(allText)) return { ok: false, reason: "unkind or religious joke" };
  if (PERCENT_PATTERN.test(allText)) return { ok: false, reason: "raw percentage" };
  const facts = picks.map((pick) => `${pick.place.name} ${pick.place.city} ${pick.place.summary}`).join(" ");
  if (tagalogWordCount(allText, facts) > 0) return { ok: false, reason: "not in English" };
  const unbacked = unbackedSuperlatives(allText, facts);
  if (unbacked.length > 0) return { ok: false, reason: `unbacked claim: ${unbacked.join(", ")}` };
  if (picks.some((pick) => copiesFacts(pick.why, pick.place.summary)) || copiesFacts(body, facts)) return { ok: false, reason: "copied facts" };
  const numbers = unbackedNumbers(allText, `${facts} ${spec.sticker({ cap: budget?.cap ?? null, area: areaName })} ${topicQuery(topic)} ${topic.kind === "trend" ? topic.trend.title : ""}`);
  if (numbers.length > 0) return { ok: false, reason: `unbacked number: ${numbers.join(", ")}` };

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

/**
 * The second pass: a strict editor scores the draft against the same brief the writer had, before anything is
 * published. It gets the topic, format rules and every pick's facts, so it judges the post, not missing context.
 */
export function buildEditorPrompt(post: GalaTodayPost, places: TodayPlace[], topicNote: string | null = null, day: string | null = null) {
  const facts = post.picks
    .map((pick) => places.find((place) => place.slug === pick.slug))
    .filter((place): place is TodayPlace => Boolean(place))
    .map((place) => `- ${place.name} (${place.category}, ${place.city}; ${place.budgetMin === null ? "budget unknown" : `from ${peso(place.budgetMin)}`}): ${place.summary}`);
  const system = `You are the toughest editor at a viral Philippine travel brand. "Gala Today" is a daily scroll-stopper that gets people to go out today to real, famous places, in simple, lively English for locals and tourists. Score this post from 1 to 10 on each line, judged against THE BRIEF below. 8 means you would proudly post it today; generic AI copy is a 5.
- funny: would a stranger smile? A clever, specific twist from a real detail scores 8+; it doesn't need to be a stand-up joke. Generic or forced jokes (a trend jammed onto unrelated places) score 5 or less.
- purpose: can a reader tell in 2 seconds what to do today, where, and why? Vague posts score 5 or less.
- accuracy: every claim and number is backed by FACTS, times of day and days fit FACTS and DAY (a place best "Thursday to Saturday" in a Tuesday plan is a miss; so is "until midnight" when FACTS don't say it), and the picks fit WEATHER (if given). Only penalize what contradicts or goes beyond FACTS; things FACTS don't cover (opening hours, tickets) are not the post's job. Playful exaggeration in words ("your camera roll explodes") is a joke, not a claim.
- natural: reads like a lively native English speaker who knows the places. Any Tagalog or Taglish phrase scores 4 or less; place names and food names (merienda, halo-halo) are English here.
- safe: 10 unless it touches politics, religion jokes, tragedy, crime, body shaming, stereotypes, punching down, private people, gossip or brand mockery.
THE BRIEF: hook from a real detail; title with the search words; FORMAT used as the joke engine; no invented facts, numbers or superlatives; English only; no hashtags or emojis. All picks are within one day-trip AREA by design, so never penalize the distance between them.
First list every factual claim FACTS don't support in "unbacked" (a feature, award, number, animal, dish, time or day that FACTS never mention, or a stronger version of a fact: "Michelin-starred" when FACTS say "listed in the MICHELIN Guide"). Jokes and obvious exaggeration in words are not claims. Then score.
Return JSON only: {"unbacked": string[], "funny": number, "purpose": number, "accuracy": number, "natural": number, "safe": number, "fix": string (the one change that would most improve it, max 200 chars)}`;
  const user = [
    `FORMAT: ${FORMATS[post.format].name}: ${FORMATS[post.format].brief}`,
    `TOPIC: ${topicNote ?? post.topic.title} (search words: ${post.topic.query})`,
    `AREA: ${post.area}`,
    day ? `DAY: ${day}` : null,
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

/**
 * Publish only when funny, purpose, accuracy and natural are all ≥ 8, safety is ≥ 9 and the editor found no claim
 * the facts don't back. (Scores alone let "Michelin-starred" and museum dinosaurs through with accuracy 10.)
 */
export function parseEditorReview(raw: Record<string, unknown> | null): { pass: boolean; scores: EditorScores | null; fix: string } {
  if (!raw) return { pass: false, scores: null, fix: "Editor reply was unreadable." };
  const score = (value: unknown) => (typeof value === "number" && value >= 1 && value <= 10 ? value : typeof value === "string" && /^\d+(\.\d+)?$/.test(value) ? Number(value) : 0);
  const scores: EditorScores = { funny: score(raw.funny), purpose: score(raw.purpose), accuracy: score(raw.accuracy), natural: score(raw.natural), safe: score(raw.safe) };
  const unbacked = (Array.isArray(raw.unbacked) ? raw.unbacked : []).filter((claim): claim is string => typeof claim === "string" && claim.trim().length > 0);
  const pass = unbacked.length === 0 && scores.funny >= 8 && scores.purpose >= 8 && scores.accuracy >= 8 && scores.natural >= 8 && scores.safe >= 9;
  const note = typeof raw.fix === "string" ? raw.fix : "";
  const fix = (unbacked.length ? `Remove or fix claims FACTS don't back: ${unbacked.join("; ")}. ${note}` : note).slice(0, 400);
  return { pass, scores, fix };
}

export type { ScoredTrend, TodayTopic };
