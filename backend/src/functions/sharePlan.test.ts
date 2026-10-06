import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describePlanShare, isPreviewBot, planDateLabel, renderSharePage } from "./sharePlan";

describe("plan share preview", () => {
  const preview = describePlanShare({
    title: "Date night sa BGC",
    description: "[gala_date:2026-10-10]\nDinner then a walk",
    stops: [
      { city: "Taguig", storageKey: null },
      { city: "Taguig", storageKey: "places/bhs/1.jpg" },
      { city: "Makati", storageKey: "places/alamat/1.jpg" },
    ],
    planUrl: "https://galatayo.app/gala-plans/abc",
    shareUrl: "https://api.example/api/share/plans/abc",
  });

  it("uses the plan name, date, stops, city and the first stop photo", () => {
    assert.equal(planDateLabel("[gala_date:2026-10-10]"), "Sat, Oct 10");
    assert.equal(preview.title, "Date night sa BGC");
    assert.equal(preview.description, "Sat, Oct 10 · 3 stops · Taguig. Sama ka? RSVP on GalaTayo.");
    assert.match(preview.imageUrl, /cdn-cgi\/image\/width=1200,height=630,fit=cover.*\/places\/bhs\/1\.jpg$/);
  });

  it("prefers the curated HD photo over an upload", () => {
    const hd = describePlanShare({
      title: "Kain sa Binondo",
      description: null,
      stops: [{ slug: "dong-bei-dumplings", city: "Manila", storageKey: "places/dong-bei-dumplings/dong-bei-dumplings-1.webp" }],
      planUrl: "https://galatayo.app/gala-plans/abc",
      shareUrl: "https://galatayo.app/p/abc",
    });
    assert.match(hd.imageUrl, /\/places\/dong-bei-dumplings\/hd\/dong-bei-dumplings-1\.webp$/);
  });

  it("renders escaped OG tags and sends people on to the plan", () => {
    const html = renderSharePage({ ...preview, title: 'Tara <script>"x"' });
    assert.match(html, /<meta property="og:title" content="Tara &lt;script&gt;&quot;x&quot;">/);
    assert.match(html, /<meta http-equiv="refresh" content="0; url=https:\/\/galatayo.app\/gala-plans\/abc">/);
    assert.match(html, /og:url" content="https:\/\/api.example\/api\/share\/plans\/abc"/);
    assert.match(html, /name="robots" content="noindex"/);
  });

  it("leaves the refresh out for link-preview crawlers", () => {
    assert.equal(isPreviewBot("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"), true);
    assert.equal(isPreviewBot("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), false);
    assert.doesNotMatch(renderSharePage(preview, { refresh: false }), /http-equiv="refresh"/);
  });
});
