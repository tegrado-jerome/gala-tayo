import assert from "node:assert/strict";
import { test } from "node:test";
import worker, { authorized } from "./index.js";

const KEY = "db/2026-10-12T1800Z.tar.gz.gpg";
const bucket = () => {
  const saved = new Map();
  return { saved, head: async (k) => saved.get(k) ?? null, put: async (k, body) => (saved.set(k, body), { size: 3 }) };
};
const put = (path, token, env) =>
  worker.fetch(new Request(`https://sink.example/${path}`, { method: "PUT", body: "abc", headers: token ? { authorization: `Bearer ${token}` } : {} }), env);

test("token check", async () => {
  assert.equal(await authorized("Bearer s3cret", "s3cret"), true);
  assert.equal(await authorized("Bearer nope", "s3cret"), false);
  assert.equal(await authorized(null, "s3cret"), false);
  assert.equal(await authorized("Bearer ", ""), false);
});

test("stores a dump once with the right token", async () => {
  const env = { UPLOAD_TOKEN: "s3cret", BACKUPS: bucket() };
  assert.equal((await put(KEY, "s3cret", env)).status, 200);
  assert.equal(env.BACKUPS.saved.has(KEY), true);
  assert.equal((await put(KEY, "s3cret", env)).status, 409);
});

test("refuses bad tokens, other keys and other methods", async () => {
  const env = { UPLOAD_TOKEN: "s3cret", BACKUPS: bucket() };
  assert.equal((await put(KEY, "wrong", env)).status, 401);
  assert.equal((await put(KEY, null, env)).status, 401);
  for (const path of ["", "db/x.gpg", "photos/a.webp", `${KEY}/x`]) assert.equal((await put(path, "s3cret", env)).status, 404, path);
  assert.equal((await worker.fetch(new Request(`https://sink.example/${KEY}`), env)).status, 404);
  assert.equal(env.BACKUPS.saved.size, 0);
});
