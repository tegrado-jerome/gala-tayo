export const MFA_MAX_VERIFY_ATTEMPTS = 5;

export type TrustedDevice = { userId: string; trustedAt: number; userAgent: string };

/** Redis may hand back the stored JSON string or an already-parsed object. */
export function parseTrustedDevice(raw: unknown): TrustedDevice | null {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<TrustedDevice>;
  if (typeof record.userId !== "string") return null;
  return {
    userId: record.userId,
    trustedAt: typeof record.trustedAt === "number" ? record.trustedAt : 0,
    userAgent: typeof record.userAgent === "string" ? record.userAgent : "Unknown device",
  };
}

/** A device token only skips the code for the account that trusted it. */
export function isDeviceTrustedFor(raw: unknown, userId: string): boolean {
  return parseTrustedDevice(raw)?.userId === userId;
}
