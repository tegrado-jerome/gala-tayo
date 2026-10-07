import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { DESTINATIONS, REGIONS, getDestinationBySlug, isMetroManilaDestination } from "../src/utils/phDestinations";
import { getHiddenPlacePaths, getSeoListingPage, getSeoPlaceSummaries, type SeoListingPage, type SeoPlaceSummary } from "../src/utils/seoPlaces";

const AREA_PAGE_SIZE = 10;
const DATA_DIR = path.resolve(__dirname, "../../frontend/public/data");
const OUTPUT_DIR = path.join(DATA_DIR, "place-listings");
const GUIDES_FILE = path.resolve(__dirname, "../../frontend/src/data/seoGuides.json");

type GuideTarget = {
  slug: string;
  areaSlug?: string | null;
  category?: string | null;
  goodFor?: string | null;
};

type ListingTarget = {
  areaSlug: string | null;
  category: string | null;
  goodFor: string | null;
  pageSize: number;
};

function normalizeStaticPart(value: string | null | undefined) {
  return (value || "all")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "all";
}

function getListingPath(target: ListingTarget, page: number) {
  return path.join(
    OUTPUT_DIR,
    `area-${normalizeStaticPart(target.areaSlug)}`,
    `category-${normalizeStaticPart(target.category)}`,
    `good-for-${normalizeStaticPart(target.goodFor)}`,
    `page-${page}-size-${target.pageSize}.json`,
  );
}

async function writeListingPayload(target: ListingTarget, payload: SeoListingPage) {
  const filePath = getListingPath(target, payload.page);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}

async function generateTarget(target: ListingTarget) {
  const firstPage = await getSeoListingPage({
    areaSlug: target.areaSlug,
    category: target.category,
    goodFor: target.goodFor,
    page: 1,
    pageSize: target.pageSize,
  });

  await writeListingPayload(target, firstPage);

  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    const payload = await getSeoListingPage({
      areaSlug: target.areaSlug,
      category: target.category,
      goodFor: target.goodFor,
      page,
      pageSize: target.pageSize,
    });
    await writeListingPayload(target, payload);
  }

  return firstPage;
}

// Metro Manila cities always get listings (their pages predate the nationwide rollout);
// other destinations and regions only once they have places.
function getListingAreaSlugs(places: SeoPlaceSummary[]) {
  const placeAreaSlugs = new Set(places.map((place) => place.areaSlug).filter((slug) => getDestinationBySlug(slug)));
  const metroManilaSlugs = DESTINATIONS.filter((destination) => isMetroManilaDestination(destination)).map((destination) => destination.slug);
  const regionSlugs = REGIONS
    .filter((region) => region.destinations.some((destination) => placeAreaSlugs.has(destination.slug)))
    .map((region) => region.slug);
  return [...new Set([...metroManilaSlugs, ...placeAreaSlugs, ...regionSlugs])];
}

async function writeCompactPlaces(places: SeoPlaceSummary[]) {
  const compact = places.map((place) => ({
    id: place.id,
    slug: place.slug,
    name: place.name,
    category: place.category,
    area: place.area,
    city: place.city,
    areaSlug: place.areaSlug,
    goodFor: place.goodFor,
    budgetMin: place.budgetMin,
    canonicalPath: place.canonicalPath,
    imageUrl: place.imageUrl,
  }));
  await writeFile(path.join(DATA_DIR, "places-compact.json"), `${JSON.stringify(compact)}\n`, "utf8");
  console.log(`Generated places-compact.json with ${compact.length} places`);
}

async function main() {
  const guides = JSON.parse(await readFile(GUIDES_FILE, "utf8")) as GuideTarget[];
  const places = await getSeoPlaceSummaries();
  const areas = getListingAreaSlugs(places);
  const targets: ListingTarget[] = [
    ...areas.map((areaSlug) => ({ areaSlug, category: null, goodFor: null, pageSize: AREA_PAGE_SIZE })),
    ...guides.map((target) => ({
      areaSlug: target.areaSlug ?? null,
      category: target.category ?? null,
      goodFor: target.goodFor ?? null,
      pageSize: AREA_PAGE_SIZE,
    })),
  ];
  const manifest: Array<ListingTarget & { totalPages: number }> = [];

  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  const firstPages = new Map<string, SeoListingPage>();
  for (const target of targets) {
    const firstPage = await generateTarget(target);
    firstPages.set(getListingPath(target, 1), firstPage);
    manifest.push({ ...target, totalPages: firstPage.totalPages });
    console.log(
      `Generated area=${target.areaSlug ?? "all"} category=${target.category ?? "all"} pages=${firstPage.totalPages}`,
    );
  }

  // The guides index shows each guide's place count and lead place without loading every listing.
  const guideSummaries = guides.map((guide) => {
    const firstPage = firstPages.get(getListingPath({ areaSlug: guide.areaSlug ?? null, category: guide.category ?? null, goodFor: guide.goodFor ?? null, pageSize: AREA_PAGE_SIZE }, 1));
    const topPlaces = (firstPage?.items ?? []).slice(0, 5).map((place) => ({ slug: place.slug, name: place.name, imageUrl: place.imageUrl }));
    return { slug: guide.slug, total: firstPage?.total ?? 0, topPlaces };
  });
  await writeFile(path.join(OUTPUT_DIR, "guides.json"), `${JSON.stringify(guideSummaries)}\n`, "utf8");

  await writeCompactPlaces(places);

  // Pages that open by link but are not in the sitemap: hidden places and cities with no places yet.
  // The prerender writes them (noindex) so the host serves 200 + noindex instead of a 404.
  const regionSlugs = new Set(REGIONS.map((region) => region.slug));
  const emptyAreaPaths = areas
    .filter((areaSlug) => !regionSlugs.has(areaSlug) && !places.some((place) => place.areaSlug === areaSlug))
    .map((areaSlug) => `/places/${areaSlug}`);
  const noindexPaths = [...new Set([...(await getHiddenPlacePaths()), ...emptyAreaPaths])].sort();
  await writeFile(path.join(DATA_DIR, "prerender-noindex-paths.json"), `${JSON.stringify(noindexPaths)}
`, "utf8");
  console.log(`Listed ${noindexPaths.length} noindex pages to prerender`);

  await writeFile(path.join(OUTPUT_DIR, "manifest.json"), `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    targets: manifest,
  })}\n`, "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
