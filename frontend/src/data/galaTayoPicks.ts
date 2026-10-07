import galaWorthy from './galaWorthy.json'

// Places that scored 80+ in the gala-worthy scoring, best first: Metro Manila from gala-tayo-benchmarks/gala-worthy/scores.json,
// the rest of the country from gala-tayo-benchmarks/nationwide/*.json (gala_score). Only these get the "GalaTayo Pick" badge.
// The city is the hub each place is listed under, used to spread the home rail across the country.
const galaTayoPickScores: Array<[slug: string, score: number, city: string]> = [
  ['fort-santiago', 100, 'Manila'],
  ['national-museum-of-fine-arts', 100, 'Manila'],
  ['national-museum-of-natural-history', 100, 'Manila'],
  ['binondo-chinatown', 99, 'Manila'],
  ['intramuros', 99, 'Manila'],
  ['el-nido-tour-a-lagoons', 98, 'El Nido'],
  ['san-agustin-church', 98, 'Manila'],
  ['toyo-eatery', 98, 'Makati'],
  ['white-beach-boracay', 98, 'Boracay'],
  ['kayangan-lake-coron', 97, 'Coron'],
  ['chocolate-hills-carmen', 96, 'Tagbilaran'],
  ['gallery-by-chele', 96, 'Taguig'],
  ['cloud-9-siargao', 95, 'Siargao'],
  ['puerto-princesa-underground-river', 95, 'Puerto Princesa'],
  ['batad-rice-terraces-banaue', 94, 'Banaue'],
  ['calle-crisologo-vigan', 94, 'Vigan'],
  ['moalboal-sardine-run-panagsama', 94, 'Moalboal'],
  ['rizal-park-luneta-park', 94, 'Manila'],
  ['apo-island-dauin', 93, 'Dumaguete'],
  ['badian-canyoneering', 93, 'Moalboal'],
  ['twin-lagoon-coron', 93, 'Coron'],
  ['cagsawa-ruins-daraga', 92, 'Legazpi'],
  ['cambugahay-falls-lazi', 92, 'Siquijor'],
  ['el-nido-tour-c-hidden-beaches', 92, 'El Nido'],
  ['kalanggaman-island-palompon', 92, 'Palompon'],
  ['kawasan-falls-badian', 92, 'Moalboal'],
  ['manila-cathedral', 92, 'Manila'],
  ['manila-ocean-park', 92, 'Manila'],
  ['masungi-georeserve-rizal', 92, 'Tanay'],
  ['mount-pulag-kabayan', 92, 'La Trinidad'],
  ['the-mind-museum', 92, 'Taguig'],
  ['the-ruins-talisay', 92, 'Bacolod'],
  ['white-island-camiguin', 92, 'Camiguin'],
  ['basilica-del-santo-nino-cebu', 90, 'Cebu City'],
  ['bencab-museum-tuba', 90, 'Baguio'],
  ['cagayan-de-oro-white-water-rafting', 90, 'Cagayan de Oro'],
  ['miagao-church', 90, 'Iloilo City'],
  ['mount-pinatubo-crater-trek', 90, 'Angeles'],
  ['nacpan-beach-el-nido', 90, 'El Nido'],
  ['siargao-island-hopping-naked-daku-guyam', 90, 'Siargao'],
  ['sumaguing-cave-sagada', 90, 'Sagada'],
  ['ayala-museum', 89, 'Makati'],
  ['anilao-mabini-batangas', 88, 'Mabini, Batangas'],
  ['antonios-tagaytay', 88, 'Tagaytay'],
  ['ayala-triangle-gardens', 88, 'Makati'],
  ['balicasag-island-panglao', 88, 'Panglao'],
  ['boracay-sunset-paraw-sailing', 88, 'Boracay'],
  ['caramoan-island-hopping', 88, 'Legazpi'],
  ['islas-de-gigantes-carles', 88, 'Carles'],
  ['magpupungko-rock-pools-pilar', 88, 'Siargao'],
  ['malapascua-thresher-shark-dive', 88, 'Daanbantayan'],
  ['manokan-country-bacolod', 88, 'Bacolod'],
  ['paoay-church-ilocos-norte', 88, 'Paoay'],
  ['philippine-eagle-center-davao', 88, 'Davao City'],
  ['philippine-tarsier-sanctuary-corella', 88, 'Tagbilaran'],
  ['pinto-art-museum-antipolo', 88, 'Antipolo'],
  ['ricos-lechon-cebu', 88, 'Lapu-Lapu'],
  ['saud-beach-pagudpud', 88, 'Pagudpud'],
  ['sugba-lagoon-del-carmen', 88, 'Siargao'],
  ['las-cabanas-beach-el-nido', 87, 'El Nido'],
  ['aling-lucing-sisig-angeles', 86, 'Angeles'],
  ['alona-beach-panglao', 86, 'Panglao'],
  ['anawangin-cove-zambales', 86, 'San Antonio, Zambales'],
  ['barracuda-lake-coron', 86, 'Coron'],
  ['blue-lagoon-pagudpud', 86, 'Pagudpud'],
  ['burnham-park-baguio', 86, 'Baguio'],
  ['cafe-by-the-ruins-baguio', 86, 'Baguio'],
  ['dahilayan-adventure-park', 86, 'Cagayan de Oro'],
  ['donsol-whale-shark-interaction', 86, 'Donsol'],
  ['hinatuan-enchanted-river', 86, 'Hinatuan'],
  ['kiltepan-viewpoint-sagada', 86, 'Sagada'],
  ['mount-apo', 86, 'Davao City'],
  ['pagsanjan-falls-laguna', 86, 'Pagsanjan'],
  ['sm-mall-of-asia', 86, 'Pasay'],
  ['sohoton-cove-bucas-grande', 86, 'Siargao'],
  ['ariels-point-buruanga', 85, 'Boracay'],
  ['baguio-night-market', 85, 'Baguio'],
  ['kalui-restaurant-puerto-princesa', 85, 'Puerto Princesa'],
  ['osmena-peak-dalaguete', 85, 'Moalboal'],
  ['puka-shell-beach-boracay', 85, 'Boracay'],
  ['bangui-windmills-ilocos-norte', 84, 'Pagudpud'],
  ['bomod-ok-falls-sagada', 84, 'Sagada'],
  ['calea-pastries-bacolod', 84, 'Bacolod'],
  ['camp-john-hay-baguio', 84, 'Baguio'],
  ['good-shepherd-convent-baguio', 84, 'Baguio'],
  ['guimaras-island-hopping-alubihod', 84, 'Iloilo City'],
  ['hill-station-baguio', 84, 'Baguio'],
  ['kota-beach-bantayan', 84, 'Santa Fe'],
  ['las-casas-filipinas-de-acuzar-bagac', 84, 'Subic'],
  ['loboc-river-cruise', 84, 'Tagbilaran'],
  ['mactan-island-hopping-cebu', 84, 'Lapu-Lapu'],
  ['manjuyod-sandbar-bais', 84, 'Dumaguete'],
  ['nagsasa-cove-zambales', 84, 'San Antonio, Zambales'],
  ['paliton-beach-san-juan', 84, 'Siquijor'],
  ['pescador-island-moalboal', 84, 'Moalboal'],
  ['plaza-burgos-empanada-vigan', 84, 'Vigan'],
  ['sabang-beach-baler', 84, 'Baler'],
  ['salagdoong-beach-maria', 84, 'Siquijor'],
  ['sans-rival-cakes-and-pastries-dumaguete', 84, 'Dumaguete'],
  ['sumilon-island-sandbar', 84, 'Oslob'],
  ['taal-heritage-town-batangas', 84, 'Batangas City'],
  ['tappiya-falls-batad', 84, 'Banaue'],
  ['temple-of-leah-cebu', 84, 'Cebu City'],
  ['tinuy-an-falls-bislig', 84, 'Bislig City'],
  ['zubuchon-cebu', 84, 'Cebu City'],
  ['tam-awan-village-baguio', 83, 'Baguio'],
  ['balay-dako-tagaytay', 82, 'Tagaytay'],
  ['balinsasayao-twin-lakes', 82, 'Dumaguete'],
  ['breakthrough-restaurant-iloilo', 82, 'Iloilo City'],
  ['casaroro-falls-valencia', 82, 'Dumaguete'],
  ['eden-nature-park-davao', 82, 'Davao City'],
  ['fort-pilar-zamboanga', 82, 'Zamboanga City'],
  ['fort-san-pedro-cebu', 82, 'Cebu City'],
  ['fortune-island-nasugbu', 82, 'Nasugbu'],
  ['honda-bay-island-hopping-puerto-princesa', 82, 'Puerto Princesa'],
  ['katibawasan-falls-camiguin', 82, 'Camiguin'],
  ['la-trinidad-strawberry-farm', 82, 'La Trinidad'],
  ['lake-sebu-lake-tour', 82, 'Lake Sebu'],
  ['lucban-pahiyas-town', 82, 'Lucban'],
  ['malcapuya-island-coron', 82, 'Coron'],
  ['mantigue-island-camiguin', 82, 'Camiguin'],
  ['mines-view-park-baguio', 82, 'Baguio'],
  ['oh-my-gulay-baguio', 82, 'Baguio'],
  ['real-coffee-and-tea-cafe-boracay', 82, 'Boracay'],
  ['simala-shrine-sibonga', 82, 'Cebu City'],
  ['sugbo-mercado-cebu', 82, 'Cebu City'],
  ['tops-lookout-cebu', 82, 'Cebu City'],
  ['treasure-mountain-tanay', 82, 'Tanay'],
  ['balay-negrense-silay', 80, 'Bacolod'],
  ['banaue-rice-terraces-viewpoint', 80, 'Banaue'],
  ['barasoain-church-malolos', 80, 'Malolos'],
  ['bohol-bee-farm', 80, 'Panglao'],
  ['bounty-beach-malapascua', 80, 'Daanbantayan'],
  ['breakfast-at-antonios-tagaytay', 80, 'Tagaytay'],
  ['calauit-safari-park-busuanga', 80, 'Coron'],
  ['camsur-watersports-complex-pili', 80, 'Legazpi'],
  ['cape-bojeador-lighthouse-burgos', 80, 'Pagudpud'],
  ['casa-manila', 80, 'Manila'],
  ['cebu-taoist-temple', 80, 'Cebu City'],
  ['cultural-center-of-the-philippines-complex', 80, 'Pasay'],
  ['danao-adventure-park-bohol', 80, 'Danao'],
  ['el-union-coffee-san-juan', 80, 'San Juan, La Union'],
  ['good-taste-baguio', 80, 'Baguio'],
  ['house-of-lechon-cebu', 80, 'Cebu City'],
  ['iloilo-river-esplanade', 80, 'Iloilo City'],
  ['kapurpurawan-rock-formation-burgos', 80, 'Pagudpud'],
  ['lakawon-island-cadiz', 80, 'Bacolod'],
  ['larsian-bbq-cebu', 80, 'Cebu City'],
  ['lignon-hill-legazpi', 80, 'Legazpi'],
  ['mount-batulao-nasugbu', 80, 'Nasugbu'],
  ['mt-tapyas-coron', 80, 'Coron'],
  ['port-barton-island-hopping', 80, 'San Vicente, Palawan'],
  ['rizal-boulevard-dumaguete', 80, 'Dumaguete'],
  ['roxas-night-market-davao', 80, 'Davao City'],
  ['sagada-lemon-pie-house', 80, 'Sagada'],
  ['session-road-baguio', 80, 'Baguio'],
  ['siargao-coconut-road-viewpoint', 80, 'Siargao'],
  ['siete-pecados-coron', 80, 'Coron'],
  ['sky-ranch-tagaytay', 80, 'Tagaytay'],
  ['sonyas-garden-alfonso', 80, 'Tagaytay'],
  ['tumalog-falls-oslob', 80, 'Oslob'],
  ['yap-san-diego-ancestral-house', 80, 'Cebu City'],
]

