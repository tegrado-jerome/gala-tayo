# GalaTayo Backend

## Current Backend Scope

This backend currently focuses on the live API surface under `src/functions` plus the shared services and utilities that power those routes.

The older place-seeding and bulk-import workflow is no longer part of the active repo shape, so the package scripts and docs have been trimmed to match the code that is still in use.

## History Place Views

GM-109 uses an upsert so repeated views of the same place update recency instead of creating duplicate rows. Run this SQL in Supabase before testing `POST /api/history/place-view`:

```sql
alter table public.history
add constraint history_user_type_place_unique
unique (user_id, type, place_id);
```

The same SQL is saved in `backend/sql/gm109_history_unique.sql`.

## Utility Scripts

The active helper scripts are the ones that support current production data and runtime behavior:

- `npm run backfill:image-urls`
- `npm run backfill:image-urls:write`
- `npm test`
