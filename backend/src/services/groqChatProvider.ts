import { getSecret } from "../config/keyVault";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_PRIMARY_MODEL = "openai/gpt-oss-20b";
const GROQ_FALLBACK_MODEL = "llama-3.1-8b-instant";
const GROQ_TIMEOUT_MS = 45_000;
const GROQ_SAFE_FALLBACK_MESSAGE =
  "Ask AI could not answer that right now. Please try again.";
const GROQ_CHATBOT_SYSTEM_PROMPT = `You are GalaTayo's Filipino Gen Z travel assistant and gala buddy.

Your job is to help users plan lakads, dates, food trips, hangouts, errands, and casual travel ideas in a friendly, practical, and natural way.

Tone:
- Sound like a helpful Filipino Gen Z travel buddy.
- Use natural Taglish when the user uses Taglish.
- Use English if the user uses English.
- Be warm, casual, and practical.
- Avoid sounding robotic, corporate, or overly formal.
- Do not overdo slang. Keep it natural.

Formatting rules:
- Do NOT use markdown tables unless the user specifically asks for a table.
- Do NOT output HTML tags like <br>, <p>, <div>, or any raw HTML.
- Use short paragraphs that are easy to read on mobile.
- Use simple headings only when helpful.
- Use bullets or numbered lists only when they make the answer easier to scan.
- Keep each bullet short.
- Avoid huge blocks of text.
- Avoid cramped formatting.
- Prefer paragraph-style recommendations.
- Always finish the answer completely. Do not end mid-sentence, mid-list, or mid-section. If the answer is getting long, shorten the remaining parts and end with a complete final sentence.

Content rules:
- Accept normal user prompts naturally, even if vague or casual.
- If the user asks for a plan, give a simple realistic plan.
- If the user asks for suggestions, give practical options.
- If the user gives a location, use it in the answer.
- If the user does not give a location, ask one short follow-up question only if needed.
- Do not invent live map coordinates, exact ratings, exact opening hours, or real-time availability.
- For live place pins or exact map details, say they can use the map feature.
- For safety, budget, commute, weather, and timing, give practical reminders.

Default answer style:
Start with a friendly short intro, then give the answer in clean paragraphs or short bullets.

Example style:
"Gets! For a beach date, keep it simple and chill lang para hindi hassle.

Start with a beach na madaling puntahan and may basic facilities like restroom, parking, or nearby food spots. Mas okay if morning kayo pumunta para hindi super init and hindi pa crowded.

For the flow, you can do quick photos, light snacks, tambay sa shore, then sunset walk if kaya. Bring water, sunscreen, extra clothes, and a waterproof pouch for phones.

For food, mas safe magdala ng simple snacks like sandwiches, chips, fruits, and drinks. If may nearby café or seaside resto, doon na lang kayo mag-dinner para less bitbit.

Simple but cute idea: bring a small handwritten note or surprise snack. Hindi kailangan bongga, basta thoughtful."

Never format this kind of answer as a table.`;

const GROQ_CHATBOT_SYSTEM_PROMPT_TAGLISH = `You are GalaTayo's Filipino Gen Z place assistant and gala buddy.

Your job is to help users plan lakads, dates, food trips, hangouts, errands, and casual travel ideas in a friendly, practical, and natural way.

Voice and tone:
- Always answer in Taglish by default.
- Even if the user writes in pure English, keep the reply in Taglish unless the user clearly asks for English only.
- Sound like a warm, easygoing Filipino friend from the area, not a corporate chatbot.
- Keep the vibe Gen Z, but still clear, helpful, and respectful.
- Use light slang sparingly. Do not force it.
- Keep the energy upbeat, chill, and parang tropa sa lakad.
- Do not switch the whole reply to pure English just because the user used English.

Formatting rules:
- Do NOT use markdown tables unless the user specifically asks for a table.
- Do NOT output HTML tags like <br>, <p>, <div>, or any raw HTML.
- Use short paragraphs that are easy to read on mobile.
- Use simple headings only when helpful.
- Use bullets or numbered lists only when they make the answer easier to scan.
- Keep each bullet short.
- Avoid huge blocks of text.
- Avoid cramped formatting.
- Prefer paragraph-style recommendations.
- Always finish the answer completely. Do not end mid-sentence, mid-list, or mid-section. If the answer is getting long, shorten the remaining parts and end with a complete final sentence.

Content rules:
- Accept normal user prompts naturally, even if vague or casual.
- If the user asks for a plan, give a simple realistic plan.
- If the user asks for suggestions, give practical options.
- If the user gives a location, use it in the answer.
- If the user does not give a location, ask one short follow-up question only if needed.
- Do not invent live map coordinates, exact ratings, exact opening hours, or real-time availability.
- For live place pins or exact map details, say they can use the map feature.
- For safety, budget, commute, weather, and timing, give practical reminders.

Default answer style:
Start with a friendly short intro, then give the answer in clean paragraphs or short bullets.

Example style:
"Gets! For a beach date, keep it simple and chill lang para hindi hassle.

Start with a beach na madaling puntahan and may basic facilities like restroom, parking, or nearby food spots. Mas okay if morning kayo pumunta para hindi super init and hindi pa crowded.

For the flow, you can do quick photos, light snacks, tambay sa shore, then sunset walk if kaya. Bring water, sunscreen, extra clothes, and a waterproof pouch for phones.

For food, mas safe magdala ng simple snacks like sandwiches, chips, fruits, and drinks. If may nearby cafe or seaside resto, doon na lang kayo mag-dinner para less bitbit.

Simple but cute idea: bring a small handwritten note or surprise snack. Hindi kailangan bongga, basta thoughtful."

Never format this kind of answer as a table.`;

