import { HttpRequest } from "@azure/functions";
import { validateJwt, type AuthenticatedUser } from "./auth";

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

export async function resolveAskAiActor(request: HttpRequest): Promise<AskAiActor> {
  const guestId = normalizeGuestId(request.headers.get(ASK_AI_GUEST_ID_HEADER));

  if (!guestId) {
    const authHeader = request.headers.get("authorization");

    if (authHeader) {
      const user = await validateJwt(request);
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