// A pick that was later hidden has no public page (404), so it must not be linked or badged.
const hiddenSlugs = new Set((galaWorthy as { hidden: string[] }).hidden)

export const galaTayoPickSlugs = galaTayoPickScores.map(([slug]) => slug).filter((slug) => !hiddenSlugs.has(slug))

const pickSlugs = new Set(galaTayoPickSlugs)

export function isGalaTayoPick(slug: string | null | undefined) {
  return Boolean(slug && pickSlugs.has(slug.trim().toLowerCase()))
}

/** Best first, at most `perCity` from each city, cities taking turns so one hub (Manila has the most picks) cannot fill the list. */
function takeByCity(slugs: string[], limit: number, perCity: number) {
  const byCity = new Map<string, string[]>()
  for (const slug of slugs) {
    const city = cityBySlug.get(slug) ?? ''
    byCity.set(city, [...(byCity.get(city) ?? []), slug])
  }
  const picked: string[] = []
  for (let round = 0; round < perCity; round += 1) {
    for (const citySlugs of byCity.values()) {
      if (citySlugs[round] && picked.length < limit) picked.push(citySlugs[round])
    }
  }
  return picked
}

const cityBySlug = new Map(galaTayoPickScores.map(([slug, , city]) => [slug, city]))

/**
 * Picks for the home rail: photo picks first (up to 2 per city), then picks from around the country
 * (1 per city) so the rail is not Manila-only. Photo-less picks fill in as their photos arrive.
 */
export function getRailPickSlugs(limit: number, hasPhoto: (slug: string) => boolean, exclude: string[] = []) {
  const candidates = galaTayoPickSlugs.filter((slug) => !exclude.includes(slug))
  const withPhoto = takeByCity(candidates.filter(hasPhoto), limit, 2)
  const nationwide = takeByCity(candidates.filter((slug) => !hasPhoto(slug)), limit, 1)
  const photoCount = Math.max(Math.ceil(limit / 2), limit - nationwide.length)
  return [...withPhoto.slice(0, photoCount), ...nationwide].slice(0, limit)
}
