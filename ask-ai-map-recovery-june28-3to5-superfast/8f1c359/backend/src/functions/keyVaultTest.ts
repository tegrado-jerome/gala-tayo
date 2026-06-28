import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSecret } from "../config/keyVault";

export async function keyVaultTest(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Testing Key Vault connection...");

  try {
    const supabaseUrl = await getSecret("supabase-url");

    return {
      status: 200,
      jsonBody: {
        message: "Key Vault connection successful.",
        supabaseUrlExists: Boolean(supabaseUrl),
      },
    };
  } catch (error) {
    context.error(error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to read from Key Vault.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

app.http("keyVaultTest", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "key-vault-test",
  handler: keyVaultTest,
});