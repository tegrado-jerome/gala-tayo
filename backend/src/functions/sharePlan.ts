import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { hdPhotoKey } from "../utils/hdPhotos";
import { getR2PublicBaseUrl } from "../utils/r2UrlResolver";
import { getConfiguredSiteUrl } from "../utils/siteUrl";
import { getPlanById, getPlanItems, isActive, isUuid } from "./galaPlans";

const DEFAULT_SITE_URL = "https://galatayo.app";
const DEFAULT_IMAGE = `${DEFAULT_SITE_URL}/images/og/galatayo-og.jpg`;

export type PlanSharePreview = {
  title: string;
  description: string;
  imageUrl: string;
  planUrl: string;
  shareUrl: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

/** A 1200x630 JPG crop of a stop photo for link previews (Cloudflare resizing on the media domain). */
export function socialImageUrl(storageKey: string) {
  return `${getR2PublicBaseUrl()}/cdn-cgi/image/width=1200,height=630,fit=cover,quality=80,format=jpeg,onerror=redirect/${storageKey.replace(/^\/+/, "")}`;
}

/** "[gala_date:2026-10-10]" at the start of a plan description -> "Sat, Oct 10". */
export function planDateLabel(description: string | null) {
  const iso = description?.match(/^\[gala_date:(\d{4}-\d{2}-\d{2})\]/)?.[1];
  if (!iso) return null;
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function mostCommon(values: Array<string | null | undefined>) {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function describePlanShare(input: {
  title: string;
  description: string | null;
  stops: Array<{ slug?: string | null; city: string | null; storageKey: string | null }>;
  planUrl: string;
  shareUrl: string;
}): PlanSharePreview {
  const count = input.stops.length;
  const parts = [
    planDateLabel(input.description),
    count > 0 ? `${count} ${count === 1 ? "stop" : "stops"}` : null,
    mostCommon(input.stops.map((stop) => stop.city)),
  ].filter(Boolean);
  // The full HD photo crops best to 1200x630; places without one use their own photo.
  const photo = input.stops.map((stop) => hdPhotoKey(stop.slug, "full") ?? stop.storageKey).find(Boolean);
  return {
    title: input.title.trim() || "Gala plan",
    description: parts.length ? `${parts.join(" · ")}. Sama ka? RSVP on GalaTayo.` : "Sama ka? RSVP on GalaTayo.",
    imageUrl: photo ? socialImageUrl(photo) : DEFAULT_IMAGE,
    planUrl: input.planUrl,
    shareUrl: input.shareUrl,
  };
}

/** A tiny page that link-preview crawlers read and people are sent on from straight away. */
export function renderSharePage(preview: PlanSharePreview, { refresh = true }: { refresh?: boolean } = {}) {
  const title = escapeHtml(preview.title);
  const description = escapeHtml(preview.description);
  const image = escapeHtml(preview.imageUrl);
  const planUrl = escapeHtml(preview.planUrl);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · GalaTayo</title>
<meta name="robots" content="noindex">
<meta name="description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="GalaTayo">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${escapeHtml(preview.shareUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${image}">
${refresh ? `<meta http-equiv="refresh" content="0; url=${planUrl}">\n` : ""}</head>
<body style="font-family:system-ui,sans-serif;padding:24px">
<p><a href="${planUrl}">Open ${title} on GalaTayo</a></p>
<script>location.replace(${JSON.stringify(preview.planUrl).replace(/</g, "\\u003c")});</script>
</body>
</html>`;
}

// Link-preview crawlers get the card without a meta refresh, so they don't follow it to the app's generic tags.
const PREVIEW_BOTS = /facebookexternalhit|facebot|twitterbot|slackbot|whatsapp|telegrambot|discordbot|linkedinbot|skypeuripreview|viber|line\/|pinterest|googlebot|bingbot|applebot|embedly/i;

export function isPreviewBot(userAgent: string | null) {
  return Boolean(userAgent && PREVIEW_BOTS.test(userAgent));
}

const SHARE_REFS = new Set(["story", "invite", "gc", "copy"]);

/** Carries the share channel (?ref=invite...) through to the plan so the app can count it; anything else is dropped. */
export function planUrlWithRef(planUrl: string, requestUrl: string) {
  const ref = new URL(requestUrl).searchParams.get("ref");
  return ref && SHARE_REFS.has(ref) ? `${planUrl}?ref=${ref}` : planUrl;
}

const HTML_HEADERS = { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex" };

export async function getPlanSharePage(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const siteUrl = getConfiguredSiteUrl() ?? DEFAULT_SITE_URL;
  const id = String(request.params.id ?? "");
  const notFound = (): HttpResponseInit => ({
    status: 404,
    headers: { ...HTML_HEADERS, "Cache-Control": "no-store" },
    body: renderSharePage({ title: "GalaTayo", description: "Plan galas with your barkada.", imageUrl: DEFAULT_IMAGE, planUrl: `${siteUrl}/gala-plans`, shareUrl: request.url }),
  });

  try {
    if (!isUuid(id)) return notFound();
    const plan = await getPlanById(id);
    // Only active plans have a preview; deleted ones show nothing about the plan.
    if (!plan || !isActive(plan)) return notFound();
    const items = (await getPlanItems([plan.id])).get(plan.id) ?? [];
    const preview = describePlanShare({
      title: plan.title,
      description: plan.description,
      stops: items.map((item) => ({ slug: item.places?.slug ?? null, city: item.places?.city ?? null, storageKey: item.places?.storage_key ?? null })),
      planUrl: planUrlWithRef(`${siteUrl}/gala-plans/${plan.id}`, request.url),
      shareUrl: request.url.split("?")[0],
    });
    const refresh = !isPreviewBot(request.headers.get("user-agent"));
    return { status: 200, headers: { ...HTML_HEADERS, "Cache-Control": "public, max-age=300", Vary: "User-Agent" }, body: renderSharePage(preview, { refresh }) };
  } catch (error) {
    context.error("GET /api/share/plans/{id} failed:", error);
    return notFound();
  }
}

app.http("planSharePage", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "share/plans/{id:guid}",
  handler: getPlanSharePage,
});
