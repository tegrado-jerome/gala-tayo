import { InvocationContext } from "@azure/functions";
import { randomUUID } from "node:crypto";
import {
  AskAiServiceError,
  AskAiSource,
  AskAiProviderMeta,
  generateAskAiAnswer,
  shouldUseGroundedResearch,
} from "./askAiService";
import {
  AskAiUsageResult,
  checkAskAiUsage,
  consumeAskAiUsage,
} from "./askAiUsageService";

export type AskAiJobStatus =
  | "pending"
  | "streaming"
  | "completed"
  | "failed"
  | "cancelled";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AskAiJobUsage = {
  askAi: AskAiUsageResult;
  liveSearch: AskAiUsageResult;
};

type AskAiJobEvent =
  | {
      type: "status";
      jobId: string;
      status: AskAiJobStatus;
      answer: string;
    }
  | {
      type: "chunk";
      jobId: string;
      status: AskAiJobStatus;
      delta: string;
      answer: string;
    }
  | {
      type: "completed";
      jobId: string;
      status: "completed";
      answer: string;
      sources: AskAiSource[];
      usage: AskAiJobUsage;
      provider: AskAiProviderMeta;
    }
  | {
      type: "failed";
      jobId: string;
      status: "failed";
      answer: string;
      error: string;
      usage?: AskAiJobUsage;
    }
  | {
      type: "cancelled";
      jobId: string;
      status: "cancelled";
      answer: string;
    };

type AskAiJob = {
  id: string;
  userId: string;
  question: string;
  conversationHistory: ChatMessage[];
  status: AskAiJobStatus;
  answer: string;
  sources: AskAiSource[];
  error: string | null;
  usage: AskAiJobUsage | null;
  provider: AskAiProviderMeta | null;
  createdAt: number;
  updatedAt: number;
  shouldUseLiveSearch: boolean;
  abortController: AbortController;
  listeners: Set<(event: AskAiJobEvent) => void>;
};

type CreateAskAiJobResult =
  | {
      ok: true;
      job: AskAiJobSnapshot;
    }
  | {
      ok: false;
      status: number;
      body: {
        message: string;
        reason?: string;
        usage?: AskAiJobUsage;
      };
    };

export type AskAiJobSnapshot = {
  id: string;
  question: string;
  status: AskAiJobStatus;
  answer: string;
  sources: AskAiSource[];
  error: string | null;
  usage: AskAiJobUsage | null;
  provider: AskAiProviderMeta | null;
  createdAt: number;
  updatedAt: number;
};

const ASK_AI_COOLDOWN_MS = 10_000;
const JOB_RETENTION_MS = 30 * 60 * 1000;
const jobsById = new Map<string, AskAiJob>();
const lastAskAiRequestAtByUser = new Map<string, number>();

