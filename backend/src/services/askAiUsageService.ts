import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import {
  ASK_AI_LIVE_SEARCH_DAILY_LIMIT,
  ASK_AI_TOTAL_DAILY_LIMIT,
} from "../config/askAiConfig";

export type AskAiUsageType = "ask_ai_total" | "live_search";
export type AskAiUsageTypeInput = AskAiUsageType | "ai_guide";

const ASK_AI_DAILY_LIMITS: Record<AskAiUsageType, number> = {
  ask_ai_total: ASK_AI_TOTAL_DAILY_LIMIT,
  live_search: ASK_AI_LIVE_SEARCH_DAILY_LIMIT,
};

export const ASK_AI_DAILY_LIMIT = ASK_AI_TOTAL_DAILY_LIMIT;

type AskAiUsageRow = {
  id: string;
  user_id: string;
  usage_type: AskAiUsageType;
  usage_date: string;
  request_count: number;
  created_at: string;
  updated_at: string;
};

export type AskAiUsageResult = {
  usageType: AskAiUsageType;
  allowed: boolean;
  limit: number;
  used: number;
  remaining: number;
  resetAt: string;
  message?: string;
};

export type AskAiUsageSummaryResult = {
  askAi: AskAiUsageResult;
  liveSearch: AskAiUsageResult;
};

function getTodayUsageDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getResetAt(usageDate: string): string {
  const resetDate = new Date(`${usageDate}T00:00:00.000Z`);
  resetDate.setUTCDate(resetDate.getUTCDate() + 1);

  return resetDate.toISOString();
}

function getUsageLimit(usageType: AskAiUsageType): number {
  return ASK_AI_DAILY_LIMITS[usageType];
}

export function normalizeAskAiUsageType(
  usageType: AskAiUsageTypeInput
): AskAiUsageType {
  return usageType === "ai_guide" ? "ask_ai_total" : usageType;
}

export function isAskAiUsageTypeInput(
  value: unknown
): value is AskAiUsageTypeInput {
  return (
    value === "ask_ai_total" ||
    value === "live_search" ||
    value === "ai_guide"
  );
}

function buildUsageResult(
  usageType: AskAiUsageType,
  used: number,
  usageDate: string
): AskAiUsageResult {
  const limit = getUsageLimit(usageType);
  const normalizedUsed = Math.max(0, used);
  const remaining = Math.max(limit - normalizedUsed, 0);
  const allowed = normalizedUsed < limit;

  return {
    usageType,
    allowed,
    limit,
    used: normalizedUsed,
    remaining,
    resetAt: getResetAt(usageDate),
    ...(allowed ? {} : { message: "Daily Ask AI limit reached." }),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
  );
}

function isMissingUsageTypeColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: unknown; message?: unknown };
  const message = typeof candidate.message === "string" ? candidate.message : "";

  return candidate.code === "42703" || message.includes("usage_type");
}

function handleUsageTableError(error: unknown, fallbackMessage: string): never {
  if (isMissingUsageTypeColumn(error)) {
    throw new Error(
      "public.ask_ai_usage.usage_type is missing. Apply the manual Supabase SQL update before testing Ask AI usage buckets."
    );
  }

  throw new Error(fallbackMessage);
}

async function getUsageRow(
  userId: string,
  usageType: AskAiUsageType,
  usageDate: string
): Promise<AskAiUsageRow | null> {
  const supabase = await getSupabaseAdminClient();
  const askAiUsageTable = supabase.from("ask_ai_usage") as any;
  const { data, error } = await askAiUsageTable
    .select("id,user_id,usage_type,usage_date,request_count,created_at,updated_at")
    .eq("user_id", userId)
    .eq("usage_type", usageType)
    .eq("usage_date", usageDate)
    .maybeSingle();

  if (error) {
    handleUsageTableError(error, "Failed to check Ask AI usage.");
  }

  return (data as AskAiUsageRow | null) ?? null;
}

export async function checkAskAiUsage(
  userId: string,
  usageTypeInput: AskAiUsageTypeInput
): Promise<AskAiUsageResult> {
  const usageType = normalizeAskAiUsageType(usageTypeInput);
  const usageDate = getTodayUsageDate();
  const usageRow = await getUsageRow(userId, usageType, usageDate);

  return buildUsageResult(usageType, usageRow?.request_count ?? 0, usageDate);
}

export async function checkAllAskAiUsage(
  userId: string
): Promise<AskAiUsageSummaryResult> {
  const [askAi, liveSearch] = await Promise.all([
    checkAskAiUsage(userId, "ask_ai_total"),
    checkAskAiUsage(userId, "live_search"),
  ]);

  return {
    askAi,
    liveSearch,
  };
}

async function createFirstUsageRow(
  userId: string,
  usageType: AskAiUsageType,
  usageDate: string
): Promise<AskAiUsageRow | null> {
  const supabase = await getSupabaseAdminClient();
  const askAiUsageTable = supabase.from("ask_ai_usage") as any;
  const { data, error } = await askAiUsageTable
    .insert({
      user_id: userId,
      usage_type: usageType,
      usage_date: usageDate,
      request_count: 1,
    })
    .select("id,user_id,usage_type,usage_date,request_count,created_at,updated_at")
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      return null;
    }

    handleUsageTableError(error, "Failed to create Ask AI usage row.");
  }

  return data as AskAiUsageRow;
}

async function incrementUsageRow(
  usageRow: AskAiUsageRow
): Promise<AskAiUsageRow | null> {
  const nextRequestCount = usageRow.request_count + 1;
  const supabase = await getSupabaseAdminClient();
  const askAiUsageTable = supabase.from("ask_ai_usage") as any;
  const { data, error } = await askAiUsageTable
    .update({ request_count: nextRequestCount })
    .eq("id", usageRow.id)
    .eq("request_count", usageRow.request_count)
    .select("id,user_id,usage_type,usage_date,request_count,created_at,updated_at")
    .maybeSingle();

  if (error) {
    handleUsageTableError(error, "Failed to update Ask AI usage.");
  }

  return (data as AskAiUsageRow | null) ?? null;
}

export async function consumeAskAiUsage(
  userId: string,
  usageTypeInput: AskAiUsageTypeInput
): Promise<AskAiUsageResult> {
  const usageType = normalizeAskAiUsageType(usageTypeInput);
  const usageDate = getTodayUsageDate();
  const limit = getUsageLimit(usageType);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const usageRow = await getUsageRow(userId, usageType, usageDate);

    if (!usageRow) {
      const createdRow = await createFirstUsageRow(userId, usageType, usageDate);

      if (createdRow) {
        return buildUsageResult(usageType, createdRow.request_count, usageDate);
      }

      continue;
    }

    if (usageRow.request_count >= limit) {
      return buildUsageResult(usageType, usageRow.request_count, usageDate);
    }

    const updatedRow = await incrementUsageRow(usageRow);

    if (updatedRow) {
      return buildUsageResult(usageType, updatedRow.request_count, usageDate);
    }
  }

  const latestUsage = await checkAskAiUsage(userId, usageType);

  if (!latestUsage.allowed) {
    return latestUsage;
  }

  throw new Error("Failed to consume Ask AI usage.");
}
