const fs = require("fs");

const file = "./scripts/metroManilaPlaceSeeds.json";
const data = JSON.parse(fs.readFileSync(file, "utf8"));

const categoryTagMap = {
  "kainan": ["food-options", "indoor"],
  "cafe": ["study-friendly", "wifi", "indoor"],
  "mall": ["indoor", "airconditioned", "shopping-area", "food-options"],
  "parke": ["outdoor", "walkable", "free-entry"],
  "nightlife": ["night-friendly", "lively"],
  "heritage": ["historical", "tourist-friendly", "educational"],
  "museum": ["educational", "tourist-friendly", "indoor"],
  "tourist-spot": ["tourist-friendly", "photo-friendly"],
  "date-spot": ["date-friendly", "photo-friendly"],
  "barkada": ["barkada-friendly", "lively"],
  "family": ["family-friendly", "kid-friendly"],
  "study-spot": ["study-friendly", "quiet", "wifi"],
  "coworking": ["study-friendly", "wifi", "quiet", "indoor"],
  "arcade-games": ["indoor", "lively", "barkada-friendly"],
  "cinema": ["indoor", "airconditioned", "date-friendly"],
  "shopping": ["shopping-area", "indoor"],
  "wellness": ["relaxing", "active"],
  "chill": ["relaxing", "solo-friendly"]
};

const budgetTagMap = {
  "Free": ["free-entry", "budget-friendly"],
  "Budget": ["budget-friendly"],
  "Mid-range": [],
  "Premium": ["premium"]
};

for (const place of data) {
  place.verification_status = "needs-review";

  const tagSet = new Set();

  for (const category of place.categories || []) {
    for (const tag of categoryTagMap[category] || []) {
      tagSet.add(tag);
    }
  }

  for (const tag of budgetTagMap[place.budget_label] || []) {
    tagSet.add(tag);
  }

  // keep max 5 tags per place to avoid noisy seed data
  const tags = [...tagSet].slice(0, 5);

  place.tags = tags.map((slug) => ({
    slug,
    strength: 4,
    source: "manual"
  }));
}

fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log(`Updated ${data.length} places with valid verification_status and non-empty known tags.`);
