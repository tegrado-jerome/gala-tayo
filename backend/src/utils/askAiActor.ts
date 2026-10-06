import { HttpRequest } from "@azure/functions";
import { validateJwt, type AuthenticatedUser } from "./auth";
import { checkRedisRateLimit, getClientIp } from "./redisRateLimit";

export const ASK_AI_GUEST_ID_HEADER = "x-ask-ai-guest-id";

export type AskAiActor =
  | {
      kind: "registered";
      id: string;
      user: AuthenticatedUser;
    }
  | {
      kind: "guest";
      id: string;
    };

function normalizeGuestId(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";

  if (!trimmed) {
    return null;
  }

  if (trimmed.length < 8 || trimmed.length > 128) {
    return null;
  }

  if (!/^[A-Za-z0-9-]+$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

// Per-IP caps on top of the per-actor daily quota: guest ids are made by the client, so a script could
// otherwise rotate them for unlimited AI calls. Generous enough for shared mobile (CGNAT) addresses.
const ASK_AI_IP_BURST_LIMIT = 20;
const ASK_AI_IP_BURST_WINDOW_SECONDS = 10 * 60;
const ASK_AI_GUEST_IP_DAILY_LIMIT = 40;

/** False when this IP has sent too many AI requests recently (or, for guests, today). `skipDaily` keeps only the burst limit. */
export async function isAskAiIpAllowed(request: HttpRequest, actor: AskAiActor, { skipDaily = false } = {}): Promise<boolean> {
  const ip = getClientIp(request);
  const burst = await checkRedisRateLimit(`ask-ai-ip:${ip}`, ASK_AI_IP_BURST_LIMIT, ASK_AI_IP_BURST_WINDOW_SECONDS);
  if (!burst.allowed) return false;
  if (actor.kind !== "guest" || skipDaily) return true;
  const daily = await checkRedisRateLimit(`ask-ai-guest-ip:${ip}`, ASK_AI_GUEST_IP_DAILY_LIMIT, 24 * 60 * 60);
  return daily.allowed;
}

export async function resolveAskAiActor(request: HttpRequest): Promise<AskAiActor> {
  const guestId = normalizeGuestId(request.headers.get(ASK_AI_GUEST_ID_HEADER));

  if (!guestId) {
    const authHeader = request.headers.get("authorization");

    if (authHeader) {
      const user = await validateJwt(request);
      // Guest sessions get the smaller guest AI limits, keyed by their user id.
      if (user.isAnonymous) {
        return { kind: "guest", id: user.id };
      }
      return {
        kind: "registered",
        id: user.id,
        user,
      };
    }

    throw new Error("Missing Ask AI guest identifier.");
  }

  return {
    kind: "guest",
    id: guestId,
  };
}
