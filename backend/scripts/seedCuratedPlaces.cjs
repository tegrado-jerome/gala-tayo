const { createClient } = require("@supabase/supabase-js");

const curatedPlaces = [
  {
    foursquare_id: "manual-bonifacio-high-street",
    name: "Bonifacio High Street",
    slug: "bonifacio-high-street",
    category: "Hangout",
    address: "BGC, Taguig, Metro Manila",
    city: "Taguig",
    latitude: 14.5509,
    longitude: 121.051,
    rating: 4.6,
    hours: "Open daily; shop and restaurant hours vary",
    photo_url: "/images/places/bonifacio-high-street/bonifacio-high-street-1.webp",
    photos: [
      "/images/places/bonifacio-high-street/bonifacio-high-street-1.webp",
      "/images/places/bonifacio-high-street/bonifacio-high-street-2.webp",
      "/images/places/bonifacio-high-street/bonifacio-high-street-3.webp",
    ],
  },
  {
    foursquare_id: "manual-the-mind-museum",
    name: "The Mind Museum",
    slug: "the-mind-museum",
    category: "Museum",
    address: "BGC, Taguig, Metro Manila",
    city: "Taguig",
    latitude: 14.5528,
    longitude: 121.0442,
    rating: 4.5,
    hours: "Hours vary by schedule",
    photo_url: null,
    photos: null,
  },
  {
    foursquare_id: "manual-market-market",
    name: "Market! Market!",
    slug: "market-market",
    category: "Mall",
    address: "BGC, Taguig, Metro Manila",
    city: "Taguig",
    latitude: 14.5497,
    longitude: 121.0565,
    rating: 4.3,
    hours: "Open daily; store hours vary",
    photo_url: null,
    photos: null,
  },
  {
    foursquare_id: "manual-uptown-mall",
    name: "Uptown Mall",
    slug: "uptown-mall",
    category: "Mall",
    address: "BGC, Taguig, Metro Manila",
    city: "Taguig",
    latitude: 14.5566,
    longitude: 121.0542,
    rating: 4.4,
    hours: "Open daily; store hours vary",
    photo_url: null,
    photos: null,
  },
  {
    foursquare_id: "manual-intramuros",
    name: "Intramuros",
    slug: "intramuros",
    category: "Heritage",
    address: "Manila, Metro Manila",
    city: "Manila",
    latitude: 14.5896,
    longitude: 120.9751,
    rating: 4.5,
    hours: "Open daily; attraction schedules vary",
    photo_url: "/images/places/intramuros/intramuros-1.webp",
    photos: [
      "/images/places/intramuros/intramuros-1.webp",
      "/images/places/intramuros/intramuros-2.webp",
      "/images/places/intramuros/intramuros-3.webp",
    ],
  },
];

async function getKeyVaultSecret(client, secretName) {
  const secret = await client.getSecret(secretName);

  if (!secret.value) {
    throw new Error(`Key Vault secret "${secretName}" has no value.`);
  }

  return secret.value;
}

async function resolveSupabaseCredentials() {
  let supabaseUrl = process.env.SUPABASE_URL;
  let supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const keyVaultUrl = process.env.KEY_VAULT_URL;

  if ((!supabaseUrl || !supabaseServiceRoleKey) && keyVaultUrl) {
    try {
      const { DefaultAzureCredential } = require("@azure/identity");
      const { SecretClient } = require("@azure/keyvault-secrets");
      const credential = new DefaultAzureCredential();
      const client = new SecretClient(keyVaultUrl, credential);

      if (!supabaseUrl) {
        supabaseUrl = await getKeyVaultSecret(client, "supabase-url");
      }

      if (!supabaseServiceRoleKey) {
        supabaseServiceRoleKey = await getKeyVaultSecret(
          client,
          "supabase-service-role-key"
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read Supabase credentials from Key Vault: ${message}`);
    }
  }

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or set KEY_VAULT_URL with secrets \"supabase-url\" and \"supabase-service-role-key\"."
    );
  }

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
  };
}

async function main() {
  const { supabaseUrl, supabaseServiceRoleKey } = await resolveSupabaseCredentials();
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase
    .from("places")
    .upsert(curatedPlaces, { onConflict: "slug" })
    .select("id, name, slug");

  if (error) {
    console.error("Failed to seed curated places:", error);
    process.exit(1);
  }

  console.log(`Seeded ${data.length} curated places:`);
  for (const place of data) {
    console.log(`- ${place.slug} (${place.id})`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Seed failed: ${message}`);
  process.exit(1);
});
