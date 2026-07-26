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
