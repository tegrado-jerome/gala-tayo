const assert = require("node:assert/strict");
const { validateMetroManilaSearchQuery } = require("../dist/src/utils/searchQueryValidation.js");

const testCases = [
  ["date alone is too vague", "date", "too_vague"],
  ["bar alone is too vague", "bar", "too_vague"],
  ["date in Makati stays valid", "date in Makati", "ok"],
  ["place-name style search now passes", "hideout bar", "ok"],
  ["single place name search now passes", "hideout", "ok"],
  ["date in Cavite fails closed", "date in Cavite", "unsupported_location"],
  ["coffee in Quezon City stays valid", "coffee in Quezon City", "ok"],
  ["empty query is flagged", "", "empty_query"],
  ["random text with no supported area now passes", "blorptastic weekend thing", "ok"],
  ["messy supported query still works", "  cozy   date   Makati  ", "ok"],
  ["qc shorthand is accepted", "budget cafe QC", "ok"],
];

for (const [name, query, expectedStatus] of testCases) {
  const result = validateMetroManilaSearchQuery({
    query,
    hasSelectedFilters: false,
    hasNearbySearch: false,
    hasExplicitAreaFilter: false,
    allowBroadDiscovery: false,
  });

  assert.equal(
    result.status,
    expectedStatus,
    `${name}: expected ${expectedStatus}, received ${result.status}`
  );
}

console.log(`Passed ${testCases.length} search query validation tests.`);
