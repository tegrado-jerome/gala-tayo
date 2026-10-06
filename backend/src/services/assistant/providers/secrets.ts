import { getSecret } from "../../../config/keyVault";

const cache = new Map<string, Promise<string | null>>();

/** An API key from an env var, else Key Vault. Null when neither has it, so optional providers can switch off. */
export function optionalSecret(envName: string, secretName: string): Promise<string | null> {
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) return Promise.resolve(fromEnv);
  if (!cache.has(secretName)) {
    const lookup = getSecret(secretName)
      .then((value) => value.trim() || null)
      .catch(() => null);
    cache.set(secretName, lookup);
    // A failed lookup is retried on a later request instead of being cached forever.
    lookup.then((value) => value === null && cache.delete(secretName));
  }
  return cache.get(secretName)!;
}

/** Model ids from an env var (comma separated), else the defaults. Model ids churn, so they stay configurable. */
export function modelList(envName: string, defaults: string[]): string[] {
  const configured = (process.env[envName] ?? "").split(",").map((model) => model.trim()).filter(Boolean);
  return configured.length > 0 ? configured : defaults;
}
