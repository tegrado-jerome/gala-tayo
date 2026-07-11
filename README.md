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
