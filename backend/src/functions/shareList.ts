import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getActiveNormalizedPlaces } from "../domain/places";
import { hasCuratedPhoto } from "../utils/seoPlaces";
import { getConfiguredSiteUrl } from "../utils/siteUrl";
import { isPreviewBot, renderSharePage, socialImageUrl, type PlanSharePreview } from "./sharePlan";

const DEFAULT_SITE_URL = "https://galatayo.app";
const DEFAULT_IMAGE = `${DEFAULT_SITE_URL}/images/og/galatayo-og.jpg`;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/;
const MAX_PLACES = 60;

export type SharedListQuery = { name: string; slugs: string[]; by: string | null };

/** Same rules as the app's decodeSharedList: a name and at least one valid slug. */
export function parseSharedListQuery(params: URLSearchParams): SharedListQuery | null {
  const name = (params.get("n") ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  const slugs = Array.from(
    new Set(
      (params.get("p") ?? "")
        .split(",")
        .map((slug) => slug.trim().toLowerCase())
        .filter((slug) => SLUG_PATTERN.test(slug))
    )
  ).slice(0, MAX_PLACES);
  const by = (params.get("by") ?? "").replace(/[^\w.]/g, "").slice(0, 40) || null;
  return name && slugs.length > 0 ? { name, slugs, by } : null;
}

export function describeListShare(input: {
  list: SharedListQuery;
  places: Array<{ slug: string; city: string | null }>;
  listUrl: string;
  shareUrl: string;
}): PlanSharePreview {
  const count = input.places.length;
  const cities = Array.from(new Set(input.places.map((place) => place.city).filter((city): city is string => Boolean(city)))).slice(0, 2);
  const parts = [count > 0 ? `${count} ${count === 1 ? "place" : "places"}` : null, cities.join(", ") || null].filter(Boolean);
  const byLine = input.list.by ? `A Gala list by @${input.list.by}` : "A Gala list";
  const photoSlug = input.places.find((place) => hasCuratedPhoto(place.slug))?.slug;
  return {
    title: input.list.name,
    description: `${parts.length ? `${parts.join(" · ")}. ` : ""}${byLine} on GalaTayo.`,
    imageUrl: photoSlug ? socialImageUrl(`places/${photoSlug}/hd/${photoSlug}-1.webp`) : DEFAULT_IMAGE,
    planUrl: input.listUrl,
    shareUrl: input.shareUrl,
  };
}

/** Link-preview page for a shared Gala list. Lists live in the link itself, so no lookup by id is needed. */
export async function getListSharePage(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const siteUrl = getConfiguredSiteUrl() ?? DEFAULT_SITE_URL;
  const headers = { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex" };
  const list = parseSharedListQuery(new URL(request.url).searchParams);
  if (!list) {
    return {
      status: 404,
      headers: { ...headers, "Cache-Control": "no-store" },
      body: renderSharePage({ title: "GalaTayo", description: "Save places into Gala lists and share them.", imageUrl: DEFAULT_IMAGE, planUrl: `${siteUrl}/favorites`, shareUrl: request.url }),
    };
  }

  const query = new URL(request.url).search;
  const listUrl = `${siteUrl}/lists/shared${query}`;
  let places: Array<{ slug: string; city: string | null }> = [];
  try {
    const bySlug = new Map((await getActiveNormalizedPlaces()).map((place) => [place.slug, place]));
    places = list.slugs.flatMap((slug) => {
      const place = bySlug.get(slug);
      return place ? [{ slug, city: place.city }] : [];
    });
  } catch (error) {
    context.warn("Shared list preview could not load places:", error);
  }

  const preview = describeListShare({ list, places, listUrl, shareUrl: request.url });
  const refresh = !isPreviewBot(request.headers.get("user-agent"));
  return { status: 200, headers: { ...headers, "Cache-Control": "public, max-age=600", Vary: "User-Agent" }, body: renderSharePage(preview, { refresh }) };
}

app.http("listSharePage", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "share/lists",
  handler: getListSharePage,
});
