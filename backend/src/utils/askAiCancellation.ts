import type { HttpRequest } from "@azure/functions";

const REQUEST_ID_HEADERS = ["x-request-id", "x-ask-ai-request-id", "x-ask-ai-maps-request-id"];
const PENDING_CANCEL_TTL_MS = 60_000;

export type AskAiCancellableUsageType = "chatbot_ai" | "ask_ai_maps";

export type AskAiCancellableActor =
  | { kind: "registered"; id: string }
  | { kind: "guest"; id: string };

type ActiveAskAiRequest = {
  controller: AbortController;
  actor?: AskAiCancellableActor;
  usageType?: AskAiCancellableUsageType;
};

const activeRequests = new Map<string, ActiveAskAiRequest>();
const pendingCancelledRequests = new Map<string, number>();
const refundedRequests = new Map<string, number>();

export class AskAiRequestCancelledError extends Error {
  constructor(requestId: string) {
    super(`Ask AI request was cancelled. requestId=${requestId}`);
    this.name = "AskAiRequestCancelledError";
  }
}

export function getAskAiRequestId(request: HttpRequest, fallbackRequestId: string): string {
  for (const header of REQUEST_ID_HEADERS) {
    const value = request.headers.get(header)?.trim();
    if (value) {
      return value;
    }
  }

  return fallbackRequestId;
}

export function registerAskAiRequest(
  requestId: string,
  usage?: {
    actor: AskAiCancellableActor;
    usageType: AskAiCancellableUsageType;
  }
): { signal: AbortSignal; unregister: () => void } {
  const controller = new AbortController();
  const activeRequest: ActiveAskAiRequest = {
    controller,
    actor: usage?.actor,
    usageType: usage?.usageType,
  };
  activeRequests.set(requestId, activeRequest);

  if (pendingCancelledRequests.has(requestId)) {
    pendingCancelledRequests.delete(requestId);
    controller.abort(new AskAiRequestCancelledError(requestId));
  }

  return {
    signal: controller.signal,
    unregister: () => {
      if (activeRequests.get(requestId) === activeRequest) {
        activeRequests.delete(requestId);
      }
    },
  };
}

export function cancelAskAiRequest(requestId: string): boolean {
  const activeRequest = activeRequests.get(requestId);
  if (!activeRequest) {
    pendingCancelledRequests.set(requestId, Date.now());
    prunePendingCancelledRequests();
    return false;
  }

  activeRequest.controller.abort(new AskAiRequestCancelledError(requestId));
  activeRequests.delete(requestId);
  return true;
}

export function getActiveAskAiRequestUsage(requestId: string):
  | { actor: AskAiCancellableActor; usageType: AskAiCancellableUsageType }
  | null {
  const activeRequest = activeRequests.get(requestId);

  if (!activeRequest?.actor || !activeRequest.usageType) {
    return null;
  }

  return {
    actor: activeRequest.actor,
    usageType: activeRequest.usageType,
  };
}

export function markAskAiRequestUsageRefunded(requestId: string): boolean {
  pruneRefundedRequests();

  if (refundedRequests.has(requestId)) {
    return false;
  }

  refundedRequests.set(requestId, Date.now());
  return true;
}

function prunePendingCancelledRequests(): void {
  const cutoff = Date.now() - PENDING_CANCEL_TTL_MS;

  for (const [requestId, cancelledAt] of pendingCancelledRequests) {
    if (cancelledAt < cutoff) {
      pendingCancelledRequests.delete(requestId);
    }
  }
}

function pruneRefundedRequests(): void {
  const cutoff = Date.now() - PENDING_CANCEL_TTL_MS;

  for (const [requestId, refundedAt] of refundedRequests) {
    if (refundedAt < cutoff) {
      refundedRequests.delete(requestId);
    }
  }
}

export function throwIfAskAiRequestCancelled(signal?: AbortSignal | null): void {
  if (!signal?.aborted) {
    return;
  }

  if (signal.reason instanceof Error) {
    throw signal.reason;
  }

  throw new AskAiRequestCancelledError("unknown");
}

export function isAskAiRequestCancelledError(error: unknown): boolean {
  return error instanceof AskAiRequestCancelledError;
}

export function buildAbortSignal(signals: Array<AbortSignal | null | undefined>): AbortSignal {
  const activeSignals = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  const controller = new AbortController();

  const abort = (signal: AbortSignal) => {
    if (!controller.signal.aborted) {
      controller.abort(signal.reason);
    }
  };

  for (const signal of activeSignals) {
    if (signal.aborted) {
      abort(signal);
      break;
    }

    signal.addEventListener("abort", () => abort(signal), { once: true });
  }

  return controller.signal;
}
