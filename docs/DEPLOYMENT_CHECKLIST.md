# Deployment Checklist

Run these checks before public deployment:

- `git status --short` has only intentional changes.
- `backend/.env.example` and `frontend/.env.example` contain placeholders only.
- `cd backend && npm run validate` passes.
- `cd frontend && npm run validate` passes in a clean dependency install.
- Azure Static Web Apps secrets are configured in GitHub Actions.
- Azure Key Vault contains required backend secrets.
- Supabase RLS policies and server-side admin checks are reviewed for mutating endpoints.
- Static security headers in `frontend/public/staticwebapp.config.json` match the production domain needs.
- Recovery, backup, generated report, and scratch trees are not tracked in the public repository.
