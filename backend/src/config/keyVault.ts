import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";

let client: SecretClient | null = null;

function getKeyVaultClient(): SecretClient {
  if (client) {
    return client;
  }

  const keyVaultUrl = process.env.KEY_VAULT_URL?.trim();

  if (!keyVaultUrl) {
    throw new Error("KEY_VAULT_URL is not configured.");
  }

  const credential = new DefaultAzureCredential();
  client = new SecretClient(keyVaultUrl, credential);

  return client;
}

export async function getSecret(secretName: string): Promise<string> {
  const secret = await getKeyVaultClient().getSecret(secretName);

  if (!secret.value) {
    throw new Error(`Secret ${secretName} has no value.`);
  }

  return secret.value;
}
