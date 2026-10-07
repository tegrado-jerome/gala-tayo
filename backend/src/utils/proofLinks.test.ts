import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_PROOF_LINK_LENGTH,
  formatProofNote,
  getProofSource,
  getProofSourceLabel,
  isMissingColumnError,
  normalizeProofLink,
  normalizeProofLinks,
  splitProofNote,
} from "./proofLinks";

function ok(raw: string) {
  const result = normalizeProofLink(raw);
  assert.ok(result.ok, `expected ${raw} to pass`);
  return result;
}

function fails(raw: string, pattern: RegExp) {
  const result = normalizeProofLink(raw);
  assert.equal(result.ok, false, `expected ${raw} to fail`);
  if (!result.ok) assert.match(result.error, pattern);
}

test("accepts public social posts and tags their source", () => {
  assert.equal(ok("https://www.tiktok.com/@juan/video/7300000000000000000").source, "tiktok");
  assert.equal(ok("https://vt.tiktok.com/ZSabc123/").source, "tiktok");
  assert.equal(ok("https://www.instagram.com/reel/C1abcDEF/").source, "instagram");
  assert.equal(ok("https://m.facebook.com/story.php?story_fbid=1&id=2").source, "facebook");
  assert.equal(ok("https://fb.watch/abc123/").source, "facebook");
  assert.equal(ok("https://www.youtube.com/watch?v=dQw4w9WgXcQ").source, "youtube");
  assert.equal(ok("https://youtu.be/dQw4w9WgXcQ").source, "youtube");
  assert.equal(ok("https://www.reddit.com/r/Philippines/comments/abc/kawasan_falls/").source, "reddit");
});

test("any https article counts, labelled by its site", () => {
  const result = ok("https://www.rappler.com/life-and-style/travel/kawasan-falls-guide/");
  assert.equal(result.source, "article");
  assert.equal(getProofSourceLabel(result.url), "rappler.com");
  assert.equal(getProofSourceLabel("https://www.tiktok.com/@a/video/1"), "TikTok");
});

test("lookalike hosts are not treated as the social site", () => {
  assert.equal(getProofSource("nottiktok.com"), "article");
  assert.equal(getProofSource("tiktok.com.evil.example"), "article");
  assert.equal(getProofSource("www.TikTok.com"), "tiktok");
});

test("strips tracking params and fragments but keeps the ones that identify the post", () => {
  assert.equal(
    ok("https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=abc&feature=shared#t=10").url,
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  );
  assert.equal(ok("https://www.instagram.com/p/C1abc/?igsh=MWQ1ZGUxMzBkMA==").url, "https://www.instagram.com/p/C1abc/");
  assert.equal(
    ok("https://www.tiktok.com/@juan/video/1?is_from_webapp=1&sender_device=pc&_t=x&_r=1").url,
    "https://www.tiktok.com/@juan/video/1"
  );
  assert.equal(
    ok("https://m.facebook.com/story.php?story_fbid=1&id=2&mibextid=abc&fbclid=xyz").url,
    "https://m.facebook.com/story.php?story_fbid=1&id=2"
  );
  assert.equal(
    ok("https://news.example.ph/travel/bohol?utm_source=fb&UTM_Medium=social&page=2").url,
    "https://news.example.ph/travel/bohol?page=2"
  );
  assert.equal(ok("  https://WWW.Rappler.com/travel/x  ").url, "https://www.rappler.com/travel/x");
});

test("rejects non-https and non-public links", () => {
  fails("http://www.tiktok.com/@juan/video/1", /https:\/\//);
  fails("javascript:alert(1)", /https:\/\//);
  fails("data:text/html,hi", /https:\/\//);
  fails("ftp://example.com/file", /https:\/\//);
  fails("www.tiktok.com/@juan/video/1", /full link/);
  fails("kawasan falls", /full link/);
  fails("https://localhost/post", /public web link/);
  fails("https://127.0.0.1/post", /public web link/);
  fails("https://[::1]/post", /public web link/);
  fails("https://user:pass@example.com/post", /public web link/);
  fails("https://example.com:8443/post", /public web link/);
});

test("rejects shorteners, our own site and bare homepages", () => {
  fails("https://bit.ly/3abc", /Short links/);
  fails("https://t.co/abc", /Short links/);
  fails("https://galatayo.app/place/kawasan-falls", /Short links/);
  fails("https://www.tiktok.com/", /homepage/);
  fails("https://www.rappler.com", /homepage/);
});

test("enforces the length limit", () => {
  const long = `https://example.com/${"a".repeat(MAX_PROOF_LINK_LENGTH)}`;
  fails(long, /at most 500/);
});

test("requires 1 to 3 links, ignores blanks and dedupes", () => {
  assert.deepEqual(normalizeProofLinks([]), { ok: false, error: "Add at least 1 link that shows people go there." });
  assert.equal(normalizeProofLinks(["", "  ", null, 5]).ok, false);
  assert.equal(
    normalizeProofLinks(["https://a.example/1", "https://a.example/2", "https://a.example/3", "https://a.example/4"]).ok,
    false
  );

  const result = normalizeProofLinks([
    "",
    "https://www.youtube.com/watch?v=abc&si=1",
    "https://www.youtube.com/watch?v=abc",
    "https://www.rappler.com/travel/x",
  ]);
  assert.deepEqual(result, {
    ok: true,
    links: ["https://www.youtube.com/watch?v=abc", "https://www.rappler.com/travel/x"],
  });
});

test("reports which link is wrong", () => {
  const result = normalizeProofLinks(["https://www.rappler.com/travel/x", "http://example.com/a"]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.index, 1);
    assert.match(result.error, /^Link 2: /);
  }
});

test("admin note fallback round-trips links and keeps the admin's own text", () => {
  const links = ["https://www.tiktok.com/@a/video/1", "https://www.rappler.com/travel/x"];
  const note = formatProofNote(links);
  assert.deepEqual(splitProofNote(note), { links, rest: null });
  assert.deepEqual(splitProofNote(`Looks legit, approved.\n${note}`), { links, rest: "Looks legit, approved." });
  assert.deepEqual(splitProofNote(null), { links: [], rest: null });
  assert.deepEqual(splitProofNote("Proof link: javascript:alert(1)"), { links: [], rest: "Proof link: javascript:alert(1)" });
});

test("detects the missing proof_links column from PostgREST and Postgres errors", () => {
  assert.equal(
    isMissingColumnError({ code: "PGRST204", message: "Could not find the 'proof_links' column of 'place_submissions' in the schema cache" }, "proof_links"),
    true
  );
  assert.equal(isMissingColumnError({ code: "42703", message: "column place_submissions.proof_links does not exist" }, "proof_links"), true);
  assert.equal(isMissingColumnError({ code: "42703", message: "column place_submissions.other does not exist" }, "proof_links"), false);
  assert.equal(isMissingColumnError({ code: "23505", message: "duplicate proof_links" }, "proof_links"), false);
  assert.equal(isMissingColumnError(null, "proof_links"), false);
});
