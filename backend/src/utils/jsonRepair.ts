// Model output is "JSON only" in theory; in practice it arrives fenced, wrapped in prose,
// with trailing commas, or cut off by the token limit. This recovers the object when it can.

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function stripTrailingCommas(text: string) {
  return text.replace(/,\s*([}\]])/g, "$1");
}

// Closes strings, arrays and objects left open by a truncated reply, dropping a dangling key or comma.
function closeTruncated(text: string) {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let lastSafeIndex = -1;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") stack.push(char === "{" ? "}" : "]");
    else if (char === "}" || char === "]") stack.pop();
    if (!inString && (char === "," || char === "{" || char === "[" || char === "}" || char === "]")) lastSafeIndex = index;
  }

  if (stack.length === 0 && !inString) return text;

  // Cut back to the last structural character so a half-written value is dropped, then close what is open.
  let body = text.slice(0, lastSafeIndex + 1).replace(/[,:]\s*$/, "");
  const reopened: string[] = [];
  let quoted = false;
  let escape = false;
  for (const char of body) {
    if (quoted) {
      if (escape) escape = false;
      else if (char === "\\") escape = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{" || char === "[") reopened.push(char === "{" ? "}" : "]");
    else if (char === "}" || char === "]") reopened.pop();
  }
  body = body.replace(/,\s*$/, "");
  return body + reopened.reverse().join("");
}

/** Returns the first JSON object found in model output, repairing common damage, or null. */
export function extractJsonObject(raw: string): Record<string, unknown> | null {
  if (typeof raw !== "string") return null;
  const text = raw
    .replace(/```(?:json)?/gi, "")
    .replace(/[“”]/g, '"')
    .trim();
  const start = text.indexOf("{");
  if (start < 0) return null;

  const end = text.lastIndexOf("}");
  const candidates = [
    end > start ? text.slice(start, end + 1) : null,
    text.slice(start),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    for (const attempt of [candidate, stripTrailingCommas(candidate), stripTrailingCommas(closeTruncated(candidate))]) {
      const parsed = tryParse(attempt);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    }
  }
  return null;
}
