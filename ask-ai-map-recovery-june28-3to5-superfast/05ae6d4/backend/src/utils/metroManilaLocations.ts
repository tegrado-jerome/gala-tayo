import { normalizeSearchText } from "./searchMatching";

export type MetroManilaLocationMatch = {
  cityIds: string[];
  cityNames: string[];
  matchedKeywords: string[];
};

type MetroManilaLocation = {
  cityId: string;
  cityName: string;
  keywords: string[];
};

export const METRO_MANILA_LOCATION_KEYWORDS: MetroManilaLocation[] = [
  {
    cityId: "caloocan",
    cityName: "Caloocan",
    keywords: [
      "caloocan",
      "north caloocan",
      "south caloocan",
      "monumento",
      "balintawak",
      "bagong barrio",
      "camarin",
      "deparo",
      "bagumbong",
      "grace park",
      "maypajo",
      "sangandaan",
      "edsa caloocan",
      "sm center sangandaan",
      "victory mall caloocan",
    ],
  },
  {
    cityId: "las-pinas",
    cityName: "Las Pinas",
    keywords: [
      "las pinas",
      "las pinas city",
      "las piñas",
      "alabang zapote",
      "bf resort",
      "pilar",
      "talon",
      "zapote",
      "pamplona",
      "casimiro",
      "sm southmall",
      "evia",
      "daang hari",
      "verdant",
      "bamboo organ",
    ],
  },
  {
    cityId: "makati",
    cityName: "Makati",
    keywords: [
      "makati",
      "makati city",
      "ayala",
      "ayala center",
      "greenbelt",
      "glorietta",
      "poblacion",
      "salcedo",
      "legazpi village",
      "legaspi village",
      "rockwell",
      "power plant mall",
      "circuit makati",
      "chino roces",
      "pasong tamo",
      "jupiter",
      "paseo de roxas",
      "gil puyat",
      "buendia",
    ],
  },
  {
    cityId: "malabon",
    cityName: "Malabon",
    keywords: [
      "malabon",
      "malabon city",
      "concepcion malabon",
      "potrero",
      "tinajeros",
      "longos",
      "catmon",
      "navotas malabon",
      "malabon zoo",
      "san bartolome malabon",
      "hulong duhat",
      "tonsuyas",
    ],
  },
  {
    cityId: "mandaluyong",
    cityName: "Mandaluyong",
    keywords: [
      "mandaluyong",
      "mandaluyong city",
      "shaw",
      "shaw boulevard",
      "boni",
      "boni avenue",
      "pioneer",
      "greenfield",
      "edsa shang",
      "shangri la plaza",
      "sm megamall",
      "ortigas",
      "wack wack",
      "plainview",
      "barangka",
      "kalentong",
    ],
  },
  {
    cityId: "manila",
    cityName: "Manila",
    keywords: [
      "manila",
      "city of manila",
      "intramuros",
      "binondo",
      "ermita",
      "malate",
      "quiapo",
      "divisoria",
      "taft",
      "taft manila",
      "luneta",
      "rizal park",
      "old manila",
      "paco",
      "pandacan",
      "sampaloc",
      "sta mesa",
      "santa mesa",
      "tondo",
      "san nicolas",
      "escolta",
      "manila bay",
      "robinsons manila",
      "national museum",
      "manila cathedral",
      "fort santiago",
    ],
  },
  {
    cityId: "marikina",
    cityName: "Marikina",
    keywords: [
      "marikina",
      "marikina city",
      "riverbanks",
      "marikina riverbanks",
      "concepcion marikina",
      "sto nino marikina",
      "santo nino marikina",
      "marikina heights",
      "parang marikina",
      "fortune marikina",
      "shoe museum",
      "sports center marikina",
      "sumulong highway",
    ],
  },
  {
    cityId: "muntinlupa",
    cityName: "Muntinlupa",
    keywords: [
      "muntinlupa",
      "muntinlupa city",
      "alabang",
      "filinvest",
      "filinvest city",
      "festival mall",
      "ayala malls south park",
      "westgate",
      "commerce center",
      "molito",
      "sucat",
      "cupang",
      "bayanan",
      "tunasan",
      "poblacion muntinlupa",
    ],
  },
  {
    cityId: "navotas",
    cityName: "Navotas",
    keywords: [
      "navotas",
      "navotas city",
      "navotas fish port",
      "fish port",
      "tangos",
      "san roque navotas",
      "sipac almacen",
      "bangkulasi",
      "north bay boulevard",
      "nbbs",
      "tanza navotas",
    ],
  },
  {
    cityId: "paranaque",
    cityName: "Paranaque",
    keywords: [
      "paranaque",
      "parañaque",
      "paranaque city",
      "bf homes",
      "bf paranaque",
      "baclaran",
      "bicutan",
      "sucat",
      "sm city sucat",
      "ayala malls manila bay",
      "aseana",
      "aseana city",
      "okada",
      "solaire",
      "city of dreams",
      "tambo",
      "moonwalk",
      "multinational village",
      "don bosco paranaque",
    ],
  },
  {
    cityId: "pasay",
    cityName: "Pasay",
    keywords: [
      "pasay",
      "pasay city",
      "moa",
      "mall of asia",
      "sm mall of asia",
      "moa complex",
      "newport",
      "newport city",
      "resorts world",
      "world trade center",
      "picc",
      "ccp",
      "cultural center",
      "gil puyat",
      "buendia",
      "taft",
      "baclaran",
      "edsa taft",
      "cartimar",
      "naia terminal 3",
    ],
  },
  {
    cityId: "pasig",
    cityName: "Pasig",
    keywords: [
      "pasig",
      "pasig city",
      "ortigas",
      "ortigas center",
      "kapitolyo",
      "estancia",
      "capitol commons",
      "tiendesitas",
      "greenhills",
      "arcovia",
      "frontera verde",
      "rosario pasig",
      "ugong pasig",
      "meralco avenue",
      "julia vargas",
      "rainforest park",
      "pasig palengke",
    ],
  },
  {
    cityId: "pateros",
    cityName: "Pateros",
    keywords: [
      "pateros",
      "municipality of pateros",
      "pateros town",
      "pateros church",
      "san roque pateros",
      "sta ana pateros",
      "santa ana pateros",
      "aguho",
      "magdalena pateros",
    ],
  },
  {
    cityId: "quezon-city",
    cityName: "Quezon City",
    keywords: [
      "quezon city",
      "qc",
      "cubao",
      "katipunan",
      "maginhawa",
      "up diliman",
      "commonwealth",
      "fairview",
      "timog",
      "tomas morato",
      "teacher's village",
      "teachers village",
      "eastwood",
      "libis",
      "new manila",
      "novaliches",
      "sm north",
      "trinoma",
      "vertis north",
      "araneta city",
      "gateway mall",
      "ever gotesco",
      "banawe",
      "del monte qc",
      "project 6",
      "project 8",
      "diliman",
    ],
  },
  {
    cityId: "san-juan",
    cityName: "San Juan",
    keywords: [
      "san juan",
      "san juan city",
      "greenhills",
      "greenhills shopping center",
      "ortigas",
      "promenade greenhills",
      "theater mall",
      "wilson",
      "pinaglabanan",
      "little baguio",
      "addition hills san juan",
      "corazon de jesus",
      "santolan san juan",
    ],
  },
  {
    cityId: "taguig",
    cityName: "Taguig",
    keywords: [
      "taguig",
      "taguig city",
      "bgc",
      "bonifacio global city",
      "fort bonifacio",
      "mckinley",
      "mckinley hill",
      "mckinley west",
      "uptown",
      "uptown bonifacio",
      "bonifacio high street",
      "high street",
      "market market",
      "market! market!",
      "sm aura",
      "serendra",
      "venice grand canal",
      "the mind museum",
      "arca south",
      "bicutan",
      "c5 taguig",
      "vista mall taguig",
      "fifth avenue bgc",
    ],
  },
  {
    cityId: "valenzuela",
    cityName: "Valenzuela",
    keywords: [
      "valenzuela",
      "valenzuela city",
      "karuhatan",
      "malinta",
      "marulas",
      "polo valenzuela",
      "lawang bato",
      "meycauayan valenzuela",
      "fatima valenzuela",
      "sm valenzuela",
      "valenzuela gateway complex",
      "viente reales",
      "punturin",
    ],
  },
];

