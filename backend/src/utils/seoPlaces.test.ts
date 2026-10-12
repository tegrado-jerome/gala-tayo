import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { compareListingOrder, filterListingPlaces, hasCuratedPhoto, resolveAreaSlug } from "./seoPlaces";
import { DESTINATIONS, REGIONS } from "./phDestinations";

test("lists put photo places first, then the best-scored, then A-Z", () => {
  const rows = [
    { slug: "zz-no-photo-unscored", name: "Zz", hasPhoto: false },
    { slug: "intramuros", name: "Intramuros", hasPhoto: false },
    { slug: "aa-photo-unscored", name: "Aa", hasPhoto: true },
    { slug: "fort-santiago", name: "Fort Santiago", hasPhoto: true },
  ];

  assert.deepEqual(
    [...rows].sort(compareListingOrder).map((row) => row.slug),
    ["fort-santiago", "aa-photo-unscored", "intramuros", "zz-no-photo-unscored"]
  );
});

test("curated photo slugs match the frontend photo manifest", () => {
  const manifestPath = path.resolve(__dirname, "../../../frontend/src/data/placeCardPhotos.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, string>;

  for (const slug of Object.keys(manifest)) {
    assert.ok(hasCuratedPhoto(slug), `${slug} is in placeCardPhotos.json but not in data/hdPhotoSlugs.json`);
  }
});

function listedPlace(city: string, area: string | null, category = "Park", goodFor: string[] = []) {
  return { areaSlug: resolveAreaSlug(city, area).slug, category, goodFor };
}

// A tile says "Tagaytay · 8 places" from the compact list; the page it links to must show those 8.
test("every city and region page lists exactly the places its tile counts", () => {
  const places = [
    ...DESTINATIONS.map((destination, index) => listedPlace(destination.name, null, index % 2 ? "Food" : "Park")),
    listedPlace("Tagaytay", "Kaybagal South"),
    listedPlace("Ormoc", "Danao"),
  ];
  const tileCounts: Record<string, number> = {};
  for (const place of places) tileCounts[place.areaSlug] = (tileCounts[place.areaSlug] ?? 0) + 1;

  for (const destination of DESTINATIONS) {
    assert.equal(filterListingPlaces(places, { areaSlug: destination.slug }).length, tileCounts[destination.slug] ?? 0, destination.slug);
  }
  for (const region of REGIONS) {
    const regionTotal = region.destinations.reduce((sum, destination) => sum + (tileCounts[destination.slug] ?? 0), 0);
    assert.equal(filterListingPlaces(places, { areaSlug: region.slug }).length, regionTotal, region.slug);
  }
});

test("area pages match places on their resolved town, not on a shared alias", () => {
  // Lake Danao is in Ormoc; "Danao" is also an alias of Danao, Bohol, which once put it in Central Visayas.
  const lakeDanao = listedPlace("Ormoc", "Danao");
  assert.equal(lakeDanao.areaSlug, "ormoc");
  assert.equal(filterListingPlaces([lakeDanao], { areaSlug: "central-visayas" }).length, 0);
  assert.equal(filterListingPlaces([lakeDanao], { areaSlug: "danao-bohol" }).length, 0);
  assert.equal(filterListingPlaces([lakeDanao], { areaSlug: "eastern-visayas" }).length, 1);
});

test("guide listings filter by category and good-for tags within the area", () => {
  const places = [listedPlace("Tagaytay", null, "Park", ["Date Night"]), listedPlace("Tagaytay", null, "Food", ["Food Trip"])];
  assert.equal(filterListingPlaces(places, { areaSlug: "tagaytay", categoryLabel: "Food" }).length, 1);
  assert.equal(filterListingPlaces(places, { areaSlug: null, goodForTags: ["Date Night", "Casual Date"] }).length, 1);
});

test("the frontend and backend hidden lists match, so counts and pages hide the same places", () => {
  const read = (relativePath: string) => JSON.parse(readFileSync(path.resolve(__dirname, relativePath), "utf8")) as { hidden: string[] };
  assert.deepEqual(read("../../../frontend/src/data/galaWorthy.json").hidden, read("../data/galaWorthy.json").hidden);
});
