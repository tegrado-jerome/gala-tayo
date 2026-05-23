import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

type Category = {
  id: string;
  name: string;
  description: string;
  searchTerms: string[];
};

const CATEGORIES: Category[] = [
  {
    id: "kainan",
    name: "Kainan",
    description:
      "Restaurants, carinderia, fast food, casual dining, and food trip spots.",
    searchTerms: ["restaurant", "food", "kainan", "casual dining", "filipino food"],
  },
  {
    id: "cafe",
    name: "Cafe",
    description: "Coffee shops, cafes, tea spots, and chill tambayan places.",
    searchTerms: ["cafe", "coffee", "tea", "coffee shop", "tambayan"],
  },
  {
    id: "mall",
    name: "Mall",
    description: "Shopping malls, lifestyle centers, and all-in-one hangout spots.",
    searchTerms: ["mall", "shopping mall", "lifestyle center", "department store"],
  },
  {
    id: "parke",
    name: "Parke",
    description: "Parks, open spaces, gardens, and outdoor tambayan areas.",
    searchTerms: ["park", "garden", "outdoor", "open space", "playground"],
  },
  {
    id: "nightlife",
    name: "Nightlife",
    description: "Bars, clubs, live music spots, and late-night hangout places.",
    searchTerms: ["bar", "club", "nightlife", "live music", "late night"],
  },
  {
    id: "heritage",
    name: "Heritage",
    description: "Historic districts, heritage sites, and cultural landmarks.",
    searchTerms: ["heritage", "historic", "cultural site", "old town", "landmark"],
  },
  {
    id: "museum",
    name: "Museum",
    description: "Museums, galleries, exhibits, and educational cultural spaces.",
    searchTerms: ["museum", "gallery", "exhibit", "art", "history"],
  },
  {
    id: "tourist-spot",
    name: "Tourist Spot",
    description: "Popular attractions, landmarks, and must-visit destination spots.",
    searchTerms: ["tourist spot", "attraction", "landmark", "destination", "sightseeing"],
  },
  {
    id: "date-spot",
    name: "Date Spot",
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
    id: "study-spot",
    name: "Study Spot",
    description: "Quiet cafes, libraries, and work-friendly places for studying.",
    searchTerms: ["study spot", "library", "quiet cafe", "student friendly", "wifi"],
  },
  {
    id: "coworking",
    name: "Coworking",
    description: "Coworking spaces and work hubs for productivity and meetings.",
    searchTerms: ["coworking", "workspace", "remote work", "meeting room", "office"],
  },
  {
    id: "arcade-games",
    name: "Arcade & Games",
    description: "Arcades, gaming lounges, and fun activity spots.",
    searchTerms: ["arcade", "games", "gaming", "bowling", "billiards"],
  },
  {
    id: "cinema",
    name: "Cinema",
    description: "Movie theaters and film-watching venues.",
    searchTerms: ["cinema", "movie theater", "films", "imax", "screening"],
  },
  {
    id: "dessert",
    name: "Dessert",
    description: "Dessert cafes, pastry shops, ice cream, and sweet treat spots.",
    searchTerms: ["dessert", "ice cream", "cake", "pastry", "sweet"],
  },
  {
    id: "market",
    name: "Market",
    description: "Public markets, food markets, weekend bazaars, and tiangge spots.",
    searchTerms: ["market", "bazar", "tiangge", "food market", "public market"],
  },
  {
    id: "shopping",
    name: "Shopping",
    description: "Retail strips, boutiques, outlet areas, and shopping destinations.",
    searchTerms: ["shopping", "boutique", "retail", "outlet", "store"],
  },
  {
    id: "sports-fitness",
    name: "Sports & Fitness",
    description: "Gyms, sports centers, courts, and fitness activity places.",
    searchTerms: ["gym", "fitness", "sports", "court", "workout"],
  },
  {
    id: "wellness",
    name: "Wellness",
    description: "Spas, massage places, self-care spots, and wellness centers.",
    searchTerms: ["wellness", "spa", "massage", "self care", "relaxation"],
  },
  {
    id: "clinic",
    name: "Clinic",
    description: "General clinics and healthcare consultation places.",
    searchTerms: ["clinic", "doctor", "healthcare", "consultation", "medical"],
  },
  {
    id: "dental",
    name: "Dental",
    description: "Dental clinics for checkups, cleaning, and oral care services.",
    searchTerms: ["dental", "dentist", "oral care", "teeth cleaning", "toothache"],
  },
  {
    id: "pharmacy",
    name: "Pharmacy",
    description: "Pharmacies and medicine stores for health needs.",
    searchTerms: ["pharmacy", "drugstore", "medicine", "gamot", "24/7 pharmacy"],
  },
  {
    id: "hospital",
    name: "Hospital",
    description: "Hospitals, emergency care facilities, and major medical centers.",
    searchTerms: ["hospital", "emergency", "medical center", "er", "health facility"],
  },
  {
    id: "services",
    name: "Services",
    description: "Repair, errands, personal services, and practical establishments.",
    searchTerms: ["services", "repair", "errands", "laundry", "printing"],
  },
  {
    id: "transport",
    name: "Transport",
    description: "Transport hubs, terminals, and commute-related places.",
    searchTerms: ["transport", "terminal", "station", "bus", "commute"],
  },
  {
    id: "pet-friendly",
    name: "Pet-Friendly",
    description: "Places where pets are welcome or can comfortably join.",
    searchTerms: ["pet friendly", "dogs allowed", "pets", "pet cafe", "pet park"],
  },
  {
    id: "religious",
    name: "Religious",
    description: "Churches, chapels, mosques, temples, and spiritual destinations.",
    searchTerms: ["church", "chapel", "mosque", "temple", "religious"],
  },
  {
    id: "hotel-stay",
    name: "Hotel & Stay",
    description: "Hotels, inns, staycations, and accommodation options.",
    searchTerms: ["hotel", "staycation", "inn", "accommodation", "lodging"],
  },
  {
    id: "chill",
    name: "Chill",
    description: "Relaxed tambayan spots for unwinding, views, and low-key hangouts.",
    searchTerms: ["chill", "tambayan", "relax", "view", "low key"],
  },
];

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

app.http("categories", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "categories",
  handler: categories,
});
