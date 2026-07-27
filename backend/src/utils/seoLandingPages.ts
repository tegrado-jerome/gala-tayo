export type SeoLandingTarget = {
  slug: string;
  path: string;
  areaSlug?: string | null;
  category?: string | null;
  goodFor?: string | null;
};

const SEO_LANDING_TARGETS: SeoLandingTarget[] = [
  { slug: "best-cafes-in-makati", path: "/guides/best-cafes-in-makati", areaSlug: "makati", category: "cafe" },
  { slug: "restaurants-in-quezon-city", path: "/guides/restaurants-in-quezon-city", areaSlug: "quezon-city", category: "food" },
  { slug: "museums-in-manila", path: "/guides/museums-in-manila", areaSlug: "manila", category: "museum" },
  { slug: "parks-in-pasig", path: "/guides/parks-in-pasig", areaSlug: "pasig", category: "park" },
  { slug: "date-spots-in-bgc", path: "/guides/date-spots-in-bgc", areaSlug: "taguig", goodFor: "date" },
  { slug: "family-friendly-places-in-quezon-city", path: "/guides/family-friendly-places-in-quezon-city", areaSlug: "quezon-city", goodFor: "family" },
  { slug: "study-cafes-in-manila", path: "/guides/study-cafes-in-manila", areaSlug: "manila", category: "cafe", goodFor: "study" },
  { slug: "chill-spots-in-taguig", path: "/guides/chill-spots-in-taguig", areaSlug: "taguig", goodFor: "chill" },
  { slug: "kainan-sa-bgc", path: "/guides/kainan-sa-bgc", areaSlug: "taguig", category: "food" },
  { slug: "tambayan-sa-makati", path: "/guides/tambayan-sa-makati", areaSlug: "makati", goodFor: "chill" },
  { slug: "saan-mag-date-sa-qc", path: "/guides/saan-mag-date-sa-qc", areaSlug: "quezon-city", goodFor: "date" },
  { slug: "things-to-do-in-makati", path: "/guides/things-to-do-in-makati", areaSlug: "makati", category: "activity" },
  { slug: "date-places-in-metro-manila", path: "/guides/date-places-in-metro-manila", goodFor: "date" },
  { slug: "study-cafes-in-metro-manila", path: "/guides/study-cafes-in-metro-manila", category: "cafe", goodFor: "study" },
  { slug: "nightlife-in-makati", path: "/guides/nightlife-in-makati", areaSlug: "makati", category: "nightlife" },
  { slug: "heritage-sites-in-manila", path: "/guides/heritage-sites-in-manila", areaSlug: "manila", category: "heritage" },
  { slug: "cheap-eats-in-manila", path: "/guides/cheap-eats-in-manila", areaSlug: "manila", category: "food" },
  { slug: "mall-shopping-in-pasig", path: "/guides/mall-shopping-in-pasig", areaSlug: "pasig", category: "mall" },
  { slug: "cinemas-in-quezon-city", path: "/guides/cinemas-in-quezon-city", areaSlug: "quezon-city", category: "cinema" },
  { slug: "hotels-and-staycations-in-taguig", path: "/guides/hotels-and-staycations-in-taguig", areaSlug: "taguig", category: "hotel" },
  { slug: "barkada-hangouts-in-makati", path: "/guides/barkada-hangouts-in-makati", areaSlug: "makati", goodFor: "barkada" },
  { slug: "family-outing-in-manila", path: "/guides/family-outing-in-manila", areaSlug: "manila", goodFor: "family" },
];

export { SEO_LANDING_TARGETS };
