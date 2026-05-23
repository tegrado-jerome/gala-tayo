import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";

const keyVaultUrl = process.env.KEY_VAULT_URL;

if (!keyVaultUrl) {
  throw new Error("KEY_VAULT_URL is not configured.");
}

const credential = new DefaultAzureCredential();
const client = new SecretClient(keyVaultUrl, credential);

export async function getSecret(secretName: string): Promise<string> {
  const secret = await client.getSecret(secretName);

  if (!secret.value) {
    throw new Error(`Secret ${secretName} has no value.`);
  }

  return secret.value;
}