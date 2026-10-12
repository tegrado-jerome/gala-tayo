import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getRedisClient } from "../services/redisCacheService";
import { clearActivePlacesCache } from "../domain/places";
import { clearSeoPlaceSummariesCache } from "../utils/seoPlaces";

const ADMIN_KEY_ENV_VAR = "GALATAYO_ADMIN_KEY";

async function cacheClear(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const adminKey = process.env[ADMIN_KEY_ENV_VAR]?.trim();
  if (!adminKey) {
    return { status: 500, jsonBody: { error: "Admin key not configured on server." } };
  }

  const providedKey = request.headers.get("x-admin-key")?.trim();
  if (!providedKey || providedKey !== adminKey) {
    return { status: 401, jsonBody: { error: "Unauthorized. Provide valid x-admin-key header." } };
  }

  const client = await getRedisClient();
  if (!client) {
    return { status: 503, jsonBody: { error: "Redis not available." } };
  }

  const clearedKeys: string[] = [];
  try {
    await clearActivePlacesCache();
    clearedKeys.push("active places (via clearActivePlacesCache)");
    await clearSeoPlaceSummariesCache();
    clearedKeys.push("SEO place summaries (via clearSeoPlaceSummariesCache)");

    // Search answers and listing pages are no longer cached in Redis; these patterns sweep keys left from before.
    for (const pattern of ["search:*", "seo:listings:*"]) {
      let cursor: string | number = "0";
      do {
        const [nextCursor, keys] = await client.scan(cursor, { match: pattern, count: 500 });
        cursor = nextCursor;
        if (keys.length > 0) {
          await client.del(...keys);
          clearedKeys.push(...keys);
        }
      } while (cursor !== "0" && cursor !== 0);
    }
  } catch (error) {
    context.error("Failed to clear cache.", error);
    return { status: 500, jsonBody: { error: "Failed to clear cache.", clearedKeys } };
  }

  return {
    status: 200,
    jsonBody: { cleared: true, clearedCount: clearedKeys.length, clearedKeys },
  };
}

app.http("cacheClear", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "admin/cache/clear",
  handler: cacheClear,
});
