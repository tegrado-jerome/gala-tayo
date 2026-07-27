import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { CATEGORIES, METRO_MANILA_AREAS } from "../src/functions/filters";
import { getSeoListingPage, type SeoListingPage } from "../src/utils/seoPlaces";
import { SEO_LANDING_TARGETS } from "../src/utils/seoLandingPages";

const AREA_PAGE_SIZE = 10;
const CATEGORY_PAGE_SIZE = 12;
const OUTPUT_DIR = path.resolve(__dirname, "../../frontend/public/data/place-listings");

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

async function main() {
  const areas = METRO_MANILA_AREAS.filter((area) => area.id !== "all").map((area) => area.id);
  const categories = CATEGORIES.map((category) => category.id);
  const targets: ListingTarget[] = [
    ...areas.map((areaSlug) => ({ areaSlug, category: null, goodFor: null, pageSize: AREA_PAGE_SIZE })),
    ...categories.map((category) => ({ areaSlug: null, category, goodFor: null, pageSize: CATEGORY_PAGE_SIZE })),
    ...areas.flatMap((areaSlug) =>
      categories.map((category) => ({ areaSlug, category, goodFor: null, pageSize: AREA_PAGE_SIZE })),
    ),
    ...SEO_LANDING_TARGETS.map((target) => ({
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

  await writeFile(path.join(OUTPUT_DIR, "manifest.json"), `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    targets: manifest,
  })}\n`, "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
