# Legal checklist: what still needs the owner or a lawyer

Not legal advice. The site pages (/privacy, /terms, /cookies, /copyright, /disclaimer) were written on 2026-10-07 to match what the code does. These items need a decision, a filing or a lawyer's review. Day-to-day procedures live in [../philippines-legal-compliance.md](../philippines-legal-compliance.md).

## Owner must do

1. **NPC registration check.** Birthdate counts as sensitive personal information (RA 10173, Sec. 3(l): "age"). NPC Circular 2022-04 says you must register if you process sensitive personal information of 1,000 or more people. Count users with a birthdate. Once it reaches 1,000, register the DPO and the data processing system at npcregistration.privacy.gov.ph within 20 days.
2. **Appoint a DPO formally.** The policy points to officialgalatayo@gmail.com as the DPO contact. Write a one-page DPO appointment, even if the DPO is you.
3. **Business registration.** If GalaTayo ever earns money (ads, sponsors, affiliate links, paid plans), register first: DTI business name (sole proprietor) or SEC, then BIR and the mayor's permit. Sponsored content must then be labelled, as the Disclaimer promises.
4. **Pick a city for court venue.** Terms say "the proper courts of the Philippines". A lawyer can name one city (usually where the owner lives).
5. **Set the Google Analytics data retention** to 2 months (Admin > Data settings > Data retention) so it matches "kept for the period set in our settings".
6. **Honour the promised response times:** copyright takedowns within 48 hours, privacy requests within 15 days, account deletion within 30 days, breach notice to NPC within 72 hours (NPC Circular 16-03).
7. **Decide whether to ask existing users to agree again.** The backend version stays at `TERMS_VERSION = "2026-07-11"`. Bumping it in `backend/src/functions/profileHelpers.ts` sends every user back through the agreement step. Wording changed a lot, but no new data use was added. A lawyer can say if notice alone is enough.
8. **Photos with no source on file.** `place_images` rows and old `places` image columns have no author or licence data. They now show "source not on file · Request removal". Add `author`, `license` and `source_url` columns, or replace these photos with credited ones.
9. **Social-media photos** (Instagram, Facebook, TikTok) are shown with credit, but credit alone is not a licence under RA 8293. Getting written permission (a DM reply is enough evidence) is the safest path. Remove fast when anyone asks.
10. **Trademark.** A web search found no other "Gala Tayo" brand. File a trademark application at IPOPHL (Classes 9 and 39 or 42) before growing. The logo (arcs and a wave) is original. The mint colour #34E0A1 matches Tripadvisor's brand green. A colour alone is low risk, but don't use it with an owl or eye shapes.
11. **Dead fallback images:** `frontend/src/data/curatedPlaceImages.ts` points to `/images/places/...` files that don't exist, so they never show. Delete the file, or add credits before adding any images there.

## Lawyer should review

- **Minors.** The minimum age is 13. Under 18 needs a parent's or guardian's permission (wording only, no check). Philippine contract law treats under-18s as minors. Ask if 13 is fine, or if it should be 16 or 18, or need real parental consent.
- **Liability cap** of PHP 1,000 and the "as is" wording (Civil Code Art. 1171, and the Consumer Act RA 7394 for any consumer angle).
- **No statutory safe harbour.** The Philippines has no DMCA-style safe harbour. The notice-and-takedown policy is good practice, not a legal shield. Ask about intermediary risk for user posts under RA 10175 (online libel). Disini v. Secretary of Justice (G.R. No. 203335, 2014) limited liability for people who only react to or share a post, not for platforms that moderate.
- **Cross-border transfer** wording (Supabase, Azure, Google, Groq, Cloudflare, Upstash, Brevo, OpenRouter). Check data processing agreements with each.
- **Gemini free tier.** Google may use API content to improve its products. Prompts have emails and phone numbers stripped and carry no account data, but say so in a DPA review or switch to the paid tier.
- **Internet Transactions Act (RA 11967) and DTI e-commerce rules.** These should not apply while nothing is sold. Recheck before any monetisation.

## Sources used

- RA 10173 Data Privacy Act and IRR; NPC Circular 2022-04 (registration); NPC Circular 16-03 (breach, 72 hours); NPC rules of procedure: complainants must write to the controller first and wait 15 days (complaints@privacy.gov.ph).
- RA 8293 IP Code as amended by RA 10372; RA 10175 Cybercrime Prevention Act; RA 7394 Consumer Act.
- Benchmarks: Google and Apple App Store privacy and AI disclosure patterns; Tripadvisor and Airbnb photo credit and report flows.
