const MAX_CHECKIN_DISTANCE_KM = 1.5;

export type CityStamp = {
  city: string;
  collected: boolean;
  places: number;
  first_checkin_at: string | null;
};

export function distanceKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

export function isNearPlace(visitor: { lat: number; lng: number }, place: { lat: number; lng: number }) {
  return distanceKm(visitor, place) <= MAX_CHECKIN_DISTANCE_KM;
}

// Monday of the week containing `isoDate` (YYYY-MM-DD), as YYYY-MM-DD.
function weekStart(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

function previousWeek(weekKey: string) {
  const date = new Date(`${weekKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 7);
  return date.toISOString().slice(0, 10);
}

// Consecutive weeks with at least one check-in, ending this week (or last week if this week has none yet).
export function weeklyStreak(checkinDates: string[], today: string) {
  const weeks = new Set(checkinDates.map(weekStart));
  let cursor = weekStart(today);
  if (!weeks.has(cursor)) cursor = previousWeek(cursor);

  let streak = 0;
  while (weeks.has(cursor)) {
    streak += 1;
    cursor = previousWeek(cursor);
  }
  return streak;
}

export function buildCityStamps(
  cities: string[],
  checkins: Array<{ city: string | null; place_id: string; created_at: string }>
): CityStamp[] {
  return cities.map((city) => {
    const inCity = checkins.filter((checkin) => (checkin.city ?? "").toLowerCase() === city.toLowerCase());
    const first = inCity.map((checkin) => checkin.created_at).sort()[0] ?? null;
    return {
      city,
      collected: inCity.length > 0,
      places: new Set(inCity.map((checkin) => checkin.place_id)).size,
      first_checkin_at: first,
    };
  });
}

const HISTORY_MONTHS = 13;
const HISTORY_MAX = 500;

/** Check-ins from the last 13 calendar months, newest first: enough for a monthly recap without sending everything. */
export function recentCheckinHistory<T extends { created_at: string }>(checkins: T[], now: Date) {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - HISTORY_MONTHS + 1, 1)).toISOString();
  return checkins.filter((checkin) => new Date(checkin.created_at).toISOString() >= since).slice(0, HISTORY_MAX);
}
