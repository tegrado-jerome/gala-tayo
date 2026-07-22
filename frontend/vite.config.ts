import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const R2_PUBLIC_BASE_URL = 'https://media.galatayo.app'

function normalizePlaceSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const placeImageSlugAliases: Record<string, string> = {
  'ace-water-spa-pasig': 'ace-water-spa-pasig',
  'art-in-island': 'art-in-island',
  'ayala-triangle-gardens': 'ayala-triangle-gardens',
  'binondo-chinatown': 'binondo-chinatown',
  'bonifacio-high-street': 'bonifacio-high-street',
  'caloocan-city-people-s-park': 'caloocan-city-peoples-park',
  commune: 'commune',
  'eastwood-city': 'eastwood-city',
  'festival-mall-alabang': 'festival-mall-alabang',
  'fort-santiago': 'fort-santiago',
  glorietta: 'glorietta',
  'glorietta-cinemas': 'glorietta-cinemas',
  'greenbelt-park': 'greenbelt-park',
  'greenhills-mall-greenhills-shopping-center': 'greenhills-mall-greenhills-shopping-center',
  intramuros: 'intramuros',
  'kapitan-moy-cultural-center': 'kapitan-moy-cultural-center',
  'malabon-zoo-aquarium-and-botanical-garden': 'malabon-zoo-aquarium-and-botanical-garden',
  'manila-ocean-park': 'manila-ocean-park',
  'marikina-river-park': 'marikina-river-park',
  'museo-valenzuela': 'museo-valenzuela',
  'national-museum-of-natural-history': 'national-museum-of-natural-history',
  'navotas-centennial-park': 'navotas-centennial-park',
  'navotas-citywalk-and-amphitheater': 'navotas-citywalk-and-amphitheater',
  'okada-manila': 'okada-manila',
  'inapuyan-resto-grill-pateros': 'inapuyan-resto-grill-pateros',
  'pateros-town-plaza': 'pateros-town-plaza',
  'quiapo-church': 'quiapo-church',
  'rizal-park-luneta-park': 'rizal-park-luneta-park',
  'shangri-la-plaza': 'shangri-la-plaza',
  'sm-city-valenzuela': 'sm-city-valenzuela',
  'sm-mall-of-asia': 'sm-mall-of-asia',
  'sm-megamall': 'sm-megamall',
  'sm-southmall': 'sm-southmall',
  'some-thai': 'some-thai',
  'st-joseph-parish-bamboo-organ-church': 'st-joseph-parish-bamboo-organ-church',
  'star-city': 'star-city',
  'superpark-mckinley': 'superpark-mckinley',
  'the-bellevue-manila': 'the-bellevue-manila',
  'the-mind-museum': 'the-mind-museum',
  'venice-grand-canal-mall': 'venice-grand-canal-mall',
  'z-hostel-rooftop': 'z-hostel-rooftop',
}

function getImageUrl(name: string): string | null {
  const slug = normalizePlaceSlug(name)
  if (!slug) return null
  const imageSlug = placeImageSlugAliases[slug] || slug
  return `${R2_PUBLIC_BASE_URL}/places/${imageSlug}/${imageSlug}-1.webp`
}

function getAllHomeImageUrls(): string[] {
  const topPicks = [
    'Space Time Cube',
    'National Museum of Fine Arts',
    'Ayala Malls Manila Bay',
    'Venice Grand Canal Mall',
    'Bonifacio High Street',
    'Ortigas Cinemas Estancia',
    'The Podium',
    'Art in Island',
    'The Fun Roof Poblacion',
    'Fort Santiago',
  ]

  const cityPlaces = [
    'Caloocan City People\u2019s Park',
    'SM Southmall',
    'Glorietta',
    'Malabon Zoo, Aquarium and Botanical Garden',
    'Shangri-La Plaza',
    'Intramuros',
    'Kapitan Moy Cultural Center',
    'Festival Mall Alabang',
    'Navotas Citywalk and Amphitheater',
    'Okada Manila',
    'SM Mall of Asia',
    'Ace Water Spa Pasig',
    'Art in Island',
    'Greenhills Mall / Greenhills Shopping Center',
    'Bonifacio High Street',
    'Museo Valenzuela',
  ]

  const categoryPlaces = [
    'SuperPark McKinley',
    'Commune',
    'Glorietta Cinemas',
    'Some Thai',
    'Kapitan Moy Cultural Center',
    'The Bellevue Manila',
    'SM Megamall',
    'National Museum of Natural History',
    'Z Hostel Rooftop',
    'Greenbelt Park',
  ]

  const allNames = [...topPicks, ...cityPlaces, ...categoryPlaces]
  const seen = new Set<string>()
  const urls: string[] = []

  for (const name of allNames) {
    const url = getImageUrl(name)
    if (url && !seen.has(url)) {
      seen.add(url)
      urls.push(url)
    }
  }

  return urls
}

function homeImagePreloadPlugin(): Plugin {
  const imageUrls = getAllHomeImageUrls()

  return {
    name: 'home-image-preload',
    transformIndexHtml(html) {
      const preloadLinks = imageUrls.map((url, i) => {
        const priority = i < 6 ? 'high' : 'low'
        return `    <link rel="preload" as="image" href="${url}" fetchpriority="${priority}">`
      }).join('\n')

      return html.replace('</head>', `${preloadLinks}\n  </head>`)
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    homeImagePreloadPlugin(),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:7071',
        changeOrigin: true,
        timeout: 50_000,
        proxyTimeout: 50_000,
      },
    },
  },
})
