// Daily smoke test of the live site. Each check covers an outage we have hit before.
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const SITE = "https://galatayo.app";
const API = "https://galatayo-api-cvawfwgrg6akdmem.southeastasia-01.azurewebsites.net/api";
const MEDIA_IMAGE = "https://media.galatayo.app/places/glorietta/glorietta-1.webp";
const SCOPE_REJECTION = "does not align with the purpose of GalaTayo";

async function timedFetch(url, options = {}) {
  const started = Date.now();
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(90_000) });
  return { response, seconds: (Date.now() - started) / 1000 };
}

const checks = {
  async "Site loads"() {
    const { response } = await timedFetch(SITE);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  },

  async "API health"() {
    const { response } = await timedFetch(`${API}/health`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  },

  // Slow repeat loads mean the Redis cache is down (Upstash deletes idle free databases).
  async "Place page is fast (Redis cache)"() {
    await timedFetch(`${API}/places/glorietta`);
    const { response, seconds } = await timedFetch(`${API}/places/glorietta`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (seconds > 5) throw new Error(`took ${seconds.toFixed(1)}s (expected under 5s)`);
  },

  // Fails when the media.galatayo.app DNS record or R2 custom domain is missing.
  async "Place photos (R2 media domain)"() {
    const { response } = await timedFetch(MEDIA_IMAGE);
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.startsWith("image/")) {
      throw new Error(`HTTP ${response.status} ${type}`);
    }
  },

  // Fails when Groq retires a model or the key stops working.
  async "Chatbot answers (Groq)"() {
    const { response } = await timedFetch(`${API}/ask-ai/chatbot`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ask-ai-guest-id": randomUUID() },
      body: JSON.stringify({ message: "Plan a food trip in Makati" }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(`HTTP ${response.status} ${data.userMessage ?? data.error ?? ""}`);
    if (!data.answer || data.answer.includes(SCOPE_REJECTION)) {
      throw new Error(`bad answer: ${String(data.answer).slice(0, 120)}`);
    }
  },

  // Fails when OpenStreetMap blocks our tile requests (e.g. missing Referer).
  async "Map tiles load (OpenStreetMap)"() {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const statuses = [];
      page.on("response", (response) => {
        if (response.url().includes("tile.openstreetmap.org")) statuses.push(response.status());
      });
      await page.goto(`${SITE}/ask-ai/maps`, { waitUntil: "networkidle", timeout: 60_000 });
      await page.waitForTimeout(3000);
      const blocked = statuses.filter((status) => status !== 200);
      if (statuses.length === 0) throw new Error("no map tiles requested");
      if (blocked.length > 0) throw new Error(`${blocked.length}/${statuses.length} tiles failed (${blocked[0]})`);
    } finally {
      await browser.close();
    }
  },
};

let failed = 0;
for (const [name, run] of Object.entries(checks)) {
  try {
    await run();
    console.log(`PASS  ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
    console.log(`::error title=${name}::${error.message}`);
  }
}

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll checks passed.");