function toSnapshot(job: AskAiJob): AskAiJobSnapshot {
  return {
    id: job.id,
    question: job.question,
    status: job.status,
    answer: job.answer,
    sources: job.sources,
    error: job.error,
    usage: job.usage,
    provider: job.provider,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function emit(job: AskAiJob, event: AskAiJobEvent) {
  for (const listener of job.listeners) {
    listener(event);
  }
}

function cleanupExpiredJobs() {
  const now = Date.now();

  for (const [jobId, job] of jobsById.entries()) {
    const isTerminal =
      job.status === "completed" ||
      job.status === "failed" ||
      job.status === "cancelled";

    if (isTerminal && now - job.updatedAt > JOB_RETENTION_MS) {
      jobsById.delete(jobId);
    }
  }
}

function friendlyProviderError(status: number): {
  message: string;
  reason: "provider_busy" | "provider_timeout" | "provider_down" | "provider_error";
} {
  if (status === 429 || status === 503) {
    return {
      message: "Ask AI is busy right now. Please try again in a moment.",
      reason: "provider_busy",
    };
  }

  if (status === 504) {
    return {
      message: "Ask AI took too long to respond. Please try again in a moment.",
      reason: "provider_timeout",
    };
  }

  if (status >= 500) {
    return {
      message:
        "Ask AI encountered an issue with our AI provider. Please try again in a moment.",
      reason: "provider_down",
    };
  }

  return {
    message: "Ask AI could not answer that right now. Please try again.",
    reason: "provider_error",
  };
}

function checkCooldown(userId: string) {
  const now = Date.now();
  const lastRequestAt = lastAskAiRequestAtByUser.get(userId) ?? 0;
  const elapsed = now - lastRequestAt;

  if (elapsed < ASK_AI_COOLDOWN_MS) {
    return {
      ok: false as const,
      status: 429,
      body: {
        message: "Ask AI is busy right now. Please try again in a moment.",
      },
    };
  }

  lastAskAiRequestAtByUser.set(userId, now);
  return null;
}

async function runJob(job: AskAiJob, context?: InvocationContext) {
  try {
    const result = await generateAskAiAnswer({
      question: job.question,
      enableLiveSearch: job.shouldUseLiveSearch,
      conversationHistory: job.conversationHistory,
      signal: job.abortController.signal,
      onChunk: (chunk) => {
        if (job.status === "cancelled") {
          return;
        }

        if (job.status === "pending") {
          job.status = "streaming";
          job.updatedAt = Date.now();
          context?.log(`[AskAI] STREAM STATUS jobId=${job.id} status=${job.status}`);
          emit(job, {
            type: "status",
            jobId: job.id,
            status: job.status,
            answer: job.answer,
          });
        }

        job.answer += chunk;
        job.updatedAt = Date.now();
        context?.log(
          `[AskAI] STREAM CHUNK jobId=${job.id} chunkLength=${chunk.length} answerLength=${job.answer.length}`
        );
        emit(job, {
          type: "chunk",
          jobId: job.id,
          status: job.status,
          delta: chunk,
          answer: job.answer,
        });
      },
    });

    if (job.status === "cancelled") {
      return;
    }

    const askAiUsageAfter = await consumeAskAiUsage(job.userId, "ask_ai_total");
    const liveSearchUsageAfter = result.usedLiveSearch
      ? await consumeAskAiUsage(job.userId, "live_search")
      : await checkAskAiUsage(job.userId, "live_search");

    job.answer = result.answer;
    job.sources = result.sources;
    job.provider = result.provider;
    job.usage = {
      askAi: askAiUsageAfter,
      liveSearch: liveSearchUsageAfter,
    };
    job.status = "completed";
    job.updatedAt = Date.now();
    context?.log(
      `[AskAI] STREAM COMPLETED jobId=${job.id} answerLength=${job.answer.length} provider=${result.provider.provider}`
    );

    emit(job, {
      type: "completed",
      jobId: job.id,
      status: "completed",
      answer: job.answer,
      sources: job.sources,
      usage: job.usage,
      provider: job.provider,
    });
  } catch (error) {
    if (job.status === "cancelled" || job.abortController.signal.aborted) {
      job.status = "cancelled";
      job.updatedAt = Date.now();
      context?.log(`[AskAI] STREAM CLOSED jobId=${job.id} status=cancelled`);
      emit(job, {
        type: "cancelled",
        jobId: job.id,
        status: "cancelled",
        answer: job.answer,
      });
      return;
    }

    const realErrorMessage =
      error instanceof Error ? error.message : String(error);

    context?.log(
      `[AskAI] STREAM FAILED jobId=${job.id} error=${realErrorMessage}`
    );

    const friendlyMessage =
      error instanceof AskAiServiceError
        ? friendlyProviderError(error.status).message
        : "Ask AI is temporarily unavailable. Please try again later.";

    job.status = "failed";
    job.error = friendlyMessage;
    job.updatedAt = Date.now();

    context?.error(error);
    emit(job, {
      type: "failed",
      jobId: job.id,
      status: "failed",
      answer: job.answer,
      error: friendlyMessage,
    });
  } finally {
    cleanupExpiredJobs();
  }
}

export async function createAskAiJob({
  userId,
  question,
  conversationHistory,
  context,
}: {
  userId: string;
  question: string;
  conversationHistory: ChatMessage[];
  context?: InvocationContext;
}): Promise<CreateAskAiJobResult> {
  cleanupExpiredJobs();

  const cooldownResult = checkCooldown(userId);
  if (cooldownResult) {
    return cooldownResult;
  }

  const askAiUsageBefore = await checkAskAiUsage(userId, "ask_ai_total");

  if (!askAiUsageBefore.allowed) {
    return {
      ok: false,
      status: 429,
      body: {
        message: "Daily Ask AI limit reached.",
        usage: {
          askAi: askAiUsageBefore,
          liveSearch: await checkAskAiUsage(userId, "live_search"),
        },
      },
    };
  }

  const liveSearchUsageBefore = await checkAskAiUsage(userId, "live_search");
  const job: AskAiJob = {
    id: randomUUID(),
    userId,
    question,
    conversationHistory,
    status: "pending",
    answer: "",
    sources: [],
    error: null,
    usage: {
      askAi: askAiUsageBefore,
      liveSearch: liveSearchUsageBefore,
    },
    provider: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    shouldUseLiveSearch:
      liveSearchUsageBefore.allowed && shouldUseGroundedResearch(question),
    abortController: new AbortController(),
    listeners: new Set(),
  };

  jobsById.set(job.id, job);
  void runJob(job, context);

  return {
    ok: true,
    job: toSnapshot(job),
  };
}

export function getAskAiJobSnapshot(userId: string, jobId: string) {
  cleanupExpiredJobs();

  const job = jobsById.get(jobId);
  if (!job || job.userId !== userId) {
    return null;
  }

  return toSnapshot(job);
}

export function subscribeToAskAiJob(
  userId: string,
  jobId: string,
  listener: (event: AskAiJobEvent) => void
) {
  cleanupExpiredJobs();

  const job = jobsById.get(jobId);
  if (!job || job.userId !== userId) {
    return null;
  }

  job.listeners.add(listener);

  return {
    job,
    unsubscribe: () => {
      job.listeners.delete(listener);
    },
  };
}

export function cancelAskAiJob(userId: string, jobId: string) {
  cleanupExpiredJobs();

  const job = jobsById.get(jobId);
  if (!job || job.userId !== userId) {
    return null;
  }

  if (
    job.status === "completed" ||
    job.status === "failed" ||
    job.status === "cancelled"
  ) {
    return toSnapshot(job);
  }

  job.status = "cancelled";
  job.updatedAt = Date.now();
  job.abortController.abort();

  emit(job, {
    type: "cancelled",
    jobId: job.id,
    status: "cancelled",
    answer: job.answer,
  });

  return toSnapshot(job);
}
