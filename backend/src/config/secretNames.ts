export const KEY_VAULT_SECRET_NAMES = {
  SUPABASE_URL: "supabase-url",
  SUPABASE_SERVICE_ROLE_KEY: "supabase-service-role-key",
  GROQ_API_KEY: "groq-api-key",
  GEMINI_API_KEY: "gemini-api-key",
  GEOAPIFY_API_KEY: "geoapify-api-key",
  FOURSQUARE_API_KEY: "foursquare-api-key",
  REDIS_REST_URL: "redis-rest-url",
  REDIS_REST_TOKEN: "redis-rest-token",
  // Legacy migration fallbacks for older Key Vaults. Do not use for new setup.
  UPSTASH_REDIS_REST_URL: "upstash-redis-rest-url",
  UPSTASH_REDIS_REST_TOKEN: "upstash-redis-rest-token",
  R2_ACCESS_KEY_ID: "r2-access-key-id",
  R2_SECRET_ACCESS_KEY: "r2-secret-access-key",
} as const;
