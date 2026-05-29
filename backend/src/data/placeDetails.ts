export type PlaceDetail = {
  id: string;
  name: string;
  location: string;
  rating: number;
  reviewCount: number;
  description: string;
  category: string;
  entranceFee: string;
  openHours: string;
  website: string;
  latitude: number;
  longitude: number;
  imageUrl: string;
  curatedImageUrls: string[];
};

export const PLACE_DETAILS: PlaceDetail[] = [
  {
    id: "bonifacio-high-street",
    name: "Bonifacio High Street",
    location: "BGC, Taguig, Metro Manila",
    rating: 4.6,
    reviewCount: 1248,
    description:
      "Open-air lifestyle strip in BGC with shopping, dining, and public art, ideal for relaxed walks and meetups.",
    category: "Hangout",
    entranceFee: "Free",
    openHours: "Open daily; shop and restaurant hours vary",
    website: "https://www.bgc.com.ph",
    latitude: 14.5509,
    longitude: 121.051,
    imageUrl:
      "/images/places/bonifacio-high-street/bonifacio-high-street-1.webp",
    curatedImageUrls: [
      "/images/places/bonifacio-high-street/bonifacio-high-street-1.webp",
      "/images/places/bonifacio-high-street/bonifacio-high-street-2.webp",
      "/images/places/bonifacio-high-street/bonifacio-high-street-3.webp",
    ],
  },
  {
    id: "intramuros",
    name: "Intramuros",
    location: "Manila, Metro Manila",
    rating: 4.5,
    reviewCount: 920,
    description:
      "Historic walled city featuring Spanish-era landmarks, museums, churches, and cobblestone streets.",
    category: "Heritage",
    entranceFee: "Some attractions ticketed",
    openHours: "Open daily; attraction schedules vary",
    website: "https://intramuros.gov.ph",
    latitude: 14.5896,
    longitude: 120.9751,
    imageUrl: "/images/places/intramuros/intramuros-1.webp",
    curatedImageUrls: [
      "/images/places/intramuros/intramuros-1.webp",
      "/images/places/intramuros/intramuros-2.webp",
      "/images/places/intramuros/intramuros-3.webp",
    ],
  },
];

export function findPlaceDetailById(id: string): PlaceDetail | null {
  const trimmedId = id.trim().toLowerCase();

  if (!trimmedId) {
    return null;
  }

  return PLACE_DETAILS.find((place) => place.id === trimmedId) ?? null;
}
