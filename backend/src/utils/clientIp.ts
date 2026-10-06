type HeaderSource = { headers: { get: (name: string) => string | null } };

/** "1.2.3.4:5678" → "1.2.3.4", "[2001:db8::1]:443" → "2001:db8::1"; bare IPv6 is kept as is. */
function stripPort(value: string): string {
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value);
  if (bracketed) return bracketed[1];
  const parts = value.split(":");
  return parts.length === 2 ? parts[0] : value;
}

/**
 * The caller's IP as seen by the Azure front end. Azure appends the real client address (with its port)
 * as the LAST X-Forwarded-For entry; earlier entries come from the client and can be forged, so they are ignored.
 */
export function getClientIp(request: HeaderSource): string {
  const entries = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const last = entries.at(-1);
  return last ? stripPort(last).toLowerCase() : "127.0.0.1";
}
