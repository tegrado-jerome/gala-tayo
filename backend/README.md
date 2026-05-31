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

## History Place Views

GM-109 uses an upsert so repeated views of the same place update recency instead of creating duplicate rows. Run this SQL in Supabase before testing `POST /api/history/place-view`:

```sql
alter table public.history
add constraint history_user_type_place_unique
unique (user_id, type, place_id);
```

The same SQL is saved in `backend/sql/gm109_history_unique.sql`.

## Place Seed Validation

GM-138 adds a dry-run validator for future place seed/import files. Run it before any large seed import so bad rows are fixed before they reach Supabase.

Build first, then validate a JSON file:

```powershell
npm run build
npm run validate:place-seeds -- ./scripts/samplePlaceSeedData.valid.json
```

If no file path is provided, the validator uses `scripts/samplePlaceSeedData.valid.json`.

Seed JSON should be an array of place records. Each record must include:

- `name`
- `slug`
- `city` or `city_id`
- `address` or `area`
- `latitude`
- `longitude`
- `categories`
- `tags`

Validation errors block import. Common errors include:

- missing or invalid `name`, `slug`, city, coordinates, categories, or tags
- city outside the supported Metro Manila LGUs
- latitude outside `14.0` to `15.2`
- longitude outside `120.5` to `121.5`
- unknown categories or tags
- duplicate slug in the same batch
- invalid URLs, dates, budget values, tag strength/source, or ranking scores

Warnings do not block import, but should be reviewed. Common warnings include:

- missing `source_url`, `last_verified_at`, `verification_status`, or `google_maps_url`
- missing or short `description`
- missing budget fields or ranking signals
- exact or very close coordinates in the same batch
- same name and city in the same batch

Coordinates are required because cards, map pins, sharing, favorites, and directions depend on them. `google_maps_url` is optional because directions can be generated from coordinates:

```txt
https://www.google.com/maps/dir/?api=1&destination={latitude},{longitude}
```

Photos are optional and do not block validation.
