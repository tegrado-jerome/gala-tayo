# Database backups and restore

The Supabase free plan has no point-in-time recovery, so `.github/workflows/db-backup.yml` takes our own copy.

## What runs

- Every night at 2:00 AM PH time (or by hand: Actions > DB backup > Run workflow).
- Logs in as `backup_reader` (read-only: `pg_read_all_data` + `BYPASSRLS`, no write rights) through the session pooler.
- Writes three files, tars and gzips them, encrypts with GPG (AES256, symmetric):
  - `schema.sql`: the `public` schema (tables, RLS policies, grants, functions).
  - `data.sql`: all rows in `public`, `auth` and `storage`.
  - `auth-triggers.sql`: our triggers on `auth.users` (`on_auth_user_created`).
- Uploads to the private R2 bucket `galatayo-backups` as `db/<UTC time>.tar.gz.gpg` through the write-only worker
  `infra/cloudflare/backup-sink`. A lifecycle rule deletes objects after 14 days. The bucket has no public URL.

Photos are not in here: they live in the R2 bucket `galatayo-photos`.

## Where the keys are

| What | GitHub secret | Copy you can read |
| --- | --- | --- |
| Encryption passphrase | `BACKUP_PASSPHRASE` | Key Vault `galatayo-kv` / `backup-passphrase` |
| DB connection string | `BACKUP_DATABASE_URL` | Key Vault `galatayo-kv` / `backup-database-url` |
| Upload token | `BACKUP_UPLOAD_TOKEN` | Worker secret `UPLOAD_TOKEN` (write-only; rotate by setting both) |

Without the passphrase the backups can't be opened, so never delete `backup-passphrase` from Key Vault.

## Restore

Needs `npx wrangler` (logged in), `az`, `gpg` and `psql` 17. Restore into a **new** Supabase project first, check it,
then point the app at it (or copy the tables you need back into prod).

1. Pick a backup: `npx wrangler r2 object get galatayo-backups/db/<key> --remote --file backup.tar.gz.gpg`
   (keys are listed in the Cloudflare dashboard, R2 > galatayo-backups).
2. Get the passphrase: `az keyvault secret show --vault-name galatayo-kv -n backup-passphrase --query value -o tsv > pp`
3. Open it: `gpg --batch --pinentry-mode loopback --passphrase-file pp -d backup.tar.gz.gpg | tar -xz` then delete `pp`.
4. Load it with the new project's `postgres` connection string (Dashboard > Connect > Session pooler):

   ```sh
   psql "$NEW_DB_URL" --single-transaction -v ON_ERROR_STOP=1 \
     -f schema.sql -c "SET session_replication_role = replica" -f data.sql -f auth-triggers.sql
   ```

5. In the new project, copy the auth settings (SMTP, redirect URLs, sign-in providers) from the old one, then update
   `supabase-url`, `supabase-anon-key` and `supabase-service-role-key` in Key Vault and the `VITE_SUPABASE_*` secrets.

## Undo / turn off

- Stop backups: delete `.github/workflows/db-backup.yml` (or disable it in Actions).
- Remove the worker: `npx wrangler delete galatayo-backup-sink` (from `infra/cloudflare/backup-sink`).
- Remove the DB role: `drop role backup_reader;` in the SQL editor.
- Remove the bucket (after emptying it): `npx wrangler r2 bucket delete galatayo-backups`.
