type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: string;
};

type RateLimitRecord = {
  count: number;
  resetAt: number;
};

const GUEST_DAILY_LIMIT = 5;
const REGISTERED_USER_DAILY_LIMIT = 30;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

const guestUsage = new Map<string, RateLimitRecord>();
const registeredUserUsage = new Map<string, RateLimitRecord>();

function getOrCreateRecord(
  storage: Map<string, RateLimitRecord>,
  key: string
): RateLimitRecord {
  const now = Date.now();
  const existingRecord = storage.get(key);

  if (!existingRecord || now >= existingRecord.resetAt) {
    const newRecord: RateLimitRecord = {
      count: 0,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    };

    storage.set(key, newRecord);
    return newRecord;
  }

  return existingRecord;
}

function checkRateLimit(
  storage: Map<string, RateLimitRecord>,
  key: string,
  limit: number
): RateLimitResult {
  const record = getOrCreateRecord(storage, key);

  if (record.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      limit,
      resetAt: new Date(record.resetAt).toISOString(),
    };
  }

  record.count += 1;
  storage.set(key, record);

  return {
    allowed: true,
    remaining: limit - record.count,
    limit,
    resetAt: new Date(record.resetAt).toISOString(),
  };
}

export function checkGuestRateLimit(ipAddress: string): RateLimitResult {
  return checkRateLimit(guestUsage, ipAddress, GUEST_DAILY_LIMIT);
}

export function checkRegisteredUserRateLimit(userId: string): RateLimitResult {
  return checkRateLimit(
    registeredUserUsage,
    userId,
    REGISTERED_USER_DAILY_LIMIT
  );
}