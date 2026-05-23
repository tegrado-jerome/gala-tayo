type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
};

const GUEST_DAILY_LIMIT = 5;

// Temporary in-memory storage for local testing.
// Later we can replace this with Supabase or Redis.
const guestUsage = new Map<string, number>();

export function checkGuestRateLimit(ipAddress: string): RateLimitResult {
  const currentUsage = guestUsage.get(ipAddress) ?? 0;

  if (currentUsage >= GUEST_DAILY_LIMIT) {
    return {
      allowed: false,
      remaining: 0,
      limit: GUEST_DAILY_LIMIT,
    };
  }

  const newUsage = currentUsage + 1;
  guestUsage.set(ipAddress, newUsage);

  return {
    allowed: true,
    remaining: GUEST_DAILY_LIMIT - newUsage,
    limit: GUEST_DAILY_LIMIT,
  };
}