/**
 * Local stand-in for the assistant API, for UI work and screenshots without AI keys:
 * POST /api/ask-ai/assistant runs the real agent with recorded model turns (fixtures) over the places snapshot,
 * streaming NDJSON with a little delay. Other GET requests are proxied to the live API.
 *
 *   npx tsx scripts/ai-eval/mockServer.ts [port]      then build the frontend with VITE_API_BASE_URL=http://localhost:<port>/api
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { runAssistant } from "../../src/services/assistant/agent";
import conversations from "../../src/services/assistant/fixtures/conversations.json";
import { allFixturePlaces } from "../../src/services/assistant/fixtures/testPlaces";
import { parseClientMemory } from "../../src/services/assistant/memory";
import { MockProvider, type RecordedConversation } from "../../src/services/assistant/providers/mock";
import { hdPhotoKey } from "../../src/utils/hdPhotos";
import { buildImageUrl } from "../../src/utils/r2UrlResolver";
import { FIXTURE_TODAY, RAINY } from "./record";

const port = Number(process.argv[2] ?? 7199);
const LIVE = "https://galatayo-api-cvawfwgrg6akdmem.southeastasia-01.azurewebsites.net/api";
const provider = new MockProvider((conversations as { conversations: RecordedConversation[] }).conversations);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const usage = (usageType: string, dailyLimit: number) => ({ usageType, allowed: true, dailyLimit, requestCount: 1, remaining: dailyLimit - 1, resetsAt: new Date(Date.now() + 864e5).toISOString() });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, x-ask-ai-guest-id, x-request-id, cache-control, pragma",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${port}`);
  if (request.method === "OPTIONS") return response.writeHead(204, cors).end();
  if (url.pathname === "/api/ask-ai/usage/check") {
    response.writeHead(200, { ...cors, "Content-Type": "application/json" });
    return response.end(JSON.stringify({ chatbotAi: usage("chatbot_ai", 5), askAiMaps: usage("ask_ai_maps", 3) }));
  }
  if (url.pathname === "/api/ask-ai/cancel") return response.writeHead(200, cors).end("{}");
  if (url.pathname === "/api/ask-ai/assistant" && request.method === "POST") {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw || "{}");
    response.writeHead(200, { ...cors, "Content-Type": "application/x-ndjson" });
    const write = (event: unknown) => response.write(`${JSON.stringify(event)}\n`);
    const events: unknown[] = [];
    const result = await runAssistant(
      { message: String(body.message ?? ""), mode: body.mode === "map" ? "map" : "chat", history: Array.isArray(body.history) ? body.history : [], memory: parseClientMemory(body.memory), requestId: randomUUID() },
      { providers: [provider], tools: { places: allFixturePlaces, weather: async () => RAINY }, imageUrl: (place) => buildImageUrl(hdPhotoKey(place.slug)), today: () => FIXTURE_TODAY },
      (event) => events.push(event)
    );
    // Replay with timing like the real stream: status, cards, then words.
    for (const event of events as Array<{ type: string }>) {
      write(event.type === "final" ? { type: "final", response: { ...result, usage: usage(body.mode === "map" ? "ask_ai_maps" : "chatbot_ai", 5) } } : event);
      await sleep(event.type === "delta" ? 25 : 250);
    }
    return response.end();
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/")) {
    const upstream = await fetch(`${LIVE}${url.pathname.slice(4)}${url.search}`).catch(() => null);
    response.writeHead(upstream?.status ?? 502, { ...cors, "Content-Type": upstream?.headers.get("content-type") ?? "application/json" });
    return response.end(upstream ? Buffer.from(await upstream.arrayBuffer()) : "{}");
  }
  response.writeHead(404, cors).end("{}");
}).listen(port, () => console.log(`assistant mock on http://localhost:${port}/api`));
