import { createHash, createHmac } from "crypto";
import { getSecret } from "../config/keyVault";
import { KEY_VAULT_SECRET_NAMES } from "../config/secretNames";

type R2Config = {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: URL;
  bucketName: string;
  publicBaseUrl: string;
};

let cachedR2ConfigPromise: Promise<R2Config> | null = null;

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

function sha256Hex(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function getSignatureKey(secret: string, dateStamp: string, region: string, service: string) {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

async function loadR2Config() {
  if (cachedR2ConfigPromise) {
    return cachedR2ConfigPromise;
  }

  cachedR2ConfigPromise = (async () => {
    const endpointUrl = getRequiredEnv("R2_ENDPOINT_URL");
    const bucketName = getRequiredEnv("R2_BUCKET_NAME");
    const publicBaseUrl = getRequiredEnv("R2_PUBLIC_BASE_URL").replace(/\/$/, "");
    const [accessKeyId, secretAccessKey] = await Promise.all([
      getSecret(KEY_VAULT_SECRET_NAMES.R2_ACCESS_KEY_ID),
      getSecret(KEY_VAULT_SECRET_NAMES.R2_SECRET_ACCESS_KEY),
    ]);

    return {
      accessKeyId,
      secretAccessKey,
      endpoint: new URL(endpointUrl),
      bucketName,
      publicBaseUrl,
    };
  })().catch((error) => {
    cachedR2ConfigPromise = null;
    throw error;
  });

  return cachedR2ConfigPromise;
}

/** `signedHeaders` (lowercase names) are added to the signature, e.g. the conditional-write headers. */
function getSignedR2Request(method: "GET" | "PUT" | "DELETE", key: string, body?: Buffer, signedHeaders: Record<string, string> = {}) {
  return loadR2Config().then(({ accessKeyId, secretAccessKey, endpoint, bucketName, publicBaseUrl }) => {
    const encodedKey = key.split("/").map(encodeURIComponent).join("/");
    const path = `/${bucketName}/${encodedKey}`;
    const url = `${endpoint.origin}${path}`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const region = "auto";
    const service = "s3";
    const payloadHash = sha256Hex(body ?? "");
    const headersToSign: Record<string, string> = {
      ...signedHeaders,
      host: endpoint.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };
    const names = Object.keys(headersToSign).sort();
    const canonicalHeaders = names.map((name) => `${name}:${headersToSign[name].trim()}\n`).join("");
    const signedHeaderNames = names.join(";");
    const canonicalRequest = [method, path, "", canonicalHeaders, signedHeaderNames, payloadHash].join("\n");
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");
    const signature = createHmac("sha256", getSignatureKey(secretAccessKey, dateStamp, region, service))
      .update(stringToSign)
      .digest("hex");
    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`;

    return {
      url,
      publicUrl: `${publicBaseUrl}/${key}`,
      headers: {
        ...signedHeaders,
        Authorization: authorization,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
      },
    };
  });
}

export async function uploadWebpToR2(
  key: string,
  body: Buffer,
  options?: { cacheControl?: string }
) {
  const signedRequest = await getSignedR2Request("PUT", key, body);
  const response = await fetch(signedRequest.url, {
    method: "PUT",
    headers: {
      ...signedRequest.headers,
      "Content-Type": "image/webp",
      "Cache-Control": options?.cacheControl ?? "public, max-age=31536000, immutable",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`R2 upload failed with status ${response.status}.`);
  }

  return signedRequest.publicUrl;
}

/** Reads a small text object (JSON state). Null when it doesn't exist; throws when R2 can't be reached. */
export async function getR2Text(key: string): Promise<{ body: string; etag: string } | null> {
  const signedRequest = await getSignedR2Request("GET", key);
  const response = await fetch(signedRequest.url, { headers: signedRequest.headers, signal: AbortSignal.timeout(10_000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`R2 read failed with status ${response.status}.`);
  return { body: await response.text(), etag: response.headers.get("etag") ?? "" };
}

/**
 * Writes a small JSON text object. `ifNoneMatch: "*"` only creates it; `ifMatch` only replaces that exact version
 * (R2 supports both on PutObject). Returns false when the condition failed (412); throws on other errors.
 */
export async function putR2Text(key: string, body: string, options: { ifNoneMatch?: "*"; ifMatch?: string } = {}): Promise<boolean> {
  const conditions: Record<string, string> = {};
  if (options.ifNoneMatch) conditions["if-none-match"] = options.ifNoneMatch;
  if (options.ifMatch) conditions["if-match"] = options.ifMatch;
  const payload = Buffer.from(body, "utf8");
  const signedRequest = await getSignedR2Request("PUT", key, payload, conditions);
  const response = await fetch(signedRequest.url, {
    method: "PUT",
    headers: {
      ...signedRequest.headers,
      "Content-Type": "application/json",
      // State that changes a few times a day: never let the public domain's cache keep an old copy.
      "Cache-Control": "no-store",
    },
    body: payload,
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 412) return false;
  if (!response.ok) throw new Error(`R2 write failed with status ${response.status}.`);
  return true;
}

export function getImageUrl(baseUrl: string, size: "full" | "thumb" = "full"): string {
  if (size === "thumb") {
    return baseUrl.replace(/\.webp$/, "_thumb.webp");
  }
  return baseUrl;
}

export async function uploadThumbnailToR2(
  key: string,
  input: Buffer,
  options?: { cacheControl?: string }
): Promise<string> {
  const sharp = loadSharp();
  if (!sharp) return uploadWebpToR2(key.replace(/\.webp$/i, "_thumb.webp"), input, options);

  const thumbBody = await sharp(input, {
    animated: false,
    failOn: "error",
    limitInputPixels: 100_000_000,
  })
    .rotate()
    .resize(200, 200, { fit: "cover", position: "center" })
    .webp({ quality: 75, effort: 2 })
    .toBuffer();

  const thumbKey = key.replace(/\.webp$/i, "_thumb.webp");
  return uploadWebpToR2(thumbKey, thumbBody, options);
}

export async function deleteR2Object(storageKey: string | null | undefined) {
  if (!storageKey) {
    return;
  }

  const signedRequest = await getSignedR2Request("DELETE", storageKey);
  const response = await fetch(signedRequest.url, {
    method: "DELETE",
    headers: signedRequest.headers,
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`R2 delete failed with status ${response.status}.`);
  }
}

function loadSharp() {
  try {
    const mod = require("sharp");
    if (typeof mod !== "function") {
      console.error("Sharp loaded but is not a function, skipping image processing");
      return null;
    }
    return mod;
  } catch (error) {
    console.error("Sharp unavailable, skipping image processing:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

export async function detectImageFormat(input: Buffer) {
  const sharp = loadSharp();
  if (!sharp) return null;

  const metadata = await sharp(input, {
    animated: false,
    failOn: "error",
    limitInputPixels: 100_000_000,
  }).metadata();

  return metadata.format ?? null;
}

export async function convertImageToWebp(input: Buffer, options?: { resizeAvatar?: boolean }) {
  const sharp = loadSharp();
  if (!sharp) return input;

  const pipeline = sharp(input, {
    animated: false,
    failOn: "error",
    limitInputPixels: 100_000_000,
  }).rotate();

  if (options?.resizeAvatar) {
    pipeline.resize(512, 512, {
      fit: "cover",
      position: "center",
    });
  } else {
    pipeline.resize({
      width: 1800,
      height: 1800,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  return pipeline
    .webp({
      quality: 82,
      effort: 4,
    })
    .toBuffer();
}
