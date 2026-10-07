// Hand-written search copy for city and category pages, matched to how people actually search
// (frontend/scripts/seo/data/keyword-map.md). Facts come from the places each page lists; pages
// fall back to generated copy when a slug has no entry here.
type Faq = { question: string; answer: string }

type AreaSeo = {
  /** Title without the brand (added when it fits in 60 characters). */
  title?: string
  /** Meta description, 155 characters or fewer. */
  description?: string
  /** Line under the H1. */
  subtitle?: string
  gettingThere?: string
  faqs?: Faq[]
}

type CategorySeo = {
  title: string
  h1: string
  description: string
  intro: string
}

export const AREA_SEO: Record<string, AreaSeo> = {
  manila: {
    title: 'Manila Tourist Spots and Things to Do',
    description: 'Tourist spots in Manila, ranked: Intramuros, Fort Santiago, the free National Museums, Binondo and Rizal Park, with budgets and the best time to go.',
    subtitle: 'Manila\'s best spots, from the walls of Intramuros to the food stops of Binondo, ranked best first.',
    gettingThere: 'LRT-1 stops at Central Terminal, near Intramuros, and United Nations, near Rizal Park and the National Museums. Binondo is a walk across Jones Bridge.',
    faqs: [
      { question: 'What are the free tourist spots in Manila?', answer: 'Intramuros, Rizal Park, Binondo, Jones Bridge, the National Museum of Fine Arts and the National Museum of Natural History are all free. Fort Santiago starts at around ₱75.' },
    ],
  },
  'quezon-city': {
    title: 'Quezon City Tourist Spots and Things to Do',
    description: 'Quezon City\'s best: Art in Island\'s 3D murals, vintage shops and gigs at Cubao Expo, and the trails of La Mesa Eco Park, with budgets per head.',
    subtitle: 'QC\'s best spots, from 3D art and vintage shops in Cubao to the trails of La Mesa Eco Park.',
    gettingThere: 'MRT-3 and LRT-2 both stop in Cubao, a short walk from Cubao Expo in Araneta City. Art in Island is a quick ride away.',
  },
  'davao-city': {
    title: 'Things to Do in Davao City: Tourist Spots, Ranked',
    description: 'Davao City tourist spots: the Philippine Eagle Center, Eden Nature Park and the climb up Mount Apo, the country\'s highest peak, with budgets per head.',
    gettingThere: 'Fly into Francisco Bangoy International Airport in Davao City.',
  },
  siquijor: {
    title: 'Things to Do in Siquijor: Falls, Beaches, Lazi Church',
    description: 'Things to do in Siquijor: swim at Cambugahay Falls, catch the sunset at Paliton Beach, cliff-jump at Salagdoong and visit Lazi Church, with budgets.',
    gettingThere: 'Take a fast ferry from Dumaguete to Siquijor, around an hour, then rent a scooter or tricycle to loop the island.',
  },
  camiguin: {
    title: 'Things to Do in Camiguin: White Island, Falls and More',
    description: 'Things to do in Camiguin: the White Island sandbar, Katibawasan Falls and snorkeling at Mantigue Island, with budgets and the best time to go.',
    gettingThere: 'Take the ferry from Balingoan, Misamis Oriental, to Benoni port, around an hour.',
  },
}

export const CATEGORY_SEO: Record<string, CategorySeo> = {
  activity: {
    title: 'Things to Do in the Philippines: Islands, Hikes, Tours',
    h1: 'Things to do in the Philippines',
    description: 'Things to do around the Philippines: El Nido and Coron island hopping, Badian canyoneering, the Moalboal sardine run and day hikes near Manila.',
    intro: 'Island tours, canyons, reefs and day hikes, ranked by how worth the trip they are. Every pick shows the starting budget per head.',
  },
  heritage: {
    title: 'Historical Places and Heritage Sites in the Philippines',
    h1: 'Heritage sites in the Philippines',
    description: 'Historical places in the Philippines: Intramuros, Vigan\'s Calle Crisologo, Paoay Church, the Batad rice terraces and old Cebu, with fees and best times.',
    intro: 'Old walls, stone churches, rice terraces and heritage towns, from Intramuros to Ilocos. Most are free or close to it.',
  },
  museum: {
    title: 'Museums in the Philippines Worth the Trip',
    h1: 'Museums in the Philippines',
    description: 'Museums in the Philippines: the free National Museums in Manila, BenCab in Baguio, Pintô in Antipolo and hands-on science at The Mind Museum.',
    intro: 'Art, history and hands-on science, with the free National Museums near the top. Good for rainy days and slow dates.',
  },
  park: {
    title: 'Parks, Viewpoints and Nature Spots in the Philippines',
    h1: 'Parks and viewpoints in the Philippines',
    description: 'Parks and viewpoints in the Philippines: the Chocolate Hills, Hundred Islands, Kiltepan sunrise, Batanes\' rolling hills and Rizal Park, with fees.',
    intro: 'Big views and open spaces, from Bohol\'s Chocolate Hills to the rolling hills of Batanes. Go early or late for the best light.',
  },
  food: {
    title: 'Food Trip Philippines: Restaurants and Food Spots',
    h1: 'Food trips and restaurants in the Philippines',
    description: 'Food trip ideas around the Philippines: Michelin-starred tables in Makati, Bacolod inasal, Cebu lechon and Baguio classics, with budgets per head.',
    intro: 'Only destination-level eating: Michelin-starred dining rooms, iconic food streets and the classics people travel for.',
  },
  cafe: {
    title: 'Cafes Worth the Trip in the Philippines',
    h1: 'Cafes worth the trip',
    description: 'Cafes worth the trip in the Philippines: cake at Calea in Bacolod and lemon pie at Sagada Lemon Pie House, with budgets per head.',
    intro: 'Not every cafe makes the cut. These are the ones people plan a stop around.',
  },
  nightlife: {
    title: 'Nightlife in the Philippines: Bars Worth Going Out For',
    h1: 'Nightlife in the Philippines',
    description: 'Nightlife in the Philippines: the Poblacion bar crawl in Makati, from speakeasies to rooftop bars, with budgets per head.',
    intro: 'Bars and night districts worth getting dressed for, with a starting budget for each.',
  },
}
