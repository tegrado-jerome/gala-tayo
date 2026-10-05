const accentedCityNames: Record<string, string> = {
  'las pinas': 'Las Piñas',
  paranaque: 'Parañaque',
}

/** Area data stores some city names without the ñ; show the proper spelling. */
export function displayCityName(name: string) {
  return name.replace(/\b(las pinas|paranaque)\b/gi, (match) => accentedCityNames[match.toLowerCase()] ?? match)
}