function hasKeywordMatch(normalizedInput: string, keyword: string): boolean {
  const normalizedKeyword = normalizeSearchText(keyword);

  if (!normalizedKeyword) {
    return false;
  }

  return new RegExp(`(^|\\s)${escapeRegExp(normalizedKeyword)}($|\\s)`).test(
    normalizedInput
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function inferMetroManilaLocationsFromQuery(
  query: string
): MetroManilaLocationMatch {
  const normalizedQuery = normalizeSearchText(query);
  const cityIds = new Set<string>();
  const cityNames = new Set<string>();
  const matchedKeywords = new Set<string>();

  if (!normalizedQuery) {
    return {
      cityIds: [],
      cityNames: [],
      matchedKeywords: [],
    };
  }

  for (const location of METRO_MANILA_LOCATION_KEYWORDS) {
    const matchedKeyword = location.keywords.find((keyword) =>
      hasKeywordMatch(normalizedQuery, keyword)
    );

    if (matchedKeyword) {
      cityIds.add(location.cityId);
      cityNames.add(location.cityName);
      matchedKeywords.add(normalizeSearchText(matchedKeyword));
    }
  }

  return {
    cityIds: [...cityIds],
    cityNames: [...cityNames],
    matchedKeywords: [...matchedKeywords],
  };
}

export function getMetroManilaLocationKeywordsForCity(cityId: string): string[] {
  return METRO_MANILA_LOCATION_KEYWORDS
    .filter((location) => location.cityId === cityId)
    .flatMap((location) => location.keywords.map(normalizeSearchText));
}
