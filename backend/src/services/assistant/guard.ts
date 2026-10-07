import { classifyAskAiScope } from "../../functions/askAiStrictPgGuard";

// Phrases that try to steer the model instead of asking about a gala.
const INJECTION_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(instructions?|rules?|prompt|guidelines|above|previous)\b/i,
  /\b(system|developer)\s*(prompt|message|instructions?)\b/i,
  /^\s*(system|assistant|developer)\s*:/im,
  /<\/?\s*(data|system|instructions?|tool|context)\s*>/i,
  /\b(you are now|act as|pretend to be|roleplay as|jailbreak|DAN)\b/,
  /\b(kalimutan|huwag mong sundin|wag mong sundin)\b[^.\n]{0,40}\b(rules?|utos|instructions?|tara)\b/i,
  /\bikaw na si\b/i,
  /\b(new rule|admin (added|says)|always add|from now on)\b/i,
  /\b(print|reveal|show|repeat|leak)\b[^.\n]{0,30}\b(prompt|instructions|rules|tools?)\b/i,
];

// Schoolwork and maths the shared scope check leaves to a model; refusing them here saves a call.
const SCHOOLWORK = /\b(solve|calculate|equation|derivative|integral|algebra|calculus|homework|takdang[- ]aralin)\b/i;

export function looksLikeInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Removes contact details before text goes to a free-tier model (providers may keep free-tier prompts).
 * Places and plans never need them.
 */
export function redactPersonalData(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .replace(/(?:\+?63|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g, "[phone]")
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "[number]");
}

export type GuardDecision = { action: "answer" | "refuse"; injection: boolean };

/**
 * Cheap scope check before any model call. Clear off-topic or unsafe asks are refused here; unclear ones
 * go to the model, which is told to refuse off-topic asks. An injection attempt is not refused by itself:
 * the model answers the gala part (if any) and ignores the rest.
 */
export function guardMessage(message: string): GuardDecision {
  const injection = looksLikeInjection(message);
  const scope = classifyAskAiScope(message);
  const offTopic = scope === "block" || (scope === "unsure" && SCHOOLWORK.test(message));
  return { action: offTopic ? "refuse" : "answer", injection };
}

export function refusalText(): string {
  return "I'm all about trips and outings: places, food, dates and day trips around the Philippines! Where are you thinking of going?";
}
