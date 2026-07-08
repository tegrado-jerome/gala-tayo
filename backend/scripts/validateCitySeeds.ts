import { printValidationSummary, validateCitySeedFiles } from "./seedDataValidation";

function main(): void {
  const result = validateCitySeedFiles();
  printValidationSummary(result);

  if (!result.valid) {
    process.exitCode = 1;
    return;
  }

  console.log("\nValidation passed. Seed files are safe to feed into seedPlaces.ts.");
}

main();
