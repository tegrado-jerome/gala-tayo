import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const requiredFiles = [
  {
    label: "sitemap",
    endpoint: "/api/seo/sitemap.xml",
    outputFile: "sitemap.xml",
    validate(content, contentType) {
      const trimmed = content.trim();

      if (!contentType.toLowerCase().includes("xml")) {
        throw new Error(`Expected XML content type, received "${contentType || "unknown"}".`);
      }

      if (!trimmed.startsWith("<?xml") || !trimmed.includes("<urlset") || !trimmed.includes("</urlset>")) {
        throw new Error("Response is not a valid sitemap XML document.");
      }
    },
  },
  {
    label: "robots",
    endpoint: "/api/seo/robots.txt",
    outputFile: "robots.txt",
    validate(content, contentType) {
      const trimmed = content.trim();

      if (!contentType.toLowerCase().startsWith("text/plain")) {
        throw new Error(`Expected plain text content type, received "${contentType || "unknown"}".`);
      }

      if (!trimmed.includes("User-agent:") || trimmed.includes("<html")) {
        throw new Error("Response is not a valid robots.txt document.");
      }
    },
  },
];

function getBackendBaseUrl() {
  const rawBaseUrl = process.env.SEO_BACKEND_BASE_URL || process.env.VITE_API_BASE_URL;

  if (!rawBaseUrl || !rawBaseUrl.trim()) {
    throw new Error("SEO_BACKEND_BASE_URL or VITE_API_BASE_URL is required to fetch SEO files.");
  }

  return rawBaseUrl.trim().replace(/\/+$/, "");
}

function buildUrl(baseUrl, endpoint) {
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const normalizedBaseUrl = baseUrl.endsWith("/api") && normalizedEndpoint.startsWith("/api/")
    ? baseUrl.slice(0, -4)
    : baseUrl;

  return `${normalizedBaseUrl}${normalizedEndpoint}`;
}

async function fetchRequiredFile(baseUrl, file) {
  const url = buildUrl(baseUrl, file.endpoint);
  const response = await fetch(url, {
    headers: {
      Accept: file.outputFile.endsWith(".xml") ? "application/xml,text/xml;q=0.9,*/*;q=0.1" : "text/plain,*/*;q=0.1",
    },
  });

  if (!response.ok) {
    throw new Error(`${file.label} fetch failed with HTTP ${response.status}.`);
  }

  const content = await response.text();
  file.validate(content, response.headers.get("content-type") ?? "");

  return content.endsWith("\n") ? content : `${content}\n`;
}

async function main() {
  const publicDir = path.resolve("public");

  await mkdir(publicDir, { recursive: true });

  let baseUrl;
  try {
    baseUrl = getBackendBaseUrl();
  } catch {
    baseUrl = null;
  }

  for (const file of requiredFiles) {
    const outputPath = path.join(publicDir, file.outputFile);

    if (baseUrl) {
      try {
        const content = await fetchRequiredFile(baseUrl, file);
        await writeFile(outputPath, content, "utf8");
        console.log(`Fetched ${file.outputFile} from backend SEO endpoint.`);
        continue;
      } catch (error) {
        console.log(`Warning: ${error instanceof Error ? error.message : String(error)}.`);
      }
    }

    try {
      const existing = await readFile(outputPath, "utf8");
      console.log(`Using existing ${file.outputFile}.`);
      await writeFile(outputPath, existing.endsWith("\n") ? existing : `${existing}\n`, "utf8");
    } catch {
      throw new Error(`No existing ${file.outputFile} found and could not fetch from backend.`);
    }
  }
}

main().catch((error) => {
  console.error(`Failed to fetch required SEO files: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
