const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

const SOURCE_DIR = String.raw`D:\Downloads HDD\METRO-MANILA`;
const SEED_DIR = path.join(__dirname, '..', 'seed-data', 'cities');
const BACKEND_DIR = path.join(__dirname, '..');
const REPORT_PATHS = {
  match: path.join(BACKEND_DIR, 'r2-image-match-report.csv'),
  unmatched: path.join(BACKEND_DIR, 'r2-image-unmatched.csv'),
  missing: path.join(BACKEND_DIR, 'r2-image-missing.csv'),
};
const SUPPORTED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.jfif', '.webp']);

function resolveR2Env() {
  const aliases = [
    { from: 'r2-access-key-id', to: 'R2_ACCESS_KEY_ID' },
    { from: 'r2-secret-access-key', to: 'R2_SECRET_ACCESS_KEY' },
  ];
  for (const { from, to } of aliases) {
    if (!process.env[to] && process.env[from]) {
      process.env[to] = process.env[from];
    }
  }
  if (!process.env.R2_ACCOUNT_ID && process.env['r2-endpoint-url']) {
    const m = String(process.env['r2-endpoint-url']).match(
      /^https:\/\/([^.]+)\.r2\.cloudflarestorage\.com/
    );
    if (m) {
      process.env.R2_ACCOUNT_ID = m[1];
    }
  }
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cityFromFolder(folder) {
  return folder
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function cityFromFilename(file) {
  return path
    .basename(file, path.extname(file))
    .replace(/-/g, ' ');
}

function parseFileName(nameNoExt) {
  const match = String(nameNoExt).match(/^(.*?)[-\s]+(\d+)$/);
  if (match) {
    return {
      slug: slugify(match[1]),
      number: parseInt(match[2], 10),
    };
  }
  return {
    slug: slugify(nameNoExt),
    number: 1,
  };
}

function diceCoefficient(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const aBigrams = new Map();
  for (let i = 0; i < a.length - 1; i++) {
    const bigram = a.substring(i, i + 2);
    aBigrams.set(bigram, (aBigrams.get(bigram) || 0) + 1);
  }
  let intersection = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bigram = b.substring(i, i + 2);
    const count = aBigrams.get(bigram) || 0;
    if (count > 0) {
      aBigrams.set(bigram, count - 1);
      intersection++;
    }
  }
  return (2 * intersection) / (a.length - 1 + b.length - 1);
}

function findSuggestions(detectedSlug, expectedInSameCity, allExpected, limit = 5) {
  const scoredSameCity = expectedInSameCity
    .map(({ slug }) => ({ slug, score: diceCoefficient(detectedSlug, slug) }))
    .filter((x) => x.score > 0);
  const seenSlugs = new Set(scoredSameCity.map((s) => s.slug));
  const scoredOther = allExpected
    .filter(({ slug }) => !seenSlugs.has(slug))
    .map(({ slug }) => ({ slug, score: diceCoefficient(detectedSlug, slug) }))
    .filter((x) => x.score > 0);
  return [...scoredSameCity, ...scoredOther]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function formatSuggestions(suggestions) {
  return suggestions
    .map((s) => `${s.slug}|${s.score.toFixed(2)}`)
    .join('; ');
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function toCsv(rows) {
  return rows.map((r) => r.map(csvEscape).join(',')).join('\r\n') + '\r\n';
}

function pickFirstString(...candidates) {
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c;
  }
  return '';
}

function readSeedFile(filePath, fileBaseName) {
  let raw;
  try {
    raw = require('fs').readFileSync(filePath, 'utf8');
  } catch (err) {
    console.error(`[WARN] Could not read seed file: ${filePath} (${err.message})`);
    return [];
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error(`[WARN] Could not parse seed file: ${filePath} (${err.message})`);
    return [];
  }
  const fallbackCity = cityFromFilename(fileBaseName);
  const places = Array.isArray(data)
    ? data
    : (Array.isArray(data && data.places) ? data.places : []);
  if (places.length === 0) return [];
  const fileCity = pickFirstString(
    !Array.isArray(data) && typeof data === 'object' ? data.city : '',
    Array.isArray(data) ? '' : '',
    places[0] && places[0].city,
    fallbackCity
  );
  return places.map((p) => ({ place: p, fileCity }));
}

async function loadExpectedPlaces() {
  const byCity = new Map();
  const all = [];
  const slugToName = new Map();
  let entries;
  try {
    entries = await fsp.readdir(SEED_DIR, { withFileTypes: true });
  } catch (err) {
    console.error(`[WARN] Could not read seed dir: ${SEED_DIR} (${err.message})`);
    return { byCity, all, slugToName };
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
    const full = path.join(SEED_DIR, entry.name);
    const items = readSeedFile(full, entry.name);
    for (const { place: p, fileCity } of items) {
      if (!p || typeof p !== 'object') continue;
      const rawSlug = typeof p.slug === 'string' ? p.slug.trim() : '';
      const rawName = typeof p.name === 'string' ? p.name.trim() : '';
      const derivedSlug = rawSlug.length > 0 ? slugify(rawSlug) : slugify(rawName);
      if (!derivedSlug) continue;
      const placeCity = pickFirstString(
        typeof p.city === 'string' ? p.city : '',
        fileCity
      );
      const name = rawName || derivedSlug;
      const rec = { slug: derivedSlug, name, city: placeCity };
      if (!byCity.has(placeCity)) byCity.set(placeCity, []);
      byCity.get(placeCity).push(rec);
      all.push(rec);
      if (!slugToName.has(derivedSlug)) {
        slugToName.set(derivedSlug, name);
      }
    }
  }
  return { byCity, all, slugToName };
}

function buildR2Key(slug, number) {
  return `places/${slug}/${slug}-${number}.webp`;
}

async function writeCsv(filePath, header, rows) {
  const content = toCsv([header, ...rows]);
  await fsp.writeFile(filePath, content, 'utf8');
}

async function main() {
  const args = process.argv.slice(2);
  let isUpload = args.includes('--upload');
  const isReport = args.includes('--report');

  if (isReport && isUpload) {
    console.warn('[WARN] --report and --upload both set; running in REPORT mode (no upload).');
    isUpload = false;
  }
  const actuallyUpload = isUpload;

  console.log('=== GalaTayo R2 Image Upload ===');
  console.log(`Source: ${SOURCE_DIR}`);
  if (isReport) console.log(`Mode:   REPORT (no upload, CSV reports will be written)`);
  else if (actuallyUpload) console.log(`Mode:   UPLOAD`);
  else console.log(`Mode:   DRY-RUN`);

  resolveR2Env();

  if (actuallyUpload) {
    const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length > 0) {
      const lines = ['Missing env vars: ' + missing.join(', ')];
      if (missing.includes('R2_BUCKET_NAME')) {
        lines.push(
          'R2_BUCKET_NAME cannot be safely inferred from r2-endpoint-url ' +
          '(the bucket name is not part of the URL).'
        );
      }
      lines.push(
        'Set them in backend/.env or export them in your shell.',
        'Canonical names: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME.',
        'Aliases: r2-access-key-id, r2-secret-access-key (r2-endpoint-url can infer R2_ACCOUNT_ID).'
      );
      console.error(lines.join('\n'));
      process.exit(1);
    }
  }

  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`Source directory does not exist: ${SOURCE_DIR}`);
    process.exit(1);
  }

  const { byCity: expectedByCity, all: allExpected, slugToName } = await loadExpectedPlaces();
  console.log(`Loaded ${slugToName.size} unique place slug(s) from seed files.`);

  let s3;
  if (actuallyUpload) {
    s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }

  const cityEntries = fs
    .readdirSync(SOURCE_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  const summary = {
    total: 0,
    wouldUpload: 0,
    uploaded: 0,
    skippedUnsupported: 0,
    skippedUnmatched: 0,
    errors: 0,
  };

  const matchRows = [];
  const unmatchedRows = [];
  const detectedSlugs = new Set();
  const detectedSlugCount = new Map();

  for (const cityEntry of cityEntries) {
    const cityPath = path.join(SOURCE_DIR, cityEntry.name);
    const cityLabel = cityFromFolder(cityEntry.name);
    const files = fs.readdirSync(cityPath);
    console.log(`\n--- City: ${cityEntry.name} (${files.length} file(s)) ---`);

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      const relPath = path.join(cityEntry.name, file);
      summary.total++;

      if (!SUPPORTED_EXTS.has(ext)) {
        console.log(`[SKIP UNSUPPORTED] ${relPath}`);
        matchRows.push([cityLabel, relPath, '', 'false', '', '', 'unsupported file extension']);
        summary.skippedUnsupported++;
        continue;
      }

      const nameNoExt = path.basename(file, path.extname(file));
      const { slug, number } = parseFileName(nameNoExt);
      const r2Key = buildR2Key(slug, number);

      if (!slug) {
        console.log(`[SKIP INVALID SLUG] ${relPath} -> empty slug`);
        matchRows.push([cityLabel, relPath, '', 'false', '', r2Key, 'empty slug after parsing']);
        summary.errors++;
        continue;
      }

      detectedSlugs.add(slug);
      detectedSlugCount.set(slug, (detectedSlugCount.get(slug) || 0) + 1);

      const matched = slugToName.has(slug);

      if (matched) {
        const matchedName = slugToName.get(slug);
        matchRows.push([cityLabel, relPath, slug, 'true', matchedName, r2Key, 'matched']);

        if (actuallyUpload) {
          try {
            const webpBuffer = await sharp(path.join(cityPath, file)).webp().toBuffer();
            await s3.send(
              new PutObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: r2Key,
                Body: webpBuffer,
                ContentType: 'image/webp',
              })
            );
            console.log(`[UPLOADED]         ${relPath} -> ${r2Key}`);
            summary.uploaded++;
          } catch (err) {
            console.error(`[ERROR]            ${relPath}: ${err && err.message ? err.message : err}`);
            matchRows.push([cityLabel, relPath, slug, 'true', matchedName, r2Key, `upload error: ${err && err.message ? err.message : err}`]);
            summary.errors++;
          }
        } else {
          console.log(`[DRY-RUN]          ${relPath} -> ${r2Key}`);
          summary.wouldUpload++;
        }
      } else {
        const expectedInSameCity = expectedByCity.get(cityLabel) || [];
        const suggestions = findSuggestions(slug, expectedInSameCity, allExpected, 5);
        const suggestionStr = formatSuggestions(suggestions);
        const reason = 'slug not found in seed JSON';
        matchRows.push([cityLabel, relPath, slug, 'false', '', r2Key, reason]);
        unmatchedRows.push([cityLabel, relPath, slug, suggestionStr, reason]);
        console.log(`[SKIP UNMATCHED]   ${relPath} -> ${r2Key}`);
        if (suggestions.length > 0) {
          console.log(`  suggestions: ${suggestionStr}`);
        } else {
          console.log(`  suggestions: (none)`);
        }
        summary.skippedUnmatched++;
      }
    }
  }

  const missingRows = [];
  for (const rec of allExpected) {
    if (!detectedSlugs.has(rec.slug)) {
      missingRows.push([
        rec.city,
        rec.name,
        rec.slug,
        buildR2Key(rec.slug, 1),
        'no image file generated this slug',
      ]);
    }
  }

  if (isReport) {
    await writeCsv(
      REPORT_PATHS.match,
      ['city', 'image_file', 'detected_slug', 'matched', 'matched_place_name', 'expected_r2_key', 'reason'],
      matchRows
    );
    await writeCsv(
      REPORT_PATHS.unmatched,
      ['city', 'image_file', 'detected_slug', 'suggested_matches', 'reason'],
      unmatchedRows
    );
    await writeCsv(
      REPORT_PATHS.missing,
      ['city', 'place_name', 'expected_slug', 'expected_image_key', 'reason'],
      missingRows
    );
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Mode:                          ${isReport ? 'REPORT' : (actuallyUpload ? 'UPLOAD' : 'DRY-RUN')}`);
  console.log(`Total images scanned:          ${summary.total}`);
  const matchedCount = summary.wouldUpload + summary.uploaded;
  console.log(`Matched:                       ${matchedCount}`);
  if (actuallyUpload) {
    console.log(`  - Uploaded:                  ${summary.uploaded}`);
  } else {
    console.log(`  - Would upload (dry-run):    ${summary.wouldUpload}`);
  }
  console.log(`Unmatched:                     ${summary.skippedUnmatched}`);
  console.log(`Skipped (unsupported file):    ${summary.skippedUnsupported}`);
  console.log(`Errors:                        ${summary.errors}`);
  console.log(`Missing JSON places (no image):${missingRows.length}`);
  if (isReport) {
    console.log(`\nReports written:`);
    console.log(`  - ${REPORT_PATHS.match}`);
    console.log(`  - ${REPORT_PATHS.unmatched}`);
    console.log(`  - ${REPORT_PATHS.missing}`);
  }
  console.log('=== END ===');
}

main().catch((err) => {
  console.error('Fatal error:', err && err.stack ? err.stack : err);
  process.exit(1);
});
