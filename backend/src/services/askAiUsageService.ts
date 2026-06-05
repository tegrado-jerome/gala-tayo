import { getSupabaseAdminClient } from "../config/supabaseAdmin";

export const ASK_AI_DAILY_LIMIT = 5;

type AskAiUsageRow = {
  id: string;
  user_id: string;
  usage_date: string;
  request_count: number;
  created_at: string;
  updated_at: string;
};

export type AskAiUsageResult = {
  allowed: boolean;
  limit: number;
  used: number;
  remaining: number;
  resetAt: string;
  message?: string;
};

function getTodayUsageDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getResetAt(usageDate: string): string {
  const resetDate = new Date(`${usageDate}T00:00:00.000Z`);
  resetDate.setUTCDate(resetDate.getUTCDate() + 1);

  return resetDate.toISOString();
}

function buildUsageResult(used: number, usageDate: string): AskAiUsageResult {
  const normalizedUsed = Math.max(0, used);
  const remaining = Math.max(ASK_AI_DAILY_LIMIT - normalizedUsed, 0);
  const allowed = normalizedUsed < ASK_AI_DAILY_LIMIT;

  return {
    allowed,
    limit: ASK_AI_DAILY_LIMIT,
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

async function getUsageRow(
  userId: string,
  usageDate: string
): Promise<AskAiUsageRow | null> {
  const supabase = await getSupabaseAdminClient();
  const askAiUsageTable = supabase.from("ask_ai_usage") as any;
  const { data, error } = await askAiUsageTable
    .select("id,user_id,usage_date,request_count,created_at,updated_at")
    .eq("user_id", userId)
    .eq("usage_date", usageDate)
    .maybeSingle();

  if (error) {
    throw new Error("Failed to check Ask AI usage.");
  }

  return (data as AskAiUsageRow | null) ?? null;
}

export async function checkAskAiUsage(userId: string): Promise<AskAiUsageResult> {
  const usageDate = getTodayUsageDate();
  const usageRow = await getUsageRow(userId, usageDate);

  return buildUsageResult(usageRow?.request_count ?? 0, usageDate);
}

async function createFirstUsageRow(
  userId: string,
  usageDate: string
): Promise<AskAiUsageRow | null> {
  const supabase = await getSupabaseAdminClient();
  const askAiUsageTable = supabase.from("ask_ai_usage") as any;
  const { data, error } = await askAiUsageTable
    .insert({
      user_id: userId,
      usage_date: usageDate,
      request_count: 1,
    })
    .select("id,user_id,usage_date,request_count,created_at,updated_at")
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      return null;
    }

    throw new Error("Failed to create Ask AI usage row.");
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
    .select("id,user_id,usage_date,request_count,created_at,updated_at")
    .maybeSingle();

  if (error) {
    throw new Error("Failed to update Ask AI usage.");
  }

  return (data as AskAiUsageRow | null) ?? null;
}

export async function consumeAskAiUsage(userId: string): Promise<AskAiUsageResult> {
  const usageDate = getTodayUsageDate();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const usageRow = await getUsageRow(userId, usageDate);

    if (!usageRow) {
      const createdRow = await createFirstUsageRow(userId, usageDate);

      if (createdRow) {
        return buildUsageResult(createdRow.request_count, usageDate);
      }

      continue;
    }

    if (usageRow.request_count >= ASK_AI_DAILY_LIMIT) {
      return buildUsageResult(usageRow.request_count, usageDate);
    }

    const updatedRow = await incrementUsageRow(usageRow);

    if (updatedRow) {
      return buildUsageResult(updatedRow.request_count, usageDate);
    }
  }

  const latestUsage = await checkAskAiUsage(userId);

  if (!latestUsage.allowed) {
    return latestUsage;
  }

  throw new Error("Failed to consume Ask AI usage.");
}
