/**
 * GalaTayo AI eval harness. Runs suite.json against a deployed API and writes a scorecard.
 *
 *   npx tsx scripts/ai-eval/run.ts --target legacy --label baseline
 *   npx tsx scripts/ai-eval/run.ts --target assistant --label after --base https://.../api
 *
 * Options: --base <api url>, --target legacy|assistant, --label <name>, --delay <ms between requests, default 35000>,
 * --only <id,id>, --limit <n>, --append (re-score the cases already in results/<label>.json and run only the missing ones;
 * with nothing missing it just re-scores). Auth: guest mode by default (a fresh guest id per conversation, so each one stays inside
 * the guest daily limit); set EVAL_ACCESS_TOKEN to a GalaTayo QA account access token to run as that account instead.
 * Set ASSISTANT_EVAL_KEY to the API's secret of the same name to skip the daily AI limits (assistant target only).
 * Curated places come from Supabase (public anon key, read from frontend/.env or EVAL_SUPABASE_URL / EVAL_SUPABASE_KEY)
 * minus the gala-worthy hidden list.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import galaWorthy from "../../src/data/galaWorthy.json";
import { validateAssistantResponse } from "../../src/services/assistant/schema";
import {
  CuratedIndex,
  isRefusalText,
  scoreCase,
  summarise,
  toMarkdown,
  type CaseScore,
  type CuratedPlace,
  type EvalCase,
  type PlaceRef,
  type Scorecard,
  type TurnAnswer,
} from "./score";

const DEFAULT_BASE = "https://galatayo-api-cvawfwgrg6akdmem.southeastasia-01.azurewebsites.net/api";
const here = __dirname;

function arg(name: string, fallback: string | null = null): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function readEnvFile(file: string): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
        .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim().replace(/^"|"$/g, "")])
    );
  } catch {
    return {};
  }
}

async function loadCurated(): Promise<CuratedPlace[]> {
  const env = readEnvFile(path.resolve(here, "../../../frontend/.env"));
  const url = process.env.EVAL_SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const key = process.env.EVAL_SUPABASE_KEY ?? env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Set EVAL_SUPABASE_URL and EVAL_SUPABASE_KEY (or keep frontend/.env).");
  const hidden = new Set((galaWorthy as { hidden: string[] }).hidden.map((slug) => slug.toLowerCase()));
  const rows: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += 1000) {
    const response = await fetch(`${url}/rest/v1/places?select=slug,name,city,area,category,latitude,longitude,budget_min,budget_note&status=eq.active`, {
      headers: { apikey: key, Range: `${from}-${from + 999}` },
    });
    if (!response.ok) throw new Error(`Supabase places ${response.status}`);
    const page = (await response.json()) as Array<Record<string, unknown>>;
    rows.push(...page);
    if (page.length < 1000) break;
  }
  const num = (value: unknown) => (value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null);
  return rows.map((row) => ({
    slug: String(row.slug),
    name: String(row.name ?? ""),
    city: (row.city as string) ?? null,
    area: (row.area as string) ?? null,
    category: (row.category as string) ?? null,
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    budget_min: num(row.budget_min),
    budget_note: (row.budget_note as string) ?? null,
    hidden: hidden.has(String(row.slug).toLowerCase()),
  }));
}

type Conversation = { guestId: string; history: Array<{ role: "user" | "assistant"; content: string }>; memory: unknown };

function headers(conversation: Conversation, requestId: string) {
  const token = process.env.EVAL_ACCESS_TOKEN;
  const evalKey = process.env.ASSISTANT_EVAL_KEY;
  return {
    "Content-Type": "application/json",
    "x-request-id": requestId,
    ...(token ? { Authorization: `Bearer ${token}` } : { "x-ask-ai-guest-id": conversation.guestId }),
    ...(evalKey ? { "x-assistant-eval-key": evalKey } : {}),
  };
}

function slugFromPath(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const match = url.match(/\/places\/[^/]+\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

const RATE_LIMIT_CODES = /RATE_LIMIT|rate.?limit|PROVIDER_BUSY|TEMPORARY/i;

async function legacyChat(base: string, conversation: Conversation, message: string): Promise<TurnAnswer> {
  const started = Date.now();
  const response = await fetch(`${base}/ask-ai/chatbot`, {
    method: "POST",
    headers: headers(conversation, randomUUID()),
    body: JSON.stringify({ question: message, conversationHistory: conversation.history }),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, any>;
  const totalMs = Date.now() - started;
  const text = typeof data.answer === "string" ? data.answer : "";
  conversation.history.push({ role: "user", content: message }, ...(text ? [{ role: "assistant" as const, content: text }] : []));
  const places: PlaceRef[] = (Array.isArray(data.sources) ? data.sources : []).map((source: any) => ({ slug: slugFromPath(source?.url), name: source?.title ?? null }));
  return {
    status: response.status,
    text,
    places,
    refused: isRefusalText(text),
    firstTokenMs: null,
    totalMs,
    payloadErrors: response.ok && !text ? ["no answer text"] : [],
    rateLimited: response.status === 429 || (response.status === 503 && RATE_LIMIT_CODES.test(`${data.errorCode ?? ""} ${data.error ?? ""}`)),
    error: response.ok ? null : `${response.status} ${data.errorCode ?? data.error ?? ""}`.trim(),
  };
}

async function legacyMap(base: string, conversation: Conversation, message: string): Promise<TurnAnswer> {
  const started = Date.now();
  const response = await fetch(`${base}/ask-ai/maps`, {
    method: "POST",
    headers: headers(conversation, randomUUID()),
    body: JSON.stringify({ query: message, selectedChips: [], nearMe: false, openNow: false }),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, any>;
  const totalMs = Date.now() - started;
  const list: any[] = Array.isArray(data.places) ? data.places : [];
  const payloadErrors = list.filter((place) => !Number.isFinite(place?.latitude) || !Number.isFinite(place?.longitude)).map((place) => `no coordinates for ${place?.name}`);
  const text = [data.answerText ?? data.summary ?? "", ...list.map((place) => place?.reason ?? place?.whyThisFits ?? "")].filter(Boolean).join("\n");
  return {
    status: response.status,
    text,
    places: list.map((place) => ({ slug: slugFromPath(place?.galatayoPath), name: place?.name ?? null, latitude: place?.latitude, longitude: place?.longitude })),
    refused: isRefusalText(text),
    firstTokenMs: null,
    totalMs,
    payloadErrors: response.ok && list.length === 0 && !text ? ["empty response"] : payloadErrors,
    rateLimited: response.status === 429 || /RATE_LIMIT|PROVIDER_BUSY/.test(`${data.error ?? ""} ${data.emptyReason ?? ""}`),
    error: response.ok ? null : `${response.status} ${data.error ?? ""}`.trim(),
  };
}

/** The new assistant streams NDJSON events; the first visible event (text or cards) is the first token. */
async function assistantTurn(base: string, conversation: Conversation, message: string, mode: "chat" | "map"): Promise<TurnAnswer> {
  const started = Date.now();
  const response = await fetch(`${base}/ask-ai/assistant`, {
    method: "POST",
    headers: headers(conversation, randomUUID()),
    body: JSON.stringify({ message, mode, history: conversation.history, memory: conversation.memory, stream: true }),
  });
  let firstTokenMs: number | null = null;
  let final: Record<string, any> | null = null;
  let errorEvent: Record<string, any> | null = null;
  let buffer = "";
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  const handle = (line: string) => {
    if (!line.trim()) return;
    let event: Record<string, any>;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }
    if (firstTokenMs === null && (event.type === "delta" || event.type === "places" || event.type === "final")) firstTokenMs = Date.now() - started;
    if (event.type === "final") final = event.response;
    if (event.type === "error") errorEvent = event;
    // A plain JSON error body (429 etc.) arrives as one line without a type.
    if (!event.type && event.ok === false) errorEvent = event;
  };
  if (reader) {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(handle);
    }
    handle(buffer);
  }
  const totalMs = Date.now() - started;
  const result = final as Record<string, any> | null;
  const failure = errorEvent as Record<string, any> | null;
  const text = typeof result?.text === "string" ? result.text : "";
  if (result) {
    conversation.history.push({ role: "user", content: message }, { role: "assistant", content: text });
    conversation.memory = result.memory ?? conversation.memory;
  }
  const validation = result ? validateAssistantResponse(result) : { ok: false, errors: ["no final event"] };
  return {
    status: response.status,
    text,
    places: (Array.isArray(result?.places) ? result!.places : []).map((card: any) => ({ slug: card?.slug, name: card?.name, latitude: card?.latitude, longitude: card?.longitude })),
    refused: result?.refused === true || isRefusalText(text),
    firstTokenMs,
    totalMs,
    payloadErrors: validation.ok ? [] : validation.errors,
    rateLimited: response.status === 429 || RATE_LIMIT_CODES.test(String(failure?.code ?? "")),
    error: failure ? `${response.status} ${failure.code ?? failure.error ?? ""}`.trim() : response.ok ? null : String(response.status),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const base = (arg("base", DEFAULT_BASE) ?? DEFAULT_BASE).replace(/\/$/, "");
  const target = arg("target", "assistant") as "legacy" | "assistant";
  const label = arg("label", `${target}-${new Date().toISOString().slice(0, 10)}`)!;
  // The API caps each IP at 20 AI requests per 10 minutes (and guests at 40 a day), so space requests 35 s apart.
  const delay = Number(arg("delay", "35000"));
  const append = process.argv.includes("--append");
  const only = arg("only")?.split(",");
  const limit = Number(arg("limit", "0"));
  const suite = JSON.parse(readFileSync(path.join(here, "suite.json"), "utf8")) as { cases: EvalCase[] };
  let cases = suite.cases.filter((entry) => !only || only.includes(entry.id));
  if (limit > 0) cases = cases.slice(0, limit);

  const index = new CuratedIndex(await loadCurated());
  console.log(`curated places: ${index.all().filter((place) => !place.hidden).length} visible, ${index.all().filter((place) => place.hidden).length} hidden`);

  const out = path.join(here, "results");
  const previous = append ? (JSON.parse(readFileSync(path.join(out, `${label}.json`), "utf8")) as Scorecard & { transcripts: Array<{ id: string; turns: Array<{ message: string; answer: TurnAnswer }> }> }) : null;
  const startedAt = previous?.startedAt ?? new Date().toISOString();
  const transcripts: Array<{ id: string; turns: Array<{ message: string; answer: TurnAnswer }> }> = previous?.transcripts ?? [];
  // Saved answers are re-scored with the current scorer, so old and new runs stay comparable.
  const scores: CaseScore[] = transcripts.flatMap((transcript) => {
    const evalCase = suite.cases.find((entry) => entry.id === transcript.id);
    return evalCase ? [scoreCase(evalCase, transcript.turns.map((turn) => turn.answer), index)] : [];
  });
  cases = cases.filter((entry) => !scores.some((score) => score.id === entry.id));
  let stoppedEarly: string | null = null;
  let requests = 0;

  outer: for (const evalCase of cases) {
    const conversation: Conversation = { guestId: `eval-${randomUUID()}`, history: [], memory: null };
    const answers: TurnAnswer[] = [];
    for (const message of evalCase.turns) {
      if (requests++ > 0) await sleep(delay);
      const run = () =>
        target === "legacy"
          ? evalCase.mode === "map" ? legacyMap(base, conversation, message) : legacyChat(base, conversation, message)
          : assistantTurn(base, conversation, message, evalCase.mode);
      let answer = await run().catch((error) => ({ status: 0, text: "", places: [], refused: false, firstTokenMs: null, totalMs: 0, payloadErrors: [], error: String(error) }) as TurnAnswer);
      if (answer.rateLimited) {
        console.log(`  rate limited on ${evalCase.id}; waiting 65 s and retrying once`);
        await sleep(65_000);
        answer = await run();
        if (answer.rateLimited) {
          stoppedEarly = `provider rate limit at case ${evalCase.id} (${answer.error})`;
          break outer;
        }
      }
      answers.push(answer);
      console.log(`  ${evalCase.id} [${answer.status}] ${answer.totalMs} ms, ${answer.places.length} places`);
    }
    transcripts.push({ id: evalCase.id, turns: evalCase.turns.map((message, turn) => ({ message, answer: answers[turn] })) });
    const score = scoreCase(evalCase, answers, index);
    scores.push(score);
    console.log(`${evalCase.id}: ${Math.round(score.score * 100)}% ${score.notes.join("; ")}`);
  }

  const card: Scorecard = { label, target, base, startedAt, finishedAt: new Date().toISOString(), stoppedEarly, cases: scores, totals: summarise(scores) };
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, `${label}.json`), JSON.stringify({ ...card, transcripts }, null, 1));
  writeFileSync(path.join(out, `${label}.md`), toMarkdown(card));
  console.log(`\nmean ${Math.round(card.totals.meanScore * 100)}%, pass ${Math.round(card.totals.passRate * 100)}% → results/${label}.md`);
  if (stoppedEarly) console.log(`stopped early: ${stoppedEarly}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
