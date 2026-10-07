import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeListsState } from "./galaLists";

const NOW = "2026-10-07T12:00:00.000Z";
const place = (slug: string) => ({ slug, name: slug, city: "Manila", area: null, category: "Museum", photo: null, addedAt: NOW });

test("keeps a lists document the app sent", () => {
  const state = {
    version: 1,
    lists: [{ id: "6a1f0c0e-1111-4111-8111-111111111111", name: "Date night", places: [place("fort-santiago")], createdAt: NOW, updatedAt: NOW, copiedFrom: null }],
    following: [{ key: "juan|Food trip|binondo-chinatown", name: "Food trip", slugs: ["binondo-chinatown"], by: "juan", followedAt: NOW }],
  };
  assert.deepEqual(sanitizeListsState(state, NOW), state);
});

test("rejects anything that is not a lists document", () => {
  assert.equal(sanitizeListsState(null), null);
  assert.equal(sanitizeListsState("lists"), null);
  assert.equal(sanitizeListsState({ lists: "nope" }), null);
  assert.deepEqual(sanitizeListsState({ lists: [] }, NOW), { version: 1, lists: [], following: [] });
});

test("drops bad lists and places, and caps what it stores", () => {
  const cleaned = sanitizeListsState(
    {
      lists: [
        { id: "a", name: "  Rainy   day  ", places: [place("ok-slug"), place("ok-slug"), { slug: "Bad Slug!" }, { slug: "<script>" }, null], createdAt: "not a date", updatedAt: NOW },
        { id: "a", name: "Duplicate id", places: [] },
        { id: "b", name: "", places: [] },
        { id: "bad id with spaces", name: "x", places: [] },
        { id: "c", name: "x".repeat(80), places: Array.from({ length: 80 }, (_, index) => place(`p-${index}`)), createdAt: NOW, updatedAt: NOW },
        { id: "d", name: "Photo", places: [{ ...place("p"), photo: "javascript:alert(1)" }], createdAt: NOW, updatedAt: NOW },
      ],
    },
    NOW
  )!;
  assert.deepEqual(cleaned.lists.map((list) => list.id), ["a", "c", "d"]);
  assert.equal(cleaned.lists[0].name, "Rainy day");
  assert.deepEqual(cleaned.lists[0].places.map((entry) => entry.slug), ["ok-slug"]);
  assert.equal(cleaned.lists[0].createdAt, NOW, "a bad date falls back to now");
  assert.equal(cleaned.lists[1].name.length, 40);
  assert.equal(cleaned.lists[1].places.length, 60);
  assert.equal(cleaned.lists[2].places[0].photo, null, "only https or site photos");
});

test("stores at most 50 lists", () => {
  const lists = Array.from({ length: 70 }, (_, index) => ({ id: `l${index}`, name: `List ${index}`, places: [] }));
  assert.equal(sanitizeListsState({ lists }, NOW)!.lists.length, 50);
});
