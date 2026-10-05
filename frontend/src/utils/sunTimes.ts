// Sunset for Metro Manila, worked out on the device (NOAA solar equations), so "golden hour" needs no API.
const MANILA = { lat: 14.5995, lng: 120.9842 }
const RAD = Math.PI / 180

/** Today's sunset in Manila as a Date, or null on polar edge cases (never in Manila). */
export function getManilaSunset(date = new Date()): Date | null {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0)
  const dayOfYear = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86400000)
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1)
  const eqTime =
    229.18 *
    (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma))
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma)
  const cosHa = Math.cos(90.833 * RAD) / (Math.cos(MANILA.lat * RAD) * Math.cos(decl)) - Math.tan(MANILA.lat * RAD) * Math.tan(decl)
  if (cosHa < -1 || cosHa > 1) return null
  const ha = Math.acos(cosHa) / RAD
  const sunsetUtcMinutes = 720 - 4 * (MANILA.lng - ha) - eqTime
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) + sunsetUtcMinutes * 60000)
}

export function formatManilaTime(value: Date) {
  return value.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })
}
