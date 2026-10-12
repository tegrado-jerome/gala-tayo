// Takes one encrypted dump per PUT and stores it in R2. It can't read, list or delete, so a leaked token can
// only add files (the bucket's lifecycle rule drops them after 14 days).
const KEY = /^db\/\d{4}-\d{2}-\d{2}T\d{4}Z\.tar\.gz\.gpg$/;

/** Compares the Bearer token with the UPLOAD_TOKEN secret through SHA-256 digests, in constant time. */
export async function authorized(header, secret) {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([header.slice(7), secret].map(async (v) => new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(v)))));
  return a.reduce((diff, byte, i) => diff | (byte ^ b[i]), 0) === 0;
}

export default {
  async fetch(request, env) {
    const key = new URL(request.url).pathname.slice(1);
    if (request.method !== "PUT" || !KEY.test(key)) return new Response("Not found", { status: 404 });
    if (!(await authorized(request.headers.get("authorization"), env.UPLOAD_TOKEN))) return new Response("Unauthorized", { status: 401 });
    if (await env.BACKUPS.head(key)) return new Response("Exists", { status: 409 });
    const object = await env.BACKUPS.put(key, request.body, { httpMetadata: { contentType: "application/octet-stream" } });
    return Response.json({ key, size: object.size });
  },
};
