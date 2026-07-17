import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

export type Category = {
  id: string;
  name: string;
  description: string;
  searchTerms: string[];
};

export type MetroManilaArea = {
  id: string;
  name: string;
  type: "all" | "city" | "municipality";
};

export type GoodForOption = {
  id: string;
  name: string;
  description: string;
  searchTerms: string[];
};

export const CATEGORIES: Category[] = [
  {
    id: "activity",
    name: "Activity",
    description: "Hands-on things to do, active plans, and experience-based gala spots.",
    searchTerms: ["activity", "activities", "things to do", "fun", "experience", "games", "adventure", "entertainment", "barkada", "family activity", "indoor activity", "outdoor activity", "laro", "gala"],
  },
  {
    id: "cafe",
    name: "Cafe",
    description: "Coffee shops, cafes, tea spots, and cozy tambayan places.",
    searchTerms: ["cafe", "coffee", "coffee shop", "kape", "kapihan", "dessert", "pastry", "brunch", "study cafe", "tambay", "chill", "date", "merienda"],
  },
  {
    id: "cinema",
    name: "Cinema",
    description: "Movie theaters and film-watching venues.",
    searchTerms: ["cinema", "movie", "movies", "film", "sine", "pelikula", "screening", "movie date", "date night", "indoor", "rainy day"],
  },
  {
    id: "food",
    name: "Food",
    description: "Food trip places, restaurants, casual dining, and snack stops.",
    searchTerms: ["food", "restaurant", "restaurants", "food trip", "kainan", "pagkain", "dining", "lunch", "dinner", "brunch", "buffet", "street food", "date night", "family meal"],
  },
  {
    id: "heritage",
    name: "Heritage",
    description: "Historic districts, heritage sites, and cultural landmarks.",
    searchTerms: ["heritage", "history", "historical", "landmark", "culture", "cultural", "church", "monument", "old town", "museum", "kasaysayan", "makasaysayan", "simbahan", "tourist spot"],
  },
  {
    id: "hotel",
    name: "Hotel",
    description: "Hotels, staycations, and overnight-friendly places.",
    searchTerms: ["hotel", "hotels", "staycation", "resort", "overnight", "accommodation", "room", "vacation", "weekend stay", "family staycation", "romantic staycation"],
  },
  {
    id: "mall",
    name: "Mall",
    description: "Shopping malls, lifestyle centers, and all-in-one gala spots.",
    searchTerms: ["mall", "shopping", "shops", "shopping center", "retail", "food court", "department store", "grocery", "aircon", "indoor", "rainy day", "tambay", "bilihan"],
  },
  {
    id: "museum",
    name: "Museum",
    description: "Museums, galleries, exhibits, and educational cultural spaces.",
    searchTerms: ["museum", "museums", "gallery", "art", "exhibit", "exhibition", "culture", "history", "educational", "museo", "tourist spot", "family activity"],
  },
  {
    id: "nightlife",
    name: "Nightlife",
    description: "Bars, clubs, live music spots, and late-night hangout places.",
    searchTerms: ["nightlife", "bar", "bars", "club", "lounge", "drinks", "cocktails", "inuman", "night out", "late night", "live music", "rooftop", "party"],
  },
  {
    id: "park",
    name: "Park",
    description: "Parks, gardens, open spaces, and outdoor pasyalan.",
    searchTerms: ["park", "parks", "nature", "garden", "outdoor", "green space", "walking", "jogging", "picnic", "bike", "trail", "family", "free activity", "parke", "pasyalan"],
  },
];

export const GOOD_FOR_OPTIONS: GoodForOption[] = [
  {
    id: "date",
    name: "Date",
    description: "Romantic, cozy, and couple-friendly places for dates.",
    searchTerms: ["date spot", "romantic", "couple", "cozy", "anniversary"],
  },
  {
    id: "barkada",
    name: "Barkada",
    description: "Group-friendly places for friends, hangouts, and shared activities.",
    searchTerms: ["barkada", "friends", "group hangout", "group activity", "tambay"],
  },
  {
    id: "family",
    name: "Family",
    description: "Family-friendly places suitable for kids, parents, and all ages.",
    searchTerms: ["family", "kids", "child friendly", "all ages", "family outing"],
  },
  {
    id: "study",
    name: "Study",
    description: "Quiet cafes, libraries, and work-friendly places for studying.",
    searchTerms: ["study spot", "library", "quiet cafe", "student friendly", "wifi"],
  },
  {
    id: "chill",
    name: "Chill",
    description: "Relaxed tambayan spots for unwinding, views, and low-key hangouts.",
    searchTerms: ["chill", "tambayan", "relax", "view", "low key"],
  },
];

export const METRO_MANILA_AREAS: MetroManilaArea[] = [
  { id: "all", name: "All areas", type: "all" },
  { id: "caloocan", name: "Caloocan", type: "city" },
  { id: "las-pinas", name: "Las Piñas", type: "city" },
  { id: "makati", name: "Makati", type: "city" },
  { id: "malabon", name: "Malabon", type: "city" },
  { id: "mandaluyong", name: "Mandaluyong", type: "city" },
  { id: "manila", name: "Manila", type: "city" },
  { id: "marikina", name: "Marikina", type: "city" },
  { id: "muntinlupa", name: "Muntinlupa", type: "city" },
  { id: "navotas", name: "Navotas", type: "city" },
  { id: "paranaque", name: "Parañaque", type: "city" },
  { id: "pasay", name: "Pasay", type: "city" },
  { id: "pasig", name: "Pasig", type: "city" },
  { id: "quezon-city", name: "Quezon City", type: "city" },
  { id: "san-juan", name: "San Juan", type: "city" },
  { id: "taguig", name: "Taguig", type: "city" },
  { id: "valenzuela", name: "Valenzuela", type: "city" },
  { id: "pateros", name: "Pateros", type: "municipality" },
];

export function findCategoryById(id: string | undefined): Category | null {
  if (!id || id === "all") {
    return null;
  }

  return CATEGORIES.find((category) => category.id === id) ?? null;
}

export function findAreaById(id: string | undefined): MetroManilaArea | null {
  if (!id || id === "all") {
    return null;
  }

  return METRO_MANILA_AREAS.find((area) => area.id === id) ?? null;
}

export function findGoodForById(id: string | undefined): GoodForOption | null {
  if (!id || id === "all") {
    return null;
  }

  return GOOD_FOR_OPTIONS.find((option) => option.id === id) ?? null;
}

export async function filters(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Fetching GalaTayo filters...");

  return {
    status: 200,
    jsonBody: {
      categories: CATEGORIES,
      areas: METRO_MANILA_AREAS,
      goodForOptions: GOOD_FOR_OPTIONS,
    },
  };
}

export async function categories(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Fetching GalaTayo categories...");

  return {
    status: 200,
    jsonBody: {
      categories: CATEGORIES,
    },
  };
}

app.http("filters", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "filters",
  handler: filters,
});

app.http("categories", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "categories",
  handler: categories,
});
