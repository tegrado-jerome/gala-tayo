# Philippines Legal Compliance Operations

This document supports GalaTayo as a public free app for users primarily in the Philippines. It is an engineering and operations checklist, not legal advice.

## Data Inventory

| Category | Purpose | Storage/Processor | Retention Default |
| --- | --- | --- | --- |
| Account identity and email | Authentication, account support, security | Supabase Auth, `users` | Until deletion request is completed or retention is required |
| Profile data | Public profile, search, community features | Supabase tables, Cloudflare R2 for avatars | Until user edits/deletes or deletion request is completed |
| Policy acceptance records | Consent/accountability audit | `user_policy_acceptances`, `users` policy columns | Retain while account exists and as needed for legal defense |
| Favorites, history, gala plans | App functionality and user continuity | Supabase tables, browser storage cache | Until user deletes or account deletion workflow runs |
| Comments, reviews, reports | Community features, moderation, abuse prevention | Supabase tables, admin audit tables | Public content may be hidden/anonymized; moderation evidence may be retained |
| Place submissions and photos | Place discovery and community contribution | Supabase, Cloudflare R2 | Until rejected, removed, replaced, or deletion/rights review completes |
| GalaTayo AI prompts and usage | AI responses, rate limits, troubleshooting | Backend providers, Supabase/Redis usage records | Keep minimum needed for operation, abuse prevention, and debugging |
| Technical logs and analytics | Security, reliability, product metrics | Azure, GA4 if enabled, Redis | Follow provider retention settings and minimize personal data |

## Privacy Request SOP

- Users can submit privacy requests from Account Settings or email `officialgalatayo@gmail.com`.
- Supported requests: access, correction, deletion, blocking, objection, portability, and withdrawal of consent.
- Verify requester identity before releasing, changing, or deleting personal data.
- Mark requests as `pending`, `in_review`, `resolved`, `rejected`, or `cancelled`.
- Record admin notes only when necessary. Do not include passwords, tokens, private documents, or unnecessary sensitive data.
- If a request cannot be completed because records must be retained for security, anti-abuse, moderation, copyright, or legal reasons, explain the retained category at a high level.

## Account Deletion SOP

- Treat account deletion as a reviewed request, not an instant destructive action.
- On approval, delete or detach non-required personal fields, private plans, favorites, history, onboarding drafts, and owned avatar objects where supported by schema.
- For public comments, reports, reviews, and moderation history, prefer soft deletion or anonymization when evidence must be retained.
- Preserve minimum records needed for legal defense, abuse prevention, copyright/rights review, and security investigations.
- Confirm completion to the user after the deletion workflow is finished.

## Breach Response Runbook

- Start an incident log immediately when a suspected personal data breach is discovered.
- Identify affected systems, data categories, user count, exposure window, containment steps, and likely risk of harm.
- Contain access first: rotate exposed secrets, disable affected keys, block abusive traffic, and preserve evidence.
- If notification is required, prepare National Privacy Commission and affected data-subject notice within 72 hours from knowledge of the breach.
- Notices should summarize what happened, affected data, possible consequences, containment actions, and contact information.
- After closure, add prevention tasks and update this document if the incident reveals a missing control.

## Moderation And Takedown SOP

- Accept reports through in-app reporting and `officialgalatayo@gmail.com`.
- Prioritize in this order: safety-sensitive content, privacy-invasive content, illegal content, defamation/harassment, copyright/image claims, incorrect place information, spam.
- Ask reporters to provide the URL, content type, reason, supporting details, and contact information when appropriate.
- Hide or restrict clearly harmful content while reviewing when user safety or rights risk is credible.
- Preserve enough evidence for accountability, but avoid spreading harmful content in admin notes.
- Record final action and reason in moderation or admin audit logs.

## Image Provenance Checklist

- Seeded or curated place images must have a known source, license/permission basis, and date reviewed.
- User-uploaded photos require uploader confirmation that they own or have permission to upload the image.
- Remove or replace images when a rights owner provides a credible claim.
- Avoid using images that show private individuals in sensitive contexts unless there is a clear lawful basis.
- Keep third-party images distinguishable from user-uploaded images in storage metadata where possible.

## Deployment Notes

- Run `backend/sql/legal_compliance_requests.sql` in Supabase before enabling the new privacy request UI in production.
- Confirm RLS policies match the production access model. Backend admin endpoints use the service-role client and admin-role checks.
- Increment `TERMS_VERSION` and `PRIVACY_VERSION` in `backend/src/functions/profileHelpers.ts` whenever legal text materially changes so future acceptances record the current versions.
- Existing users with a prior agreement are not routed back through onboarding after version increments.

## Reference Links

- National Privacy Commission data subject rights: https://privacy.gov.ph/data-subject-rights/
- NPC breach reporting: https://privacy.gov.ph/pips-and-pics/breach-reporting/
- NPC registration guidance: https://privacy.gov.ph/pips-and-pics/register/
- Data Privacy Act IRR: https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/
- Cybercrime Prevention Act: https://cybercrime.doj.gov.ph/republic-act-no-10175-cybercrime-prevention-act-of-2012/
- E-Commerce Act: https://boi.gov.ph/r-a-8792-electronic-commerce-act-of-2000/
- Internet Transactions Act: https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/96902
- IPOPHL copyright guidance: https://www.ipophil.gov.ph/copyright/
