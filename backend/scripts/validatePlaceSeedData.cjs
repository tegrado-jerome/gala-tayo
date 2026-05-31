const fs = require("fs");
const path = require("path");

const defaultSeedPath = path.join(__dirname, "samplePlaceSeedData.valid.json");
const inputPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : defaultSeedPath;
const validatorPath = path.join(
  __dirname,
  "..",
  "dist",
  "src",
  "utils",
  "placeSeedValidation.js"
);

function readSeedData(filePath) {
  const rawJson = fs.readFileSync(filePath, "utf8");
  return JSON.parse(rawJson);
}

function printIssue(issue) {
  const indexText = issue.index === undefined ? "-" : String(issue.index);
  const fieldText = issue.field || "-";
  console.log(
    `  [index=${indexText}] [field=${fieldText}] ${issue.code}: ${issue.message}`
  );
}

function main() {
  if (!fs.existsSync(validatorPath)) {
    console.error(
      "Place seed validator build output was not found. Run `npm run build` from backend first."
    );
    process.exit(1);
  }

  const { validatePlaceSeedRecords } = require(validatorPath);
  const seedData = readSeedData(inputPath);
  const records = Array.isArray(seedData) ? seedData : seedData.places;
  const totalRecords = Array.isArray(records) ? records.length : 0;
  const result = validatePlaceSeedRecords(records);

  console.log("Place seed validation summary");
  console.log(`File: ${inputPath}`);
  console.log(`Total records: ${totalRecords}`);
  console.log(`Errors: ${result.errors.length}`);
  console.log(`Warnings: ${result.warnings.length}`);
  console.log(`Status: ${result.valid ? "validation passed" : "validation failed"}`);

  if (result.errors.length > 0) {
    console.log("");
    console.log("Errors:");
    result.errors.forEach(printIssue);
  }

  if (result.warnings.length > 0) {
    console.log("");
    console.log("Warnings:");
    result.warnings.forEach(printIssue);
  }

  process.exit(result.errors.length > 0 ? 1 : 0);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Place seed validation failed to run: ${message}`);
  process.exit(1);
}
