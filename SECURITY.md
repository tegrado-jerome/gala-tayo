# Security Policy

## Supported Deployment

Security fixes are prioritized for the `main` branch and the currently deployed Azure Static Web Apps environment.

## Reporting a Vulnerability

Do not open a public issue for suspected vulnerabilities. Report privately to the repository owner with:

- Affected endpoint, page, or workflow.
- Steps to reproduce.
- Expected and observed impact.
- Any relevant request IDs or timestamps.

## Security Expectations

- Do not commit real `.env`, `local.settings.json`, service-role keys, storage credentials, API keys, or tokens.
- Supabase service-role and storage credentials must stay server-side.
- Public endpoints that mutate user data must validate a Supabase JWT in the handler.
- Admin endpoints must validate both JWT identity and admin role server-side.
- Rate limiting must fail closed in production.
