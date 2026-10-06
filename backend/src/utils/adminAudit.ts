import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import type { HttpRequest } from "@azure/functions";
import { getClientIp } from "./clientIp";

type AdminAction = {
  adminId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

export async function logAdminAction(
  request: HttpRequest,
  adminId: string,
  action: string,
  targetType: string,
  targetId: string | null = null,
  details: string | null = null
): Promise<void> {
  try {
    const supabase = await getSupabaseAdminClient();
    await (supabase.from("admin_audit_log") as any).insert({
      admin_id: adminId,
      action,
      target_type: targetType,
      target_id: targetId,
      details,
      ip_address: getClientIp(request),
      user_agent: request.headers.get("user-agent") ?? null,
    });
  } catch {
    // Audit logging is best-effort
  }
}
