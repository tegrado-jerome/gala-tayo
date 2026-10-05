# GalaTayo v3 — Full UI/UX Restructure Plan

Date: 2026-10-05. Status: PLAN (nothing built yet).

Goal: throw away every existing page, component, token, font, colour and state. Rebuild the whole app by copying the design DNA of famous platforms (exact fonts, colours, radii, motion, UX flows), then add features that give GalaTayo more edge than those platforms.

Benchmark gallery (real screenshots, desktop 1440 + mobile 390, with tokens read live from each site's CSS):
`D:\Personal Projects\gala-tayo-benchmarks\index.html`

---

## 1. What each platform gives us (verified values)

| Platform | Why it matters to GalaTayo | Exact DNA to copy (read from live CSS) |
|---|---|---|
| **Partiful** | Group events, RSVP, polls, invite links. Closest to "barkada plan". | Headline font TWK Lausanne (paid) 112px / weight 825 / letter-spacing -3.36px / line-height 0.8. Radii 12px cards, 4px, 960px pills. Pure black text on white, 5% black fills. Dark immersive event pages, blurred poster art, bottom tab bar (home / + / globe / profile). |
| **Luma** | Event discovery by city, event page layout, clean timeline. | System font (-apple-system / Inter), h1 28px/600. Text #151515, muted rgba(21,21,21,.36). Accent pink #F31A7C. Radii 8px, 24px, pills 100px. Motion 0.3s cubic-bezier(0.4,0,0.2,1). Glass pills rgba(255,255,255,.8). Date-grouped timeline with dotted spine. |
| **Airbnb** | Place discovery, card grid, split list+map, filter chips, pill search. | Font Airbnb Cereal VF (paid). Text #222222, muted #6C6C6C, lines #DDDDDD, fills #F7F7F7. Accent #FF385C. Radii tokens 4/8/12/16/20/24/28/32. Elevation: 0 6px 16px rgba(0,0,0,.12), 0 8px 28px rgba(0,0,0,.28). Motion 250–300ms cubic-bezier(0.2,0,0,1), spring ~450ms. |
| **Wanderlog** | Itinerary builder, day timeline, numbered map pins, "optimize route". | Font Source Sans 3 (free). h1 48px/700/-1.44px. Brand #F75940, indigo #3F52E3, grays #212529 / #6C757D / #F3F4F5. Radii 16px cards, 9999px pills, 32px. Motion 0.2–0.25s ease-in-out. Max width 1280px. |
| **Polarsteps** | Trip recap, map route with photo pins, "relive the trip". | Hero over full-bleed photo, white pill CTA, rounded geometric sans. Map with dotted route + circular photo markers. |
| **Headout** | Experiences discovery, mobile bottom nav (Explore / Categories / Account). | Font Halyard (paid). Text #444444, muted #666666. Accent #E5006E. Radii 8px, 12px. Motion 0.3s ease, 0.3s cubic-bezier(0.7,0,0.3,1). Full-width search field over hero media. |
| **Hopper** | Playful travel, pill-everything, soft blue. | Font Proxima Nova (paid). Text #111111, accent #1878EC, coral #FA6866. Radii 1000px pills, 12px. Motion 0.2s cubic-bezier(0.17,0.84,0.44,1). Spacing scale 2/4/8/12/16/20/24/32/40/48/64/80. |
| **Duolingo** | Passport / streaks / badges / gamified check-ins. | Font duolingo-sans (rounded, paid). Text #3C3C3C, muted #777777. Green #58CC02, blue secondary text. Buttons: uppercase, tracked, 16px radius, 4px darker bottom border (3D press). |
| **Strava** | Activity feed, stats tiles, kudos. | Font Boathouse (paid). Orange #FC4C01, text #000 / #43423F, fills rgba(0,0,0,.05). Radii 15px, 60px, 7.5px. Motion 0.15s ease. |
| **Splitwise** | Budget / split bill. | Lato + Montserrat (free). Teal #1CC29F, purple #8656CD, orange #F67240, text #373B3F. Radius 5px. Balance rows "you owe / you are owed". |
| **Pinterest** | Image-first masonry, category tiles with text over image. | Font Pin Sans (paid). Text #211922, link #2B48D4, red #E60023. Radii 16px, 32px. Motion 85ms ease-out hover, springs for spatial. Easings ease-out cubic-bezier(.05,.7,.1,1), ease-in-out cubic-bezier(.8,0,.2,1). |
| **Linear / Notion** | Craft benchmark: tight type, calm surfaces, snappy motion. | Linear: Inter Variable, h1 64px/510/-1.4px, dark #08090A, text #F7F8F8 / #8A8F98. Radii 9999 / 8 / 12px. Motion 0.16s cubic-bezier(0.25,0.46,0.45,0.94), 0.7s cubic-bezier(0.32,0.72,0,1). Notion: 8px radii, grays #F9F9F8 → #191918, 0.2s ease-in. |

Blocked by headless capture (will use app-store / press screenshots in round 2): Klook, TripAdvisor, GetYourGuide, AllTrails, Foodpanda.

### Free font substitutes (paid fonts cannot ship)

| Paid original | Free near-identical | Source |
|---|---|---|
| Airbnb Cereal | Plus Jakarta Sans or Figtree | Google Fonts |
| TWK Lausanne (Partiful) | Switzer or Instrument Sans | Fontshare / Google |
| duolingo-sans | Nunito (800–900) | Google Fonts |
| Halyard (Headout) | Hanken Grotesk | Google Fonts |
| Proxima Nova (Hopper) | Figtree or Mona Sans | Google / GitHub |
| Boathouse (Strava) | Sora or Manrope | Google Fonts |
| Pin Sans | Inter Tight | Google Fonts |
| Berkeley Mono (Linear) | JetBrains Mono or Geist Mono | Free |
| Source Sans 3, Inter, Lato, Montserrat | already free | Google Fonts |

---

## 2. Five design directions (each is one complete design system)

"5 designs per page" = every page rendered once in each direction. All 5 are coherent systems copied from a platform family, not random variants.

| # | Name | Copied from | Type | Colour | Shape | Motion | Feel |
|---|---|---|---|---|---|---|---|
| A | **Party** | Partiful + Luma | Switzer 800, -3% tracking, giant headlines | Black/white + GalaTayo accent, dark immersive plan pages | 12px cards, 960px pills | 0.3s cubic-bezier(.4,0,.2,1) | Fun, social, nightlife |
| B | **Host** | Airbnb + Headout | Plus Jakarta Sans 500/700 | #222 / #6C6C6C / #F7F7F7 + one hot accent | 4/8/12/16/32 radius scale, elevation shadows | 250ms cubic-bezier(.2,0,0,1) + springs | Trustworthy marketplace |
| C | **Planner** | Wanderlog + Polarsteps | Source Sans 3 700 | Coral brand + indigo, light grays | 16px cards, 9999px pills | 0.2s ease-in-out | Map-first, itinerary |
| D | **Quest** | Duolingo + Strava + Swarm | Nunito 800–900, uppercase tracked buttons | Saturated green/orange, chunky | 16px, 3D pressed buttons | 0.15s ease, bouncy | Gamified, streaks |
| E | **Studio** | Linear + Notion + Pinterest | Inter Tight 510/600, -1.4px | Near-black or paper white, hairline borders, mono metadata | 8/12px, 9999 pills | 0.16s cubic-bezier(.25,.46,.45,.94) | Premium, quiet, fast |

Recommendation: build round 1 for all 5. Expect the winner to be a blend (likely A for Gala Plans, B for Explore, D for Passport). Round 2 locks one system and re-renders every page 5 ways *within* it.

---

## 3. New information architecture (restructured, every page)

Current app has ~45 routes spread over 50 page files. New structure collapses them into 7 top-level areas and ~24 page templates. Each template is designed 5 ways.

### Global components (all new)
1. Desktop header (search-pill centre, Airbnb style) and mobile bottom tab bar (Partiful style: Home / Explore / + / Plans / Me)
2. Buttons (primary, secondary, ghost, destructive, icon, pill) with hover/press/focus/loading/disabled
3. Inputs, selects, date & time pickers, chips, toggles, segmented controls
4. Place card, event/plan card, person row, poll row, expense row
5. Sheets and modals (bottom sheet on mobile, centred on desktop)
6. Toasts, banners, cookie consent, empty states, error states, skeletons
7. Map (pins, clusters, numbered route, selected card)
8. AI composer (chat input + suggestion chips + streaming reply)
9. Avatars, avatar stacks, badges, progress rings, streak flame
10. Tabs, breadcrumbs, pagination, section headers, footers

### Pages (24 templates)

**Entry**
1. Welcome / landing (new: hero + live "plans happening this weekend")
2. Auth (login, signup, forgot, reset, MFA, callback → one template, 5 states)
3. Onboarding (3-step: who you gala with, what you like, where you are)

**Explore**
4. Home (for you: weather-aware picks, your next plan, friends' plans, passport streak)
5. Explore / Search (merges Places index, Categories, Areas, Search hub, Search, SEO landing → one page with filter chips and list+map split)
6. Category / City listing (one template, Airbnb grid + map)
7. Place detail (gallery, Sulit meter, best time, barkada-fit score, add to plan, check in)

**Plan (the core)**
8. Plans list (upcoming / past / invited)
9. Create plan (new flow: name → date poll or fixed date → places → invite)
10. Plan detail (hero poster, RSVP, polls, itinerary timeline, budget, chat)
11. Public plan / invite link (no login needed to RSVP, Partiful's killer feature)
12. Itinerary builder (Wanderlog: day timeline + numbered map + commute legs)
13. Budget / Hatian (Splitwise: who paid, who owes, settle via GCash/Maya link)

**AI**
14. Plan with AI (merges Ask AI overview, AI Map, Prompt builder → one composer that outputs a draft plan on a map)

**Passport**
15. Passport home (map of check-ins, streak, badges per city)
16. Badge / city detail
17. Check-in moment (full-screen confirm, share card)

**Me**
18. Profile (own) and public profile (one template, 2 states)
19. Saved (favorites + history merged, tabs)
20. Settings (account, privacy, password, data → one page with sections)
21. Submit a place + my submissions (one template)

**Support**
22. About / Feedback / Reports (one content template)
23. Legal (privacy, terms, cookies)
24. 404 / offline / maintenance

**Admin** (not redesigned in round 1; reskinned with the same tokens in round 3)

Dropped as standalone pages: History, Ask AI overview, AI Map, Prompt builder, Search hub, Profile search (becomes a search filter), Privacy center, Change password, Area/Category/Index separate pages.

---

## 4. Features: remove, keep, add (the edge)

**Remove / merge**
- Three separate AI entry points → one
- Six discovery pages → one Explore
- Floating chat bubble → AI lives inside Plan, not floating over every page
- Tap Gala Pin game → folded into Passport check-in moment

**Keep (already differentiators)**
- Rain-aware picks (Open-Meteo), Sulit meter, Pasyal Passport, Manila-only depth

**Add (none of the benchmarked platforms do these together)**
1. **Tara? link** — one share link; friends RSVP, vote and see the plan without an account (Partiful) but with places and a map (Wanderlog).
2. **Date + place polls** in one card — "Sat or Sun?" and "BGC or Poblacion?" decided in the same thread.
3. **Hatian** — split bill per place or per plan, settle with GCash / Maya deep links. Splitwise has no PH rails.
4. **Nasaan ka na?** — live ETA sharing on gala day for plan members only, auto-off after the plan ends.
5. **Commute legs** — itinerary shows jeep / MRT / Grab estimate between stops, not just driving.
6. **Barkada-fit score** on every place: group size, budget per head, noise, "pwede ba mag-tambay".
7. **Plan recap** — after the gala: photos, check-ins, who paid, streaks earned; one shareable card (Polarsteps + Strava).
8. **Streaks per barkada**, not just per person (Duolingo's streak, applied to a group).
9. **Weekend radar** — Home shows public plans and events near you this weekend (Luma city page) plus weather.
10. **Offline plan card** — the plan detail works with no signal (Manila basements and provinces).

---

## 5. Delivery plan

| Round | Output | How you review |
|---|---|---|
| 1 (next) | Design system sheet for A–E (type scale, colours, radii, shadows, motion, all button/input states) + 24 templates × 5 directions as rendered PNGs (desktop + mobile), opened locally in a gallery | Pick a direction or a blend per area |
| 2 | Locked system; every template re-rendered 5 ways inside the chosen system; all states (hover, press, focus, loading, empty, error, disabled) | Pick one per template |
| 3 | Build: new `frontend/src/design/` tokens, new components, new pages; old files deleted, not restyled. Admin reskinned last | Staging link, then PR to main |

Rules for the build
- Zero reuse of current CSS, components, fonts, colours or copy tone. New folder, old folder deleted.
- Tokens are CSS variables with the exact benchmarked values (easing curves, durations, radii, shadows).
- Fonts only from the free-substitute table.
- Every component ships with every state before any page is assembled.
