import path from "path";
import { seedGalatayoPlaces } from "../src/seed/galatayoPlacesSeed";

type CliOptions = {
  filePath?: string;
  batchSize?: number;
  dryRun?: boolean;
};

function printUsage() {
  console.log(
    [
      "Usage: npm run seed:places -- [--dry-run] [--batch-size=100] [--file=relative/or/absolute/path.json]",
      "",
      "Examples:",
      "  npm run seed:places",
      "  npm run seed:places -- --dry-run",
      "  npm run seed:places -- --file=seed/galatayo_places_seed_final.json",
    ].join("\n")
  );
}

function parsePositiveInteger(value: string, flagName: string) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer.`);
  }

  return parsed;
}

function getBooleanEnvFlag(value: string | undefined) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "";
}

function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: getBooleanEnvFlag(process.env.npm_config_dry_run),
  };

  if (process.env.npm_config_batch_size?.trim()) {
    options.batchSize = parsePositiveInteger(
      process.env.npm_config_batch_size.trim(),
      "--batch-size"
    );
  }

  if (process.env.npm_config_file?.trim()) {
    options.filePath = path.normalize(process.env.npm_config_file.trim());
  }

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    if (arg.startsWith("--batch-size=")) {
      options.batchSize = parsePositiveInteger(
        arg.slice("--batch-size=".length),
        "--batch-size"
      );
      continue;
    }

    if (arg.startsWith("--file=")) {
      const filePath = arg.slice("--file=".length).trim();

      if (!filePath) {
        throw new Error("--file requires a path.");
      }

      options.filePath = path.normalize(filePath);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const result = await seedGalatayoPlaces(options);

  console.log(
    JSON.stringify(
      {
        message: result.dryRun
          ? "Galatayo places seed dry run completed."
          : "Galatayo places seeding completed.",
        ...result,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown seed failure.";
  console.error(`Seed failed: ${message}`);
  process.exit(1);
});
