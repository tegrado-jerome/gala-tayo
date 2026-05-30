# GalaTayo Backend

## Seed Curated Places

Favorites only reference places that already exist in `public.places`. Before testing saves for curated/static frontend places such as `bonifacio-high-street`, seed those rows into Supabase.

### Option A: Env Vars

```powershell
$env:SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
npm run seed:curated-places
```

### Option B: Azure Key Vault

If your local Azure identity can access the Key Vault, the seed can read:

- `supabase-url`
- `supabase-service-role-key`

```powershell
$env:KEY_VAULT_URL="https://your-key-vault-name.vault.azure.net/"
npm run seed:curated-places
```

You can also combine both options. Env vars are used first, and Key Vault fills in anything missing.

The seed uses `upsert` with `onConflict: "slug"`, so it is safe to run more than once as long as `public.places.slug` has a unique constraint.

Curated rows use `manual-*` values in `foursquare_id` because the current schema requires that column. Real Foursquare-imported places should still use their actual Foursquare IDs.

After seeding, restart the backend and test:

```txt
POST /api/favorites
body: { "placeSlug": "bonifacio-high-street" }
```
