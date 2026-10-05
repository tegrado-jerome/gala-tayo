# GalaTayo "Editorial Picks" — design brief (chosen 2026-10-06)

A travel magazine you can act on. Big photos, serif headlines, trust signals and "know before you go" tips.
Borrowed from Tripadvisor (Where to? search, bubble-style ratings, awards, review highlights, contributor profile),
GetYourGuide (big image cards, key-facts icon list, sticky availability card), Viator ("what to know before you go"),
Headout (image category pills). GalaTayo twist: sun-dot ratings, GalaTayo Pick badge, Taglish microcopy, barkada planning, plan-as-story.

Reference mockups (phone 390px): `C:/Users/tegra/AppData/Local/Temp/claude/D--Personal-Projects-gala-tayo/6b8c4873-c489-4404-a131-f789f8bbf971/scratchpad/directions/five/index.html` (direction 3) and `.../five/src/d3.mjs` (exact CSS + markup).

## Tokens (already in `frontend/src/design/gt1.css`)
- Page white `#FFFFFF`; panels sand `#F6F1E7`; ink `#111111` (text and main buttons); muted `#595959`; lines `#E8E8E8`.
- Mint `#34E0A1` = fills only (badges, active dots, rating dots fill on dark); forest `#00553A` = links, prices, mint-on-white text; clay `#A5391B` = crowd/busy warnings.
- Main action = black pill with white text (one per screen). Secondary = outline pill or sand.
- Fonts: Fraunces 500/600 for page titles, section headers, numbers in stat rows (`g-d1 g-h1 g-h2`, `.font-display`); DM Sans for everything else (body, labels, buttons, card titles).
- Radii: full-bleed photos 0, cards/photos 12, pills 999. Section gap 24–28px, 16px gutter.
- Icons: Phosphor `light` for editorial UI, `fill` for active nav, badges.
- Motion: slow 300ms fades; no bouncy effects.

## Components
- Search: "Where to?" 52px pill, 1px #CFCFCF border, soft shadow.
- Tabs: text tabs with 2px ink underline (Things to do · Food · Guides).
- Mood pills: sand pill with a 32px round photo + label (Heritage, Museums, Sunsets, Food…).
- Editor's pick hero: 16px-radius full photo card, dark gradient, uppercase kicker, serif headline.
- Place card: photo 12px radius (220×240 in rails, full-width 200px tall in lists), white heart top-right, badge top-left, then kicker (category · area, uppercase 12px muted), bold 15–17px name, sun dots + review count (only if real reviews), duration · fee (fee in forest).
- Sun dots: 5 small circles, forest outline, filled = rating. Only shown when the place has ≥3 ratings (existing rule).
- GalaTayo Pick badge: mint pill with medal icon "GalaTayo Pick" for places with gala score ≥ 80 (from scoring; never invented).
- Busy/crowd card: sand panel, clay icon, "Likely busy …" — only derived from real best_time/crowd fields.
- Know before you go: sand panel list of real tips (parking, commute, dress, budget note). No invented "last checked" dates.
- Bottom nav: white, hairline top border, 5 tabs (Explore, Search, centre "+" black circle = new plan/ask, Plans, Me); active = fill icon + 4px forest dot.

## Section orders
- Home: serif headline "Saan ang gala this weekend?" → Where to? search → tabs → mood pills → Editor's pick hero → GalaTayo Picks rail → Likely busy card (if data) → Guides 2-up → "Saan tayo?" dark CTA card → (Explore the Philippines destinations rail) → bottom nav.
- List/category/area/search: serif title → icon category tabs → count + sort + List/Map segmented toggle → big image cards (full width).
- Place: photo grid (1 big + 2, All photos) → breadcrumb → serif title → sun dots + badge → About → key facts list (duration, best time, fee, commute) → Why it's gala-worthy (mint bullets) → Know before you go → map → reviews (highlights chips + cards) → You might also like → FAQ → sticky bar "From ₱X · Best: …" + black "Add to plan".
- Plan: cover photo header with plan name → RSVP strip → day cards (time serif, photo, note, votes/comments) → budget split (per head · total · paid) → share as story.
- Me: centered profile header (serif name, "Contributor since") → counts row (serif numbers) → badges → your trips grid → saved lists.

## Rules
- Keep ALL data, behaviour, routes, SEO, analytics, accessibility. Real data only — no fake ratings, counts, awards, crowd numbers or dates.
- Phone first (390px), then 1440. AA contrast. Tap targets ≥ 44px. No horizontal scroll.
- Minimal: remove clutter; one main action per screen.
- Verify with a production build (`npm run build` + `npx vite preview`) — CSS layer order once broke prod. tsc/eslint/build clean.
