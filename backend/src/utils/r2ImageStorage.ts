import { createHash, createHmac } from "crypto";
import { getSecret } from "../config/keyVault";

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
      getSecret("r2-access-key-id"),
      getSecret("r2-secret-access-key"),
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

function getSignedR2Request(method: "PUT" | "DELETE", key: string, body?: Buffer) {
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
    const canonicalHeaders = `host:${endpoint.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = [method, path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");
    const signature = createHmac("sha256", getSignatureKey(secretAccessKey, dateStamp, region, service))
      .update(stringToSign)
      .digest("hex");
    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      url,
      publicUrl: `${publicBaseUrl}/${key}`,
      headers: {
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
    return require("sharp");
  } catch {
    throw new Error("Image conversion is not configured. Install the backend sharp dependency.");
  }
}

export async function detectImageFormat(input: Buffer) {
  const sharp = loadSharp();
  const metadata = await sharp(input, {
    animated: false,
    failOn: "error",
    limitInputPixels: 25_000_000,
  }).metadata();

  return metadata.format ?? null;
}

export async function convertImageToWebp(input: Buffer, options?: { resizeAvatar?: boolean }) {
  const sharp = loadSharp();

  const pipeline = sharp(input, {
    animated: false,
    failOn: "error",
    limitInputPixels: 25_000_000,
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
