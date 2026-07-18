import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { CATEGORIES } from "./filters";
import { checkEndpointRateLimit } from "../utils/redisRateLimit";
import { getSeoAreaPage, getSeoAreaSummaries, getSeoPlaceSummaries } from "../utils/seoPlaces";

type SitemapEntry = {
  path: string;
  changefreq: string;
  priority: string;
  lastmod?: string | null;
};

type CategoryCount = {
  id: string;
  placeCount: number;
  latestUpdatedAt: string | null;
};

type AreaCount = {
  slug: string;
  placeCount: number;
  latestUpdatedAt: string | null;
};

function getSiteUrl(request: HttpRequest): string {
  const configuredSiteUrl = process.env.SITE_URL || process.env.PUBLIC_SITE_URL;

  if (configuredSiteUrl && configuredSiteUrl.trim()) {
    return configuredSiteUrl.trim().replace(/\/+$/, "");
  }

  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:4173";
  const requestOrigin = new URL(request.url).origin;

  if (!host || host === "localhost:4173") {
    return requestOrigin.replace(/\/+$/, "");
  }

  if (host.includes(":")) {
    return `${forwardedProto}://${host}`.replace(/\/+$/, "");
  }

  return `${forwardedProto}://${host}`.replace(/\/+$/, "") || requestOrigin.replace(/\/+$/, "");
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isValidIsoDate(value: string | null | undefined): value is string {
  return Boolean(value && !Number.isNaN(Date.parse(value)));
}

function pickLatestTimestamp(current: string | null, candidate: string | null): string | null {
  if (!isValidIsoDate(candidate)) {
    return current;
  }

  if (!isValidIsoDate(current)) {
    return candidate;
  }

  return Date.parse(candidate) > Date.parse(current) ? candidate : current;
}

function buildCategoryLookup() {
  const lookup = new Map<string, string>()

  for (const category of CATEGORIES) {
    lookup.set(normalizeKey(category.id), category.id)
    lookup.set(normalizeKey(category.name), category.id)
  }

  return lookup
}

function buildAreaCounts(places: Awaited<ReturnType<typeof getSeoPlaceSummaries>>): Map<string, AreaCount> {
  const areaCounts = new Map<string, AreaCount>()

  for (const place of places) {
    const existing = areaCounts.get(place.areaSlug)

    if (!existing) {
      areaCounts.set(place.areaSlug, {
        slug: place.areaSlug,
        placeCount: 1,
        latestUpdatedAt: place.updatedAt ?? null,
      })
      continue
    }

    existing.placeCount += 1
    existing.latestUpdatedAt = pickLatestTimestamp(existing.latestUpdatedAt, place.updatedAt ?? null)
  }

  return areaCounts
}

function buildCategoryCounts(places: Awaited<ReturnType<typeof getSeoPlaceSummaries>>): Map<string, CategoryCount> {
  const lookup = buildCategoryLookup()
  const categoryCounts = new Map<string, CategoryCount>()

  for (const place of places) {
    const normalizedCategory = normalizeKey(place.category ?? "")
    const categoryId = lookup.get(normalizedCategory)

    if (!categoryId) {
      continue
    }

    const existing = categoryCounts.get(categoryId)

    if (!existing) {
      categoryCounts.set(categoryId, {
        id: categoryId,
        placeCount: 1,
        latestUpdatedAt: place.updatedAt ?? null,
      })
      continue
    }

    existing.placeCount += 1
    existing.latestUpdatedAt = pickLatestTimestamp(existing.latestUpdatedAt, place.updatedAt ?? null)
  }

  return categoryCounts
}

function buildSitemapEntries(args: {
  areas: Awaited<ReturnType<typeof getSeoAreaSummaries>>
  places: Awaited<ReturnType<typeof getSeoPlaceSummaries>>
}): SitemapEntry[] {
  const { areas, places } = args
  const areaCounts = buildAreaCounts(places)
  const categoryCounts = buildCategoryCounts(places)

  const staticEntries: SitemapEntry[] = [
    { path: "/", priority: "1.0", changefreq: "daily" },
    { path: "/places", priority: "0.9", changefreq: "daily" },
    { path: "/places/categories", priority: "0.8", changefreq: "weekly" },
    { path: "/about", priority: "0.6", changefreq: "monthly" },
    { path: "/privacy", priority: "0.4", changefreq: "yearly" },
    { path: "/terms", priority: "0.4", changefreq: "yearly" },
  ]

  const areaEntries: SitemapEntry[] = areas
    .filter((area) => area.placeCount > 0)
    .map((area) => ({
      path: area.canonicalPath,
      priority: "0.8",
      changefreq: "weekly",
      lastmod: areaCounts.get(area.slug)?.latestUpdatedAt ?? null,
    }))

  const categoryEntries: SitemapEntry[] = CATEGORIES
    .filter((category) => (categoryCounts.get(category.id)?.placeCount ?? 0) > 0)
    .map((category) => ({
      path: `/places/categories/${category.id}`,
      priority: "0.7",
      changefreq: "weekly",
      lastmod: categoryCounts.get(category.id)?.latestUpdatedAt ?? null,
    }))

  const placeEntries: SitemapEntry[] = places.map((place) => ({
    path: place.canonicalPath,
    priority: "0.7",
    changefreq: "weekly",
    lastmod: place.updatedAt ?? null,
  }))

  return [...staticEntries, ...categoryEntries, ...areaEntries, ...placeEntries]
}

export async function seoPlaces(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const rateCheck = await checkEndpointRateLimit(request, "seo-places", 30, 60)
  if (!rateCheck.allowed && rateCheck.response) {
    return rateCheck.response
  }

  context.log("Loading SEO places payload.")

  const areaSlug = request.query.get("area")?.trim().toLowerCase()

  if (areaSlug) {
    const areaPage = await getSeoAreaPage(areaSlug)

    if (!areaPage) {
      return {
        status: 404,
        jsonBody: {
          message: `Area not found for slug: ${areaSlug}`,
        },
      }
    }

    return {
      status: 200,
      jsonBody: areaPage,
    }
  }

  const places = await getSeoPlaceSummaries()
  const areas = await getSeoAreaSummaries(places)

  return {
    status: 200,
    jsonBody: { areas, places },
  }
}

export async function seoArea(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const rateCheck = await checkEndpointRateLimit(request, "seo-area", 30, 60)
  if (!rateCheck.allowed && rateCheck.response) {
    return rateCheck.response
  }

  const areaSlug = request.params.areaSlug
  context.log(`Loading SEO area payload for ${areaSlug}.`)

  const areaPage = await getSeoAreaPage(areaSlug)

  if (!areaPage) {
    return {
      status: 404,
      jsonBody: {
        message: `Area not found for slug: ${areaSlug}`,
      },
    }
  }

  return {
    status: 200,
    jsonBody: areaPage,
  }
}

export async function sitemapXml(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const rateCheck = await checkEndpointRateLimit(request, "sitemap", 10, 60)
  if (!rateCheck.allowed && rateCheck.response) {
    return rateCheck.response
  }

  context.log("Generating sitemap.xml.")

  const siteUrl = getSiteUrl(request)
  const places = await getSeoPlaceSummaries({
    onImageLoadError: (error) => {
      context.warn("Failed to load approved place images for sitemap; continuing without image entries.", error)
    },
  })
  const areas = await getSeoAreaSummaries(places)
  const urls = buildSitemapEntries({ areas, places })

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) =>
      [
        "  <url>",
        `    <loc>${xmlEscape(`${siteUrl}${url.path}`)}</loc>`,
        url.lastmod ? `    <lastmod>${xmlEscape(url.lastmod)}</lastmod>` : null,
        `    <changefreq>${url.changefreq}</changefreq>`,
        `    <priority>${url.priority}</priority>`,
        "  </url>",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    "</urlset>",
  ].join("\n")

  return {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=900",
    },
    body,
  }
}

