type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
};

const GUEST_DAILY_LIMIT = 5;
const REGISTERED_USER_DAILY_LIMIT = 30;

// In-memory counters for local development.
// These reset whenever the Azure Functions host restarts.
const guestUsage = new Map<string, number>();
const registeredUserUsage = new Map<string, number>();

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

export function checkRegisteredUserRateLimit(userId: string): RateLimitResult {
  const currentUsage = registeredUserUsage.get(userId) ?? 0;

  if (currentUsage >= REGISTERED_USER_DAILY_LIMIT) {
    return {
      allowed: false,
      remaining: 0,
      limit: REGISTERED_USER_DAILY_LIMIT,
    };
  }

  const newUsage = currentUsage + 1;
  registeredUserUsage.set(userId, newUsage);

  return {
    allowed: true,
    remaining: REGISTERED_USER_DAILY_LIMIT - newUsage,
    limit: REGISTERED_USER_DAILY_LIMIT,
  };
}