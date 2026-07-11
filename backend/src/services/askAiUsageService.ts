import { getSupabaseAdminClient } from "../config/supabaseAdmin";

export type AskAiUsageType = "ask_ai_maps" | "chatbot_ai";

export type AskAiUsageResult = {
  allowed: boolean;
  usageType: string;
  dailyLimit: number;
  requestCount: number;
  remaining: number;
  usageDate: string;
  resetsAt: string;
};

export type AskAiUsageSummaryResult = {
  askAiMaps: AskAiUsageResult;
  chatbotAi: AskAiUsageResult;
};

export type AskAiUsageTypeInput =
  | AskAiUsageType
  | "ask_ai_total"
  | "live_search"
  | "ai_guide";

const ASK_AI_DAILY_LIMITS: Record<string, number> = {
  ask_ai_maps: 10,
  chatbot_ai: 20,
  ask_ai_total: 10,
  live_search: 5,
};

const ASK_AI_USAGE_TIMEZONE = "Asia/Manila";

export const ASK_AI_DAILY_LIMIT = 10;

function getTodayUsageDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ASK_AI_USAGE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Failed to resolve current Ask AI usage date in Asia/Manila.");
  }

  return `${year}-${month}-${day}`;
}

function getResetAt(usageDate: string): string {
  const [year, month, day] = usageDate.split("-").map(Number);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error("Invalid Ask AI usage date.");
  }

  const resetDate = new Date(Date.UTC(year, month - 1, day, 16, 0, 0, 0));
  return resetDate.toISOString();
}

function getDailyLimit(usageType: string): number {
  return ASK_AI_DAILY_LIMITS[usageType] ?? 0;
}

export function normalizeAskAiUsageType(
  usageType: AskAiUsageTypeInput
): string {
  if (usageType === "ai_guide" || usageType === "ask_ai_total") {
    return "ask_ai_total";
  }

  return usageType;
}

export function isAskAiUsageType(value: unknown): value is AskAiUsageType {
  return value === "ask_ai_maps" || value === "chatbot_ai";
}

export function isAskAiUsageTypeInput(
  value: unknown
): value is AskAiUsageTypeInput {
  return (
    value === "ask_ai_maps" ||
    value === "chatbot_ai" ||
    value === "ask_ai_total" ||
    value === "live_search" ||
    value === "ai_guide"
  );
}

function normalizeRpcRow(row: unknown): AskAiUsageResult | null {
  if (!row || typeof row !== "object") return null;

  const record = row as Record<string, unknown>;
  const usageType = record.usage_type as string | undefined;
  const allowed = record.allowed;
  const dailyLimit = record.daily_limit;
  const requestCount = record.request_count;
  const remaining = record.remaining;
  const usageDate = record.usage_date;
  const resetsAt = record.resets_at;

  if (
    typeof usageType !== "string" ||
    typeof allowed !== "boolean" ||
    typeof dailyLimit !== "number" ||
    typeof requestCount !== "number" ||
    typeof remaining !== "number" ||
    typeof usageDate !== "string" ||
    typeof resetsAt !== "string"
  ) {
    return null;
  }

  return {
    allowed,
    usageType,
    dailyLimit,
    requestCount,
    remaining,
    usageDate,
    resetsAt,
  };
}

function buildUsageResult(
  usageType: string,
  requestCount: number,
  usageDate: string
): AskAiUsageResult {
  const limit = getDailyLimit(usageType);
  const normalizedCount = Math.max(0, requestCount);
  const remaining = Math.max(limit - normalizedCount, 0);
  const allowed = normalizedCount < limit;

  return {
    usageType,
    allowed,
    dailyLimit: limit,
    requestCount: normalizedCount,
    remaining,
    usageDate,
    resetsAt: getResetAt(usageDate),
  };
}

