import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { CATEGORIES } from "../src/functions/filters";
import { DESTINATIONS, REGIONS, getDestinationBySlug, isMetroManilaDestination } from "../src/utils/phDestinations";
import { getSeoListingPage, getSeoPlaceSummaries, type SeoListingPage, type SeoPlaceSummary } from "../src/utils/seoPlaces";

const AREA_PAGE_SIZE = 10;
const CATEGORY_PAGE_SIZE = 12;
const DATA_DIR = path.resolve(__dirname, "../../frontend/public/data");
const OUTPUT_DIR = path.join(DATA_DIR, "place-listings");
const GUIDES_FILE = path.resolve(__dirname, "../../frontend/src/data/seoGuides.json");

type GuideTarget = {
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

  return firstPage.totalPages;
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
  const categories = CATEGORIES.map((category) => category.id);
  const targets: ListingTarget[] = [
    ...areas.map((areaSlug) => ({ areaSlug, category: null, goodFor: null, pageSize: AREA_PAGE_SIZE })),
    ...categories.map((category) => ({ areaSlug: null, category, goodFor: null, pageSize: CATEGORY_PAGE_SIZE })),
    ...areas.flatMap((areaSlug) =>
      categories.map((category) => ({ areaSlug, category, goodFor: null, pageSize: AREA_PAGE_SIZE })),
    ),
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

  for (const target of targets) {
    const totalPages = await generateTarget(target);
    manifest.push({ ...target, totalPages });
    console.log(
      `Generated area=${target.areaSlug ?? "all"} category=${target.category ?? "all"} pages=${totalPages}`,
    );
  }

  await writeCompactPlaces(places);

  await writeFile(path.join(OUTPUT_DIR, "manifest.json"), `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    targets: manifest,
  })}\n`, "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
