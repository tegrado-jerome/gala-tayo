import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { galaTayoAnswerText, galaTayoAreaName, galaTayoPlaceLabel, galaTayoReason, isShownPlace, resolveGalaTayoCity } from "./askAiMapsHybridService";

const cities = ["quezon city", "manila", "makati", "taguig", "pasig"];

describe("resolveGalaTayoCity", () => {
  it("maps nicknames and resolved area labels to the stored city", () => {
    assert.equal(resolveGalaTayoCity({ rawQuery: "Quiet cafes in QC", searchAreaText: null }, "Quezon City, Metro Manila, Philippines", cities), "quezon city");
    assert.equal(resolveGalaTayoCity({ rawQuery: "Date spots in BGC", searchAreaText: "BGC" }, "Taguig, Metro Manila, Philippines", cities), "taguig");
    assert.equal(resolveGalaTayoCity({ rawQuery: "cafes", searchAreaText: "Makati" }, "Makati, Metro Manila, Philippines", cities), "makati");
  });

  it("does not read Metro Manila as the City of Manila", () => {
    assert.equal(resolveGalaTayoCity({ rawQuery: "parks in Metro Manila", searchAreaText: "Metro Manila" }, "Metro Manila, Philippines", cities), null);
  });
});

describe("GalaTayo map results", () => {
  const cafe = { description: "Quiet Binondo cafe with pastries. Open late.", category: "Cafe", area: "Binondo", city: "Manila", best_time_to_visit: null };

  it("labels places outside the asked city with their distance, without emoji", () => {
    assert.equal(galaTayoReason(cafe, null), "Quiet Binondo cafe with pastries.");
    assert.equal(galaTayoReason(cafe, { km: 9.43, areaName: "Quezon City" }), "Binondo, about 9.4 km from Quezon City. Quiet Binondo cafe with pastries.");
  });

  it("says plainly when the asked city has none or only a few", () => {
    assert.equal(galaTayoAnswerText("cafes", "Quezon City", 3, 0, true), "No cafes in Quezon City on GalaTayo yet. These are the closest ones.");
    assert.equal(galaTayoAnswerText("cafes", "Quezon City", 3, 1, true), "GalaTayo has 1 cafe in Quezon City so far, plus the closest ones nearby.");
    assert.equal(galaTayoAnswerText("cafes", "Makati", 3, 3, true), "Found 3 cafes in Makati.");
  });

  it("always shows GalaTayo places, even with no reviews yet", () => {
    assert.equal(isShownPlace({ id: "galatayo:abc", reviewCount: 0 }), true);
    assert.equal(isShownPlace({ id: "g-1", galatayoPath: "/places/manila/x", reviewCount: 2 }), true);
    assert.equal(isShownPlace({ id: "g-2", reviewCount: 2 }), false);
    assert.equal(isShownPlace({ id: "g-3", reviewCount: null }), true);
  });
});

describe("GalaTayo map labels", () => {
  it("names the area the way the person said it", () => {
    assert.equal(galaTayoAreaName("QC", "Quezon City, Metro Manila, Philippines", "quezon city"), "QC");
    assert.equal(galaTayoAreaName(null, "BGC Greenway Park, Fort Bonifacio, Taguig", "taguig"), "Taguig");
  });

  it("calls a set of cafes cafes", () => {
    assert.equal(galaTayoPlaceLabel(["Cafe", "Cafe"], "places"), "cafes");
    assert.equal(galaTayoPlaceLabel(["Cafe", "Food"], "places"), "places");
  });
});
