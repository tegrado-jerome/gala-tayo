# GalaTayo "travel app" UI — brief for every page

Goal: every page uses components people know from big travel apps (Airbnb, Tripadvisor, Klook, Booking, Wanderlog, Polarsteps, Google Travel), with GalaTayo's own twist so nothing is a copy. No leftovers of the old UI (overlay-caption mosaics, plain text "Loading…", bare grey boxes, old pills used as tabs, emoji icons).

## Already built (reuse, don't restyle)
- Home + guest landing: `components/home/HomeDiscover.tsx` (search pill `.g-hsearch`, icon tabs `.g-cats/.g-cat`, photo rails `Rail` + `PhotoCard`).
- Listing card: square photo, heart top-right, then name / meta / `₱X/head` below (`PhotoCard`, `MasonryCard`, grid `.g-cat-grid`).
- Icon tabs for categories: `components/discover/CategoryTabs.tsx`.
- Pagination: `components/CompactPagination.tsx` (round buttons, spinner).
- Bottom tab bar with coral "+" centre: `components/navigation/MobileBottomNav.tsx`.
- Kit: `components/ui/index.tsx` (Button, Sheet, Chip, Tag, Empty, Skeleton, SectionHead, Page…), map `components/ui/GtMap.tsx` (full-colour OSM).

## System
- Colours (tokens in `frontend/src/design/gt1.css`): white surfaces, navy `--ink` #0f2138, coral `--tara` #ff6b4a with navy text for the ONE main action per screen, coral as text `--tara-ink`, teal `--sea` for "open / going / verified". Mist `--fill` for inputs and soft blocks.
- Fonts: Sora headings (`g-d1 g-h1 g-h2 g-h3`), Plus Jakarta Sans body.
- Icons: Phosphor only (`@phosphor-icons/react/dist/csr/<Name>`). Regular for UI, `duotone` for feature/category icons, `fill` for active/selected states. Never lucide, never emoji as icons.
- Radii 12 / 18 / 26, pills 999. Soft shadows only on floating things (search pill, sheets, sticky bars).
- Mobile first (360–430px), then 768 and 1440. 16px side gutter, tap targets ≥ 44px, no horizontal page scroll.

## Patterns to borrow (pick what fits the page)
- Airbnb: photo gallery (phone: swipeable full-width photo with "1 / 5" counter; desktop: 1 big + 4 small grid with "Show all photos"), sticky bottom bar with price + main button, "What this place offers" icon list, "Where you'll be" map, wishlists grid, account page as a list of large rows, auth as a single email-first sheet.
- Tripadvisor: rating as 5 small filled circles + count, review cards with avatar, date and "helpful", "Good to know" facts block, rank badge ("#3 of 74 activities in Makati").
- Klook / Booking: key facts row with icons (hours, price, how to get there), clear section anchors / tabs on long pages.
- Wanderlog / Polarsteps: itinerary as a vertical timeline with numbered stops, travel time between stops, trip cover with stats (stops, km, ₱ each), passport-style stats.

## GalaTayo twist (use these, they make it ours)
- Taglish microcopy where natural ("Tara!", "Sulit", "Hatian", "Kain muna"), never forced.
- "Sulit" value tag and ₱ per head instead of $/night.
- Barkada-first: RSVP avatars, "who's going", split the bill.
- Coral "+" / sparkle for AI (Tara) entry points.
- Weather awareness (rainy → indoor picks).

## Rules
- Keep ALL existing data, behaviour, routes, SEO tags, analytics and accessibility. Change presentation, not logic.
- Do not edit shared files (`components/ui/index.tsx`, `design/gt1.css`, `HomeDiscover.tsx`, `CategoryTabs.tsx`, `CompactPagination.tsx`, navigation). If you need new CSS, create `frontend/src/design/<your-group>.css` and import it from your page/component. If you truly need a shared change, describe it in your report instead.
- No new npm dependencies.
- Facts must be real (from data/API). No invented ratings, counts or reviews.
- Verify: dev server http://localhost:5199 (already running; proxy `/api/*` to `https://galatayo-api-cvawfwgrg6akdmem.southeastasia-01.azurewebsites.net` in Playwright like `scratchpad/bench/lists.mjs`), screenshots at 390 and 1440, no page errors, no horizontal scroll. `npx tsc -p tsconfig.app.json --noEmit` and `npx eslint src --quiet` must pass (run in `frontend/`).
- Don't commit. Edit only your files. Avoid many parallel browser contexts (auth refresh rate limit).
