// Hand-written search copy for city pages, matched to how people actually search
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
