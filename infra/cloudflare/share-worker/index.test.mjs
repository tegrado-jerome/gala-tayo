import assert from "node:assert/strict";
import { test } from "node:test";
import { backendUrl } from "./index.js";

const API = "https://galatayo-api-cvawfwgrg6akdmem.southeastasia-01.azurewebsites.net/api";
const at = (path) => backendUrl(new URL(`https://go.galatayo.app${path}`));
const id = "0b6f1c7e-3d2a-4c55-9e8f-1a2b3c4d5e6f";

test("plan links go to the plan share page, keeping ?ref", () => {
  assert.equal(at(`/p/${id}`), `${API}/share/plans/${id}`);
  assert.equal(at(`/p/${id.toUpperCase()}/?ref=gc`), `${API}/share/plans/${id}?ref=gc`);
});

test("list links keep their query", () => {
  assert.equal(at("/l?n=Food+trip&p=a,b&ref=copy"), `${API}/share/lists?n=Food+trip&p=a,b&ref=copy`);
  assert.equal(at("/l/?n=x&p=a"), `${API}/share/lists?n=x&p=a`);
});

test("anything else is not a share link", () => {
  for (const path of ["/", "/p/", "/p/not-a-uuid", `/p/${id}/x`, "/api/health", "/lists", "/favicon.ico", `/p/..%2F${id}`]) {
    assert.equal(at(path), null, path);
  }
});