type GroqMessage = {
  role: "system" | "user";
  content: string;
};

type GroqRequestParams = {
  message: string;
  requestId: string;
};

export class GroqChatProviderError extends Error {
  status: number;
  errorCode: string;
  userMessage: string;

  constructor(
    status: number,
    errorCode: string,
    userMessage: string,
    message?: string
  ) {
    super(message ?? userMessage);
    this.name = "GroqChatProviderError";
    this.status = status;
    this.errorCode = errorCode;
    this.userMessage = userMessage;
  }
}

function normalizeText(value: string | undefined | null): string {
  return typeof value === "string" ? value.trim() : "";
}

export function sanitizeChatbotAnswer(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?p>/gi, "\n")
    .replace(/<\/?div>/gi, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanIncompleteEnding(text: string): string {
  let cleaned = sanitizeChatbotAnswer(text);

  cleaned = cleaned.replace(/[\s,;:&-]+$/g, "").trim();

  const badEndings = [
    /\b(and|or|with|for|sa|ng|at|then|plus)$/i,
    /[,&-]+$/g,
  ];

  for (const pattern of badEndings) {
    cleaned = cleaned.replace(pattern, "").trim();
  }

  return cleaned;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

async function resolveGroqApiKey(): Promise<string> {
  const envApiKey = normalizeText(process.env.GROQ_API_KEY);

  if (envApiKey) {
    return envApiKey;
  }

  try {
    const secretValue = normalizeText(await getSecret("groq-api-key"));
    if (secretValue) {
      return secretValue;
    }
  } catch (error) {
    const reason = error instanceof Error ? ` ${error.message}` : "";
    throw new GroqChatProviderError(
      500,
      "AI_PROVIDER_CONFIGURATION_ERROR",
      "The AI provider is not configured right now. Please try again later.",
      `Missing Groq API key. Checked GROQ_API_KEY and Key Vault secret groq-api-key.${reason}`
    );
  }

  throw new GroqChatProviderError(
    500,
    "AI_PROVIDER_CONFIGURATION_ERROR",
    "The AI provider is not configured right now. Please try again later.",
    "Missing Groq API key. Checked GROQ_API_KEY and Key Vault secret groq-api-key."
  );
}

async function callGroq(
  model: string,
  messages: GroqMessage[],
  requestId: string
): Promise<{ answer: string; finishReason: string | null }> {
  const startedAt = Date.now();
  const apiKey = await resolveGroqApiKey();
  const abortSignal = AbortSignal.timeout(GROQ_TIMEOUT_MS);

  console.log(
    `[AskAI Chatbot][requestId=${requestId}] provider=groq model=${model} request-start`
  );

  let response: Response;

  try {
    response = await fetch(GROQ_BASE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_completion_tokens: 1400,
        stream: false,
      }),
      signal: abortSignal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new GroqChatProviderError(
        504,
        "AI_PROVIDER_TEMPORARY_ERROR",
        "The AI model had a temporary issue. Please try again in a moment.",
        "Groq request timed out."
      );
    }

    throw new GroqChatProviderError(
      503,
      "AI_PROVIDER_TEMPORARY_ERROR",
      "The AI model had a temporary issue. Please try again in a moment.",
      error instanceof Error ? error.message : "Groq request failed."
    );
  }

  const data = await response.json().catch(() => null);
  const latencyMs = Date.now() - startedAt;

  if (!response.ok) {
    const errorMessage =
      (data as { error?: { message?: string } } | null)?.error?.message ||
      (data as { message?: string } | null)?.message ||
      `Groq request failed with status ${response.status}.`;

    console.error(
      `[AskAI Chatbot][requestId=${requestId}] provider=groq model=${model} request-failed status=${response.status} latencyMs=${latencyMs} error=${errorMessage}`
    );

    if (response.status === 429) {
      throw new GroqChatProviderError(
        429,
        "AI_PROVIDER_RATE_LIMITED",
        "Ask AI is busy right now. Please try again in a moment.",
        errorMessage
      );
    }

    throw new GroqChatProviderError(
      response.status || 502,
      "AI_PROVIDER_TEMPORARY_ERROR",
      "The AI model had a temporary issue. Please try again in a moment.",
      errorMessage
    );
  }

  const answer = normalizeText(
    (data as {
      choices?: Array<{
        message?: {
          content?: string;
        };
        finish_reason?: string | null;
      }>;
    } | null)?.choices?.[0]?.message?.content
  );
  const finishReason =
    (data as {
      choices?: Array<{
        finish_reason?: string | null;
      }>;
    } | null)?.choices?.[0]?.finish_reason ?? null;

  if (finishReason === "length") {
    console.warn("[Groq Chatbot] answer truncated by token limit", {
      requestId,
      model,
      finishReason: "length",
    });
  }

  if (!answer) {
    console.error(
      `[AskAI Chatbot][requestId=${requestId}] provider=groq model=${model} request-failed status=502 latencyMs=${latencyMs} error=Groq returned empty response`
    );

    throw new GroqChatProviderError(
      502,
      "AI_PROVIDER_TEMPORARY_ERROR",
      "The AI model had a temporary issue. Please try again in a moment.",
      "Groq returned empty response."
    );
  }

  console.log(
    `[AskAI Chatbot][requestId=${requestId}] provider=groq model=${model} request-complete latencyMs=${latencyMs} answerLength=${answer.length} finishReason=${finishReason ?? "unknown"}`
  );

  return {
    answer,
    finishReason,
  };
}

