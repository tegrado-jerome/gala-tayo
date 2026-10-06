import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeListShare, parseSharedListQuery } from "./shareList";
import { renderSharePage } from "./sharePlan";

describe("parseSharedListQuery", () => {
  it("keeps valid slugs once and cleans the name and author", () => {
    assert.deepEqual(parseSharedListQuery(new URLSearchParams("n=  Date%20night &p=a,a,B,../x&by=juan<b>")), {
      name: "Date night",
      slugs: ["a", "b"],
      by: "juanb",
    });
  });

  it("rejects a list without a name or places", () => {
    assert.equal(parseSharedListQuery(new URLSearchParams("n=&p=a")), null);
    assert.equal(parseSharedListQuery(new URLSearchParams("n=x&p=")), null);
  });
});

describe("describeListShare", () => {
  it("summarises the places and uses a curated photo when there is one", () => {
    const preview = describeListShare({
      list: { name: "Rainy day", slugs: ["unknown-spot", "fort-santiago"], by: "maria" },
      places: [
        { slug: "unknown-spot", city: "Manila" },
        { slug: "fort-santiago", city: "Manila" },
      ],
      listUrl: "https://galatayo.app/lists/shared?n=Rainy+day",
      shareUrl: "https://api.example/api/share/lists?n=Rainy+day",
    });
    assert.equal(preview.title, "Rainy day");
    assert.equal(preview.description, "2 places · Manila. A Gala list by @maria on GalaTayo.");
    assert.match(preview.imageUrl, /places\/fort-santiago\/hd\/fort-santiago-1\.webp$/);
  });

  it("escapes the list name in the preview page", () => {
    const preview = describeListShare({
      list: { name: '<script>"x"', slugs: ["a"], by: null },
      places: [],
      listUrl: "https://galatayo.app/lists/shared",
      shareUrl: "https://api.example/api/share/lists",
    });
    const html = renderSharePage(preview);
    assert.ok(!html.includes("<script>\"x\""));
    assert.ok(html.includes("&lt;script&gt;"));
  });
});
