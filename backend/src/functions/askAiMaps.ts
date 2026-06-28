import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import {
  AskAiUsageResult,
  checkAskAiUsage,
  consumeAskAiUsage,
} from "../services/askAiUsageService";
import {
  AskAiMapsServiceError,
  searchAskAiMaps,
} from "../services/askAiMapsService";
import { validateJwt } from "../utils/auth";

const ASK_AI_MAPS_COOLDOWN_MS = 10_000;
const lastAskAiMapsRequestAtByUser = new Map<string, number>();
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "Surrogate-Control": "no-store",
};

type AskAiMapsRequestBody = {
  query?: unknown;
  selectedChips?: unknown;
  nearMe?: unknown;
  openNow?: unknown;
  userLocation?: unknown;
};

function isAuthError(message: string): boolean {
  return (
    message === "Missing Authorization header." ||
    message === "Invalid Authorization header format." ||
    message === "Invalid or expired token."
  );
}

function friendlyProviderMessage(status: number): string {
  if (status === 404) {
    return "No map-grounded places matched that request right now.";
  }

  if (status === 429 || status === 503) {
    return "Ask AI Map Finder is busy right now. Please try again in a moment.";
  }

  if (status === 504) {
    return "Ask AI Map Finder took too long to respond. Please try again.";
  }

  if (status >= 500) {
    return "Ask AI Map Finder is temporarily unavailable. Please try again later.";
  }

  return "Ask AI Map Finder could not load places right now. Please try again.";
}

function logAskAiMaps(context: InvocationContext, message: string) {
  context.log(message);
}

function buildUsagePayload(
  askAi?: AskAiUsageResult,
  liveSearch?: AskAiUsageResult
) {
  return askAi && liveSearch
    ? {
        usage: {
          askAi,
          liveSearch,
        },
      }
    : {};
}

function handleAskAiMapsError(
  error: unknown,
  usage?: {
    askAi: AskAiUsageResult;
    liveSearch: AskAiUsageResult;
  }
): HttpResponseInit {
  const message = error instanceof Error ? error.message : "Unknown error";

  if (isAuthError(message)) {
    return {
      status: 401,
      headers: NO_STORE_HEADERS,
      jsonBody: {
        message: "Unauthorized.",
        ...buildUsagePayload(usage?.askAi, usage?.liveSearch),
      },
    };
  }

  if (error instanceof AskAiMapsServiceError) {
    return {
      status: error.status >= 400 && error.status < 500 ? error.status : 502,
      headers: NO_STORE_HEADERS,
      jsonBody: {
        message: friendlyProviderMessage(error.status),
        ...buildUsagePayload(usage?.askAi, usage?.liveSearch),
      },
    };
  }

  return {
    status: 500,
    headers: NO_STORE_HEADERS,
    jsonBody: {
      message: "Failed to load Ask AI map results.",
      ...buildUsagePayload(usage?.askAi, usage?.liveSearch),
    },
  };
}

async function getRequestBody(request: HttpRequest): Promise<AskAiMapsRequestBody> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as AskAiMapsRequestBody) : {};
  } catch {
    return {};
  }
}

function getStringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getBooleanField(value: unknown): boolean {
  return value === true;
}

function getSelectedChips(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean)
    .slice(0, 8);
}

function getUserLocation(value: unknown): { latitude: number; longitude: number } | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as { latitude?: unknown; longitude?: unknown };
  const latitude = Number(candidate.latitude);
  const longitude = Number(candidate.longitude);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}

function checkCooldown(userId: string): HttpResponseInit | null {
  const now = Date.now();
  const lastRequestAt = lastAskAiMapsRequestAtByUser.get(userId) ?? 0;
  const elapsed = now - lastRequestAt;

  if (elapsed < ASK_AI_MAPS_COOLDOWN_MS) {
    return {
      status: 429,
      headers: NO_STORE_HEADERS,
      jsonBody: {
        message: "Ask AI Map Finder is busy right now. Please try again in a moment.",
      },
    };
  }

  lastAskAiMapsRequestAtByUser.set(userId, now);
  return null;
}

export async function askAiMapsRequest(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const user = await validateJwt(request);
    const body = await getRequestBody(request);
    const query = getStringField(body.query);

    if (!query) {
      return {
        status: 400,
        headers: NO_STORE_HEADERS,
        jsonBody: {
          message: "Query is required.",
        },
      };
    }

    const cooldownResponse = checkCooldown(user.id);

    if (cooldownResponse) {
      return cooldownResponse;
    }

    const askAiUsageBefore = await checkAskAiUsage(user.id, "ask_ai_total");

    if (!askAiUsageBefore.allowed) {
      return {
        status: 429,
        headers: NO_STORE_HEADERS,
        jsonBody: {
          message: "Daily Ask AI limit reached.",
          usage: {
            askAi: askAiUsageBefore,
            liveSearch: await checkAskAiUsage(user.id, "live_search"),
          },
        },
      };
    }

    const liveSearchUsageBefore = await checkAskAiUsage(user.id, "live_search");

    if (!liveSearchUsageBefore.allowed) {
      return {
        status: 429,
        headers: NO_STORE_HEADERS,
        jsonBody: {
          message: "Daily Ask AI live search limit reached.",
          usage: {
            askAi: askAiUsageBefore,
            liveSearch: liveSearchUsageBefore,
          },
        },
      };
    }

    try {
      const result = await searchAskAiMaps({
        query,
        selectedChips: getSelectedChips(body.selectedChips),
        nearMe: getBooleanField(body.nearMe),
        openNow: getBooleanField(body.openNow),
        userLocation: getUserLocation(body.userLocation),
      }, {
        log: (message: string) => logAskAiMaps(context, message),
      });

      const askAiUsageAfter = await consumeAskAiUsage(user.id, "ask_ai_total");
      const liveSearchUsageAfter = await consumeAskAiUsage(user.id, "live_search");

      return {
        status: 200,
        headers: NO_STORE_HEADERS,
        jsonBody: {
          mode: result.mode,
          answerText: result.answerText,
          places: result.places,
          sources: result.sources,
          modelUsed: result.modelUsed ?? null,
          ...(result.emptyReason ? { emptyReason: result.emptyReason } : {}),
          ...(result.message ? { message: result.message } : {}),
          latencyMs: result.latencyMs,
          usage: {
            askAi: askAiUsageAfter,
            liveSearch: liveSearchUsageAfter,
          },
        },
      };
    } catch (error) {
      lastAskAiMapsRequestAtByUser.delete(user.id);
      context.error(error);

      return handleAskAiMapsError(error, {
        askAi: askAiUsageBefore,
        liveSearch: liveSearchUsageBefore,
      });
    }
  } catch (error) {
    context.error(error);
    return handleAskAiMapsError(error);
  }
}

app.http("askAiMaps", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "ask-ai/maps",
  handler: askAiMapsRequest,
});