export async function checkAskAiUsage(
  userId: string,
  usageType: string
): Promise<AskAiUsageResult> {
  const today = getTodayUsageDate();

  const supabase = await getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ask_ai_usage")
    .select("request_count")
    .eq("user_id", userId)
    .eq("usage_type", usageType)
    .eq("usage_date", today)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check Ask AI usage: ${error.message}`);
  }

  const requestCount = (data as { request_count?: number } | null)?.request_count ?? 0;
  return buildUsageResult(usageType, requestCount, today);
}

export async function checkAllAskAiUsage(
  userId: string
): Promise<AskAiUsageSummaryResult> {
  const [askAiMaps, chatbotAi] = await Promise.all([
    checkAskAiUsage(userId, "ask_ai_maps"),
    checkAskAiUsage(userId, "chatbot_ai"),
  ]);

  return {
    askAiMaps,
    chatbotAi,
  };
}

export async function consumeAskAiUsage(
  userId: string,
  usageTypeInput: AskAiUsageTypeInput
): Promise<AskAiUsageResult> {
  const usageType = normalizeAskAiUsageType(usageTypeInput);

  if (usageType === "ask_ai_maps" || usageType === "chatbot_ai") {
    return consumeAskAiUsageRpc({ userId, usageType });
  }

  const today = getTodayUsageDate();
  const limit = getDailyLimit(usageType);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const supabase = await getSupabaseAdminClient();
    const usageTable = supabase.from("ask_ai_usage") as any;

    const { data: existing } = await usageTable
      .select("id,request_count")
      .eq("user_id", userId)
      .eq("usage_type", usageType)
      .eq("usage_date", today)
      .maybeSingle();

    if (!existing) {
      const { data: created, error: createError } = await usageTable
        .insert({
          user_id: userId,
          usage_type: usageType,
          usage_date: today,
          request_count: 1,
        })
        .select("request_count")
        .single();

      if (createError) {
        if (createError.code === "23505") {
          continue;
        }
        throw new Error(`Failed to create Ask AI usage: ${createError.message}`);
      }

      return buildUsageResult(
        usageType,
        (created as { request_count: number }).request_count,
        today
      );
    }

    const existingRow = existing as { id: string; request_count: number };

    if (existingRow.request_count >= limit) {
      return buildUsageResult(usageType, existingRow.request_count, today);
    }

    const nextCount = existingRow.request_count + 1;

    const { data: updated, error: updateError } = await usageTable
      .update({ request_count: nextCount })
      .eq("id", existingRow.id)
      .eq("request_count", existingRow.request_count)
      .select("request_count")
      .maybeSingle();

    if (updateError) {
      throw new Error(`Failed to update Ask AI usage: ${updateError.message}`);
    }

    if (updated) {
      return buildUsageResult(
        usageType,
        (updated as { request_count: number }).request_count,
        today
      );
    }
  }

  const latest = await checkAskAiUsage(userId, usageType);
  if (!latest.allowed) {
    return latest;
  }

  throw new Error("Failed to consume Ask AI usage.");
}

async function consumeAskAiUsageRpc(params: {
  userId: string;
  usageType: AskAiUsageType;
}): Promise<AskAiUsageResult> {
  const supabase = await getSupabaseAdminClient();

  const { data, error } = await (supabase.rpc as any)("consume_ask_ai_usage", {
    p_user_id: params.userId,
    p_usage_type: params.usageType,
  });

  if (error) {
    console.error(
      `[AskAI Usage] consume RPC failed: ${error.message}`,
      params
    );
    throw new Error("Failed to process usage quota right now. Please try again.");
  }

  const rows = Array.isArray(data) ? data : [data];
  const row = rows[0];
  const normalized = normalizeRpcRow(row);

  if (!normalized) {
    throw new Error("Failed to parse usage quota response from database.");
  }

  return normalized;
}

export async function refundAskAiUsage(params: {
  userId: string;
  usageType: AskAiUsageType;
}): Promise<void> {
  const supabase = await getSupabaseAdminClient();

  const { error } = await (supabase.rpc as any)("refund_ask_ai_usage", {
    p_user_id: params.userId,
    p_usage_type: params.usageType,
  });

  if (error) {
    console.warn(`[AskAI Usage] refund failed: ${error.message}`);
  }
}
