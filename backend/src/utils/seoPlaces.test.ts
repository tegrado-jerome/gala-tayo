import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { compareListingOrder, hasCuratedPhoto } from "./seoPlaces";

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
