import { mentionsDestination } from "../utils/phDestinations";

export const ASK_AI_SCOPE_REJECTION_MESSAGE =
  "GalaTayo AI will not answer this question because it does not align with the purpose of GalaTayo.";

const ADULT_SEXUAL_BLOCK_PATTERNS: RegExp[] = [
  /\b(?:18\s*\+|adult\s*(?:content|entertainment|service|services)|nsfw|xxx|porn|porno|red\s*light)\b/i,
  /\b(?:sex|sexual|sexy|hook\s*up|hookup|make\s*out|lap\s*dance|strip\s*(?:per|pers|club|clubs)?|escort|escorts|brothel|prostitut(?:e|ion)|massage\s*parlor)\b/i,
  /\b(?:is|are|was|were)\s+[\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){0,3}\s+(?:gay|lesbian|bi|bisexual|trans|bakla|tomboy)\b/iu,
  /\b[\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){0,3}\s+(?:is|was|are|were)\s+(?:gay|lesbian|bi|bisexual|trans|bakla|tomboy)\b/iu,
  /\b(?:gay|lesbian|bi|bisexual|trans|bakla|tomboy)\s+(?:ba\s+)?(?:si|sina|yung|ung)\s+[\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){0,3}\b/iu,
];

export type AskAiStrictPgGuardResult = {
  accepted: boolean;
  blockedPattern?: string;
};

export function normalizeAskAiPromptForStrictPgGuard(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/([!?.,])\1{2,}/g, "$1$1")
    .replace(/([a-z])\1{3,}/gi, "$1$1")
    .replace(/\s+/g, " ")
    .trim();
}

// Words that make a message clearly about going out, in English, Tagalog or Taglish.
const OUTING_PATTERN =
  /\b(gala|galaan|lakad|lakwatsa|pasyal|pasyalan|gimik|tambay|tumambay|tambayan|hangout|hang out|chill|date|barkada|tropa|family|pamilya|kids|trip|travel|byahe|biyahe|vacation|bakasyon|staycation|weekend|holiday|itinerary|plan|plano|budget|mura|cheap|sulit|libre|commute|jeep|jeepney|mrt|lrt|bus|grab|taxi|ferry|flight|airport|parking|directions?|route|papunta|malapit|near|nearby|saan|san ba|where|places?|lugar|spots?|puntahan|visit|explore|food|foodtrip|kain|kainan|kakain|eat|restaurants?|resto|cafes?|coffee|kape|milk ?tea|dessert|breakfast|brunch|lunch|dinner|merienda|buffet|samgyup|ramen|bars?|inuman|drinks|clubs?|ktv|karaoke|nightlife|museums?|parks?|beach|resorts?|hotels?|malls?|cinema|sine|movies?|hike|hiking|mountain|falls|island|camping|sunset|sunrise|rooftop|rain|rainy|ulan|umuulan|maulan|indoor|outdoor|aircon|weather|arcade|bowling|activit(?:y|ies)|church|heritage|tour|shopping|market|palengke|picnic|swimming|pool)\b/i;

const FILLER_PATTERN = /^(hi|hello|hey|yo|kumusta|musta|thanks|thank you|salamat|ok|okay|sige|gets|ayos|noted|nice|cool|tara|go)\b[\s!.?,a-z]*$/i;

// Requests that are clearly not about outings when nothing outing-related is mentioned.
const UNRELATED_PATTERN = /\b(code|coding|python|javascript|typescript|sql|essay|homework|assignment|thesis|equation|poem|lyrics|resume|capital of|president of|translate)\b/i;
const MATH_ONLY_PATTERN = /^[\d\s+\-*/().=x^%?]+$/i;
const AREA_NICKNAME_PATTERN = /\b(qc|bgc|moa|poblacion|maginhawa|cubao|ortigas|eastwood|intramuros|binondo|kapitolyo|alabang|tagaytay)\b/i;

export type AskAiScopeDecision = "allow" | "block" | "unsure";

/**
 * Cheap first pass before any model call. "allow" skips the model guard for plainly
 * outing-related messages (including Taglish), "block" refuses clear off-topic or unsafe ones,
 * and "unsure" leaves the call to the model guard.
 */
export function classifyAskAiScope(message: string): AskAiScopeDecision {
  const text = normalizeAskAiPromptForStrictPgGuard(message);
  if (!evaluateAskAiStrictPgGuard(text).accepted) return "block";
  if (MATH_ONLY_PATTERN.test(text)) return "block";

  const aboutOuting = OUTING_PATTERN.test(text) || AREA_NICKNAME_PATTERN.test(text) || mentionsDestination(text);
  const unrelated = UNRELATED_PATTERN.test(text);
  if (unrelated) return aboutOuting ? "unsure" : "block";
  if (aboutOuting) return "allow";
  if (text.split(/\s+/).length <= 4 && FILLER_PATTERN.test(text)) return "allow";
  return "unsure";
}

export function evaluateAskAiStrictPgGuard(
  message: string
): AskAiStrictPgGuardResult {
  const normalizedMessage = normalizeAskAiPromptForStrictPgGuard(message);
  const blockedPattern = ADULT_SEXUAL_BLOCK_PATTERNS.find((pattern) =>
    pattern.test(normalizedMessage)
  );

  if (blockedPattern) {
    return {
      accepted: false,
      blockedPattern: blockedPattern.source,
    };
  }

  return {
    accepted: true,
  };
}