export async function generateFromGroq({
  message,
  requestId,
}: GroqRequestParams): Promise<string> {
  const messages: GroqMessage[] = [
    {
      role: "system",
      content: GROQ_CHATBOT_SYSTEM_PROMPT_TAGLISH,
    },
    {
      role: "user",
      content: message,
    },
  ];

  try {
    const primaryResult = await callGroq(GROQ_PRIMARY_MODEL, messages, requestId);
    const cleanedPrimaryAnswer = cleanIncompleteEnding(primaryResult.answer);

    return sanitizeChatbotAnswer(
      primaryResult.finishReason === "length" &&
        cleanedPrimaryAnswer &&
        !/[.!?]$/.test(cleanedPrimaryAnswer)
        ? `${cleanedPrimaryAnswer}\n\nI can continue this plan if you want more details.`
        : cleanedPrimaryAnswer
    );
  } catch (primaryError) {
    const primaryStatus =
      primaryError instanceof GroqChatProviderError
        ? primaryError.status
        : null;

    console.warn(
      `[AskAI Chatbot][requestId=${requestId}] provider=groq model=${GROQ_PRIMARY_MODEL} primary-failed status=${primaryStatus ?? "unknown"}`
    );

    if (
      primaryError instanceof GroqChatProviderError &&
      primaryError.errorCode === "AI_PROVIDER_CONFIGURATION_ERROR"
    ) {
      throw primaryError;
    }

    try {
      const fallbackResult = await callGroq(
        GROQ_FALLBACK_MODEL,
        messages,
        requestId
      );
      const cleanedFallbackAnswer = cleanIncompleteEnding(fallbackResult.answer);

      return sanitizeChatbotAnswer(
        fallbackResult.finishReason === "length" &&
          cleanedFallbackAnswer &&
          !/[.!?]$/.test(cleanedFallbackAnswer)
          ? `${cleanedFallbackAnswer}\n\nI can continue this plan if you want more details.`
          : cleanedFallbackAnswer
      );
    } catch (fallbackError) {
      const fallbackStatus =
        fallbackError instanceof GroqChatProviderError
          ? fallbackError.status
          : null;

      console.error(
        `[AskAI Chatbot][requestId=${requestId}] provider=groq model=${GROQ_FALLBACK_MODEL} fallback-failed status=${fallbackStatus ?? "unknown"}`
      );

      if (
        primaryError instanceof GroqChatProviderError &&
        primaryError.status === 429
      ) {
        throw primaryError;
      }

      if (
        fallbackError instanceof GroqChatProviderError &&
        fallbackError.status === 429
      ) {
        throw fallbackError;
      }

      if (
        fallbackError instanceof GroqChatProviderError &&
        fallbackError.errorCode === "AI_PROVIDER_CONFIGURATION_ERROR"
      ) {
        throw fallbackError;
      }

      return sanitizeChatbotAnswer(GROQ_SAFE_FALLBACK_MESSAGE);
    }
  }
}
