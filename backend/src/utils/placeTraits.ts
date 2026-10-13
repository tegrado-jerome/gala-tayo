import placeTraits from "../data/placeTraits.json";

// "Walang sasakyan" (no car needed), read from a place's own commute_access text. The rule says yes only
// when the text names a public ride (train, bus, jeep, van, ferry) and nothing on the way needs a car,
// a hired vehicle or a motorbike; anything unclear stays unmarked.

const LAND_MODES = [
  { label: "Train", pattern: /\b(lrt|mrt|pnr|train)\b/ },
  { label: "Bus", pattern: /\b(bus|buses|p2p)\b/ },
  { label: "Jeep", pattern: /\b(jeepneys?|jeeps?|e-?jeeps?|uv express|multicabs?)\b/ },
  { label: "Van", pattern: /(?<!\b(hire|hired|rent|rented|private|chartered) (a )?)\bvans?\b/ },
] as const;
const FERRY = /\b(ferry|ferries|roro|fastcraft|fast craft|public (pump)?boats?|passenger boats?)\b/;
const BOAT = /\b(boats?|bancas?|bangkas?|pumpboats?|outriggers?|faluwa)\b/;
const TRICYCLE = /\b(tricycles?|e-?trikes?|pedicabs?|padyak)\b/;
const WALK = /\bwalk(s|able|ing)?\b/;
const HOURS = /\bhours?\b/;

const NEEDS_A_CAR = [
  /\bno (direct|regular|public|scheduled) (transport|transportation|jeeps?|jeepneys?|bus|buses|boats?|trips?|vehicles?)\b/,
  /\b(do|does) not run\b/,
  /\bpublic trips are few\b/,
  /\b(car|motorbike|vehicle)s? only\b/,
  /\b(hire|hired|rent|rented|charter|chartered) (a |an )?(car|van|vehicle|driver|jeep)/,
  /\b(4x4|self-drive)\b/,
  /\b(habal-habal|habal|motorbikes?|motorcycles?|scooters?|atvs?)\b/,
];
// "a tricycle or habal-habal" still works without a motorbike, so that kind of choice is not a blocker.
const MOTORBIKE_OR_RIDE =
  /\b(tricycles?|jeepneys?|jeeps?|e-?trikes?) or (an? )?(habal-habal|habal|scooter|motorbike)( \(motorcycle taxi\))?|\b(habal-habal|habal|scooter|motorbike)( \(motorcycle taxi\))? or (an? )?(tricycles?|jeepneys?|jeeps?|e-?trikes?)\b/g;

const joinRides = (labels: string[]) => labels.slice(0, 2).map((label, index) => (index === 0 ? label : label.toLowerCase())).join(" or ");

const needsACar = (text: string) => NEEDS_A_CAR.some((pattern) => pattern.test(text));
const readable = (commuteAccess: string | null | undefined) => (commuteAccess ?? "").toLowerCase().replace(MOTORBIKE_OR_RIDE, "tricycle");

/** One line such as "Bus, then a tricycle", or null when the commute text does not clearly avoid a car. */
export function noCarReason(commuteAccess: string | null | undefined): string | null {
  const text = readable(commuteAccess);
  if (!text.trim() || needsACar(text)) return null;
  // A train to the bus terminal before a ride of hours is not how you get there; the bus is.
  const land = LAND_MODES.filter((mode) => mode.pattern.test(text) && !(mode.label === "Train" && HOURS.test(text))).map((mode) => mode.label);
  const ferry = FERRY.test(text);
  if (land.length === 0 && !ferry) return null;
  if (land.length === 0) return TRICYCLE.test(text) ? "Ferry, then a tricycle" : BOAT.test(text.replace(FERRY, "")) ? "Ferry, then a boat" : "Ferry gets you there";
  const rides = joinRides(land);
  // A city stop by train is a walk or a short ride from the station, even where a river ferry also runs.
  if (land[0] === "Train") return WALK.test(text) ? `${rides}, then a short walk` : `${rides}, then a short ride`;
  // The sea leg can come before or after the ride (port, then a van to the beach), so no order is implied.
  if (ferry) return `${rides}, plus a ferry`;
  if (BOAT.test(text)) return `${rides}, plus a boat`;
  if (TRICYCLE.test(text)) return `${rides}, then a tricycle`;
  if (WALK.test(text)) return `${rides}, then a short walk`;
  return `${rides} gets you there`;
}

// Solo-friendly: our own "Solo Trip" tag, a way in without a car (a taxi or a walk from town counts), and no
// safety tip that warns of deaths, expert-only conditions or a multi-day expedition. Only places that pass
// this get a hand-written reason and caveat in data/placeTraits.json.
const TOWN_ACCESS = /\b(walk\w*|tricycles?|e-?trikes?|taxis?|grab|ride-hailing)\b/;
const SOLO_RISK = /\b(drown\w*|killed|died|deaths?|swept away|landslides?|for experienced|experienced (surfers|divers|hikers) only|several days|multi-day|medical certificate)\b/i;

export type SoloCheck = { goodFor: string[]; commuteAccess: string | null; safetyTips: string[] };

export function soloEligible({ goodFor, commuteAccess, safetyTips }: SoloCheck): boolean {
  if (!goodFor.includes("Solo Trip") || safetyTips.some((tip) => SOLO_RISK.test(tip))) return false;
  const text = readable(commuteAccess);
  return noCarReason(commuteAccess) !== null || (TOWN_ACCESS.test(text) && !needsACar(text));
}

type PlaceTraitsFile = { noCar: Record<string, string>; solo: Record<string, { why: string; caveat: string }> };
const traits = placeTraits as PlaceTraitsFile;

export const isNoCarSlug = (slug: string) => Object.prototype.hasOwnProperty.call(traits.noCar, slug);
export const isSoloSlug = (slug: string) => Object.prototype.hasOwnProperty.call(traits.solo, slug);
