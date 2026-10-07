import assert from "node:assert/strict";
import { test } from "node:test";
import { guestDisplayName } from "./profileHelpers";

// QA4: a guest who RSVPs from an invite shows up by the name they typed, like Partiful, not "Guest 0943".
const ID = "0943525d-a048-4710-84af-73cec6e5b396";

test("a guest goes by the name they typed when they RSVP'd", () => {
  assert.equal(guestDisplayName(ID, { guest_name: "  Kenji   T. " }, null), "Kenji T.");
  assert.equal(guestDisplayName(ID, { guest_name: "Kenji" }, "Guest 0943"), "Kenji", "replaces the default");
});

test("without a typed name, a guest is Guest plus a short id", () => {
  assert.equal(guestDisplayName(ID, undefined, null), "Guest 0943");
  assert.equal(guestDisplayName(ID, {}, "Guest 0943"), null, "already set");
});

test("never overwrites a name set another way, and cleans what it saves", () => {
  assert.equal(guestDisplayName(ID, { guest_name: "Kenji" }, "Kenji Tanaka"), null);
  assert.equal(guestDisplayName(ID, { guest_name: "<b>Bea</b>\u0007" }, null), "bBea/b");
  assert.equal(guestDisplayName(ID, { guest_name: "x".repeat(80) }, null)?.length, 40);
  assert.equal(guestDisplayName(ID, { guest_name: 42 }, null), "Guest 0943");
});
