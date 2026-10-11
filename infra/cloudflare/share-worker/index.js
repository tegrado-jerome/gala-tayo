// go.galatayo.app: short invite links on our own domain. /p/<plan id> and /l?n=..&p=.. are the backend's
// share pages (preview card for chat apps, then straight on to galatayo.app); everything else is a 404.
const API = "https://galatayo-api-cvawfwgrg6akdmem.southeastasia-01.azurewebsites.net/api";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Same list as isPreviewBot in backend/src/functions/sharePlan.ts: bots get the card without the redirect.
const PREVIEW_BOTS = /facebookexternalhit|facebot|twitterbot|slackbot|whatsapp|telegrambot|discordbot|linkedinbot|skypeuripreview|viber|line\/|pinterest|googlebot|bingbot|applebot|embedly/i;

/** The backend share page for a go.galatayo.app URL, or null when the path isn't a share link. */
export function backendUrl(url) {
  const plan = url.pathname.match(/^\/p\/([^/]+)\/?$/)?.[1];
  if (plan) return UUID.test(plan) ? `${API}/share/plans/${plan.toLowerCase()}${url.search}` : null;
  if (/^\/l\/?$/.test(url.pathname)) return `${API}/share/lists${url.search}`;
  return null;
}

const notFound = () =>
  new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
    const url = new URL(request.url);
    const target = backendUrl(url);
    if (!target) return notFound();

    // Bots and people get different pages (no meta refresh for bots), so they're cached apart.
    const bot = PREVIEW_BOTS.test(request.headers.get("user-agent") ?? "");
    const cacheKey = new Request(`${url.origin}${url.pathname}${url.search}${url.search ? "&" : "?"}_v=${bot ? "bot" : "human"}`);
    const cache = caches.default;
    let response = await cache.match(cacheKey);
    if (!response) {
      const upstream = await fetch(target, { headers: { "User-Agent": request.headers.get("user-agent") ?? "", Accept: "text/html" } });
      response = new Response(upstream.body, upstream);
      response.headers.delete("Vary");
      response.headers.set("X-Content-Type-Options", "nosniff");
      response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
      if (upstream.status === 200) ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }
    // Set on every reply: cache hits otherwise come back with the zone's 4-hour browser TTL.
    response = new Response(request.method === "HEAD" ? null : response.body, response);
    response.headers.set("Cache-Control", response.status === 200 ? "public, max-age=300" : "no-store");
    return response;
  },
};
