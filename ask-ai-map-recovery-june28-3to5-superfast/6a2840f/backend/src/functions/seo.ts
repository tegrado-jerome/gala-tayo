import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSeoAreaPage, getSeoAreaSummaries, getSeoPlaceSummaries } from "../utils/seoPlaces";

type SeoPlacesResponse = {
  areas: Awaited<ReturnType<typeof getSeoAreaSummaries>>;
  places: Awaited<ReturnType<typeof getSeoPlaceSummaries>>;
};

function getSiteUrl(request: HttpRequest): string {
  const configuredSiteUrl = process.env.SITE_URL || process.env.PUBLIC_SITE_URL || process.env.WEBSITE_URL;

  if (configuredSiteUrl && configuredSiteUrl.trim()) {
    return configuredSiteUrl.trim().replace(/\/+$/, "");
  }

  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:4173";

  return `${forwardedProto}://${forwardedHost}`.replace(/\/+$/, "");
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function seoPlaces(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log("Loading SEO places payload.");

  const areaSlug = request.query.get("area")?.trim().toLowerCase();

  if (areaSlug) {
    const areaPage = await getSeoAreaPage(areaSlug);

    if (!areaPage) {
      return {
        status: 404,
        jsonBody: {
          message: `Area not found for slug: ${areaSlug}`,
        },
      };
    }

    return {
      status: 200,
      jsonBody: areaPage,
    };
  }

  const [areas, places] = await Promise.all([getSeoAreaSummaries(), getSeoPlaceSummaries()]);
  const response: SeoPlacesResponse = { areas, places };

  return {
    status: 200,
    jsonBody: response,
  };
}

export async function seoArea(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const areaSlug = request.params.areaSlug;
  context.log(`Loading SEO area payload for ${areaSlug}.`);

  const areaPage = await getSeoAreaPage(areaSlug);

  if (!areaPage) {
    return {
      status: 404,
      jsonBody: {
        message: `Area not found for slug: ${areaSlug}`,
      },
    };
  }

  return {
    status: 200,
    jsonBody: areaPage,
  };
}

export async function sitemapXml(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log("Generating sitemap.xml.");

  const siteUrl = getSiteUrl(request);
  const [areas, places] = await Promise.all([getSeoAreaSummaries(), getSeoPlaceSummaries()]);
  const nowIso = new Date().toISOString();
  const urls = [
    { path: "/", lastmod: nowIso, priority: "1.0", changefreq: "daily" },
    { path: "/places", lastmod: nowIso, priority: "0.9", changefreq: "daily" },
    { path: "/about", lastmod: nowIso, priority: "0.5", changefreq: "monthly" },
    { path: "/privacy", lastmod: nowIso, priority: "0.4", changefreq: "yearly" },
    { path: "/terms", lastmod: nowIso, priority: "0.4", changefreq: "yearly" },
    ...areas.map((area) => ({
      path: area.canonicalPath,
      lastmod: nowIso,
      priority: "0.8",
      changefreq: "weekly",
    })),
    ...places.map((place) => ({
      path: place.canonicalPath,
      lastmod: place.updatedAt ?? nowIso,
      priority: "0.7",
      changefreq: "weekly",
    })),
  ];

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      (url) =>
        [
          "  <url>",
          `    <loc>${xmlEscape(`${siteUrl}${url.path}`)}</loc>`,
          `    <lastmod>${xmlEscape(url.lastmod)}</lastmod>`,
          `    <changefreq>${url.changefreq}</changefreq>`,
          `    <priority>${url.priority}</priority>`,
          "  </url>",
        ].join("\n")
    ),
    "</urlset>",
  ].join("\n");

  return {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=900",
    },
    body,
  };
}

export async function robotsTxt(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log("Generating robots.txt.");

  const siteUrl = getSiteUrl(request);
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /home",
    "Disallow: /search",
    "Disallow: /search?",
    "Disallow: /login",
    "Disallow: /signup",
    "Disallow: /onboarding",
    "Disallow: /auth/",
    "Disallow: /account",
    "Disallow: /find-friends",
    "Disallow: /reports",
    "Disallow: /ask-ai",
    "Disallow: /ask-ai/text",
    "Disallow: /ask-ai/maps",
    "Disallow: /prompt-builder",
    "Disallow: /favorites",
    "Disallow: /history",
    "Disallow: /gala-plan",
    "Disallow: /gala-plans",
    "Disallow: /profile",
    "Disallow: /profile/edit",
    "Disallow: /me",
    "Disallow: /settings",
    "Disallow: /feedback",
    "Disallow: /submit-place",
    "Disallow: /my-submissions",
    "Disallow: /submissions",
    "Disallow: /comment-notices",
    "Disallow: /admin",
    `Sitemap: ${siteUrl}/sitemap.xml`,
  ].join("\n");

  return {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=900",
    },
    body,
  };
}

app.http("seoPlaces", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "seo/places",
  handler: seoPlaces,
});

app.http("seoArea", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "seo/areas/{areaSlug}",
  handler: seoArea,
});

app.http("sitemapXml", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "seo/sitemap.xml",
  handler: sitemapXml,
});

app.http("robotsTxt", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "seo/robots.txt",
  handler: robotsTxt,
});
