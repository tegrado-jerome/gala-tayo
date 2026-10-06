// "Kailan?" date polls and "Pick the spot" decks are two-option polls tagged in the question
// (see frontend/src/utils/barkadaVotes.ts). These checks keep tagged polls well formed.

type PollOption = { label: string; place_id: string | null };

export const MAX_DATE_POLLS = 5;
export const MAX_SPOT_POLLS = 8;

const KAILAN_PATTERN = /^\[kailan\] (\d{4}-\d{2}-\d{2})(?: (\d{2}):(\d{2}))?$/;
const SPOT_PATTERN = /^\[spot\] [a-z0-9-]+$/;

export type PollKind = "kailan" | "spot" | "regular";

export function pollKind(question: string): PollKind {
  if (question.startsWith("[kailan] ")) return "kailan";
  if (question.startsWith("[spot] ")) return "spot";
  return "regular";
}

function isRealDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Returns an error message for a malformed tagged poll, or null when it is fine. */
export function validateTaggedPoll(question: string, options: PollOption[], existingQuestions: string[], today = new Date()): string | null {
  const kind = pollKind(question);
  if (kind === "regular") return null;

  const sameKind = existingQuestions.filter((existing) => pollKind(existing) === kind);
  if (sameKind.includes(question)) return "That option is already in the poll.";
  if (options.length !== 2) return "Tagged polls need exactly 2 options.";

  if (kind === "kailan") {
    const match = question.match(KAILAN_PATTERN);
    if (!match || !isRealDate(match[1])) return "Pick a valid date.";
    if (match[2] && (Number(match[2]) > 23 || Number(match[3]) > 59)) return "Pick a valid time.";
    // Allow a day of slack for time zones.
    if (match[1] < new Date(today.getTime() - 86_400_000).toISOString().slice(0, 10)) return "Pick a date from today on.";
    if (sameKind.length >= MAX_DATE_POLLS) return `Up to ${MAX_DATE_POLLS} dates per plan.`;
    return null;
  }

  if (!SPOT_PATTERN.test(question)) return "Pick a place from search.";
  const placeId = options[0].place_id;
  if (!placeId || options.some((option) => option.place_id !== placeId)) return "Pick a place from search.";
  if (sameKind.length >= MAX_SPOT_POLLS) return `Up to ${MAX_SPOT_POLLS} places per deck.`;
  return null;
}
