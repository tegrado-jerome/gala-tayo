import { GoogleGenAI } from "@google/genai";
import { KEY_VAULT_SECRET_NAMES } from "../../config/secretNames";
import type { NormalizedPlace } from "../../domain/places";
import { getJsonCacheValue, setJsonCacheValue } from "../redisCacheService";
import { optionalSecret } from "./providers/secrets";

// Free Google Maps grounding runs only on the 2.5 Flash models (500 requests a day) and expects English prompts.
const MODEL = process.env.ASSISTANT_MAPS_VERIFY_MODEL?.trim() || "gemini-2.5-flash-lite";

export function mapsVerifyEnabled() {
  return process.env.ASSISTANT_MAPS_VERIFY === "on";
}

type Verification = { found: boolean; title: string | null; uri: string | null };

/**
 * Asks Gemini with the Google Maps tool whether a curated place still exists. It only confirms a place we
 * already list (never adds one); the Maps link it returns is shown as attribution, as Google requires.
 */
export async function verifyPlaceOnGoogleMaps(place: NormalizedPlace): Promise<Verification | null> {
  const key = `assistant:maps-verify:v1:${place.slug}`;
  const cached = await getJsonCacheValue<Verification>(key).catch(() => null);
  if (cached) return cached;
  const apiKey = await optionalSecret("GEMINI_API_KEY", KEY_VAULT_SECRET_NAMES.GEMINI_API_KEY);
  if (!apiKey) return null;
  try {
    const response = await new GoogleGenAI({ apiKey }).models.generateContent({
      model: MODEL,
      contents: `Is "${place.name}" at ${place.address ?? [place.area, place.city].filter(Boolean).join(", ")}, Philippines a place that currently exists on Google Maps? Answer YES or NO only.`,
      config: { tools: [{ googleMaps: {} }], temperature: 0, maxOutputTokens: 20, thinkingConfig: { thinkingBudget: 0 }, abortSignal: AbortSignal.timeout(6000) },
    });
    const chunk = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.find((entry) => entry.maps?.uri);
    const result: Verification = {
      found: /\byes\b/i.test(response.text ?? "") && Boolean(chunk),
      title: chunk?.maps?.title ?? null,
      uri: chunk?.maps?.uri ?? null,
    };
    await setJsonCacheValue(key, result, { ttlSeconds: 7 * 24 * 60 * 60 }).catch(() => undefined);
    return result;
  } catch {
    return null;
  }
}