export async function robotsTxt(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log("Generating robots.txt.")

  const siteUrl = getSiteUrl(request)
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
    "Disallow: /settings",
    "Disallow: /find-friends",
    "Disallow: /reports",
    "Disallow: /ask-ai",
    "Disallow: /ask-ai/chatbot",
    "Disallow: /ask-ai/text",
    "Disallow: /ask-ai/maps",
    "Disallow: /ask-ai/prompt-builder",
    "Disallow: /prompt-builder",
    "Disallow: /favorites",
    "Disallow: /history",
    "Disallow: /gala-plan",
    "Disallow: /gala-plans",
    "Disallow: /profile",
    "Disallow: /profile/edit",
    "Disallow: /me",
    "Disallow: /feedback",
    "Disallow: /submit-place",
    "Disallow: /places/new",
    "Disallow: /places/submit",
    "Disallow: /my-submissions",
    "Disallow: /submissions",
    "Disallow: /comment-notices",
    "Disallow: /u/",
    "Disallow: /admin",
    `Sitemap: ${siteUrl}/sitemap.xml`,
  ].join("\n")

  return {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=900",
    },
    body,
  }
}

app.http("seoPlaces", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "seo/places",
  handler: seoPlaces,
})

app.http("seoArea", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "seo/areas/{areaSlug}",
  handler: seoArea,
})

app.http("sitemapXml", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "seo/sitemap.xml",
  handler: sitemapXml,
})

app.http("robotsTxt", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "seo/robots.txt",
  handler: robotsTxt,
})
