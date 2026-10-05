// Port of frontend/src/utils/sunTimes.ts (NOAA solar equations) so plans can time sunset stops without an API.
const MANILA = { lat: 14.5995, lng: 120.9842 };
const RAD = Math.PI / 180;
const MANILA_UTC_OFFSET_MINUTES = 8 * 60;

/** Sunset on an ISO date (YYYY-MM-DD) as minutes after midnight, Philippine time. */
export function getSunsetMinutes(isoDate: string, location: { lat: number; lng: number } = MANILA): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  const dayOfYear = Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 0)) / 86400000);
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1);
  const eqTime =
    229.18 *
    (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const cosHa = Math.cos(90.833 * RAD) / (Math.cos(location.lat * RAD) * Math.cos(decl)) - Math.tan(location.lat * RAD) * Math.tan(decl);
  const ha = Math.acos(Math.min(1, Math.max(-1, cosHa))) / RAD;
  const sunsetUtcMinutes = 720 - 4 * (location.lng - ha) - eqTime;
  return Math.round(sunsetUtcMinutes + MANILA_UTC_OFFSET_MINUTES);
}
