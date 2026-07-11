# GalaTayo

GalaTayo is a Manila-focused place discovery and trip-planning app with a React/Vite frontend and Azure Functions backend.

## Active Source

- `frontend/` - public React app, routing, Supabase browser auth, and static web app config.
- `backend/` - Azure Functions API, Supabase admin/server integrations, Ask AI, search, reports, submissions, and admin endpoints.

Recovery, backup, generated report, and scratch trees are not active product source and should stay out of the repository.

## Setup

Install dependencies separately:

```bash
cd backend
npm install

cd ../frontend
npm install
```

Create local env files from the examples:

```bash
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env
```

For Azure Functions local development, keep secrets in `backend/local.settings.json` or local environment variables. Do not commit real env files or service-role keys.

## Validation

Backend:

```bash
cd backend
npm run build
npm test
```

Frontend:

```bash
cd frontend
npm run build
npm run lint -- --quiet
```

`npm run build` for the frontend requires the platform-native Tailwind oxide package to load successfully from `node_modules`.

## Security Notes

- Public email existence checks must not disclose whether an account exists.
- Rate limiting is treated as a critical protection and should not fail open in production.
- Supabase service-role credentials and storage credentials are server-only.
- CSP is defined in `frontend/public/staticwebapp.config.json`; loosen it only for a specific deployment need.

## Deployment Variables

Frontend build variables for Azure Static Web Apps:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SITE_URL`
- `VITE_API_BASE_URL`

Azure Function App settings:

- `FUNCTIONS_WORKER_RUNTIME=node`
- `AzureWebJobsStorage`
- `KEY_VAULT_URL`
- `SITE_URL` or `PUBLIC_SITE_URL` for explicit canonical URLs in SEO endpoints

Azure Key Vault secret names used by the current backend code:

Required backend secrets:

- `supabase-url`
- `supabase-service-role-key`
- `groq-api-key`
- `gemini-api-key`
- `geoapify-api-key`
- `redis-rest-url`
- `redis-rest-token`
- `r2-access-key-id`
- `r2-secret-access-key`

Optional backend secret if the Foursquare feature is active:

- `foursquare-api-key`

Azure Function App settings for R2 and local fallbacks:

- `R2_ENDPOINT_URL`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_BASE_URL`
- `REDIS_REST_URL`
- `REDIS_REST_TOKEN`

Enable the Function App managed identity and grant it permission to read Key Vault secrets before deployment. No production secret values should be stored in the frontend or committed to the repo.
