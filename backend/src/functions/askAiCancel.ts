import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { refundAskAiUsageForActor } from "../services/askAiUsageService";
import {
  cancelAskAiRequest,
  getActiveAskAiRequestUsage,
  markAskAiRequestUsageRefunded,
} from "../utils/askAiCancellation";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
};

async function getRequestId(request: HttpRequest): Promise<string | null> {
  const headerRequestId = request.headers.get("x-request-id")?.trim();
  if (headerRequestId) {
    return headerRequestId;
  }

  try {
    const body = await request.json();
    const requestId = body && typeof body === "object"
      ? (body as { requestId?: unknown }).requestId
      : null;
    return typeof requestId === "string" && requestId.trim() ? requestId.trim() : null;
  } catch {
    return null;
  }
}

export async function postAskAiCancel(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const requestId = await getRequestId(request);

  if (!requestId) {
    return {
      status: 400,
      headers: JSON_HEADERS,
      jsonBody: {
        ok: false,
        cancelled: false,
        error: "Request id is required.",
      },
    };
  }

  const activeUsage = getActiveAskAiRequestUsage(requestId);
  const cancelled = cancelAskAiRequest(requestId);
  let refunded = false;

  if (activeUsage && markAskAiRequestUsageRefunded(requestId)) {
    await refundAskAiUsageForActor(activeUsage);
    refunded = true;
  }

  context.log(`[AskAI Cancel] requestId=${requestId} cancelled=${cancelled} refunded=${refunded}`);

  return {
    status: 202,
    headers: JSON_HEADERS,
    jsonBody: {
      ok: true,
      cancelled,
      refunded,
      requestId,
    },
  };
}

app.http("askAiCancel", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "ask-ai/cancel",
  handler: postAskAiCancel,
});
