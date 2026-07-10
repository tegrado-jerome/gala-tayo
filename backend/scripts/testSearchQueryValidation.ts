import assert from "node:assert/strict";
import { validateMetroManilaSearchQuery } from "../src/utils/searchQueryValidation";

type TestCase = {
  name: string;
  query: string;
  expectedStatus: "ok" | "empty_query" | "too_vague" | "unsupported_location";
};

const testCases: TestCase[] = [
  {
    name: "date alone is too vague",
    query: "date",
    expectedStatus: "too_vague",
  },
  {
    name: "date in Makati stays valid",
    query: "date in Makati",
    expectedStatus: "ok",
  },
  {
    name: "date in Cavite fails closed",
    query: "date in Cavite",
    expectedStatus: "unsupported_location",
  },
  {
    name: "coffee in Quezon City stays valid",
    query: "coffee in Quezon City",
    expectedStatus: "ok",
  },
  {
    name: "empty query is flagged",
    query: "",
    expectedStatus: "empty_query",
  },
  {
    name: "random text with no supported area is too vague",
    query: "blorptastic weekend thing",
    expectedStatus: "too_vague",
  },
  {
    name: "messy supported query still works",
    query: "  cozy   date   Makati  ",
    expectedStatus: "ok",
  },
  {
    name: "qc shorthand is accepted",
    query: "budget cafe QC",
    expectedStatus: "ok",
  },
];

for (const testCase of testCases) {
  const result = validateMetroManilaSearchQuery({
    query: testCase.query,
    hasSelectedFilters: false,
    hasNearbySearch: false,
    hasExplicitAreaFilter: false,
    allowBroadDiscovery: false,
  });

  assert.equal(
    result.status,
    testCase.expectedStatus,
    `${testCase.name}: expected ${testCase.expectedStatus}, received ${result.status}`
  );
}

console.log(`Passed ${testCases.length} search query validation tests.`);
