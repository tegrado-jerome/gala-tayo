# GalaTayo growth and business plan

Written 2026-10-06. Covers the next 90 days (to early January 2027) and the Holy Week 2027 window after it.
It sits alongside two pieces of work on `feat/seo-data-engine`: the keyword map (`frontend/scripts/seo/data/keywords.json`) and the caption kit (`docs/marketing-kit.md`). This plan does not repeat them. It says which keywords and channels matter and why, and leaves the long lists to those files.

Every number below is either measured (the source is named) or an **estimate** (the method is named).

---

## 0. Where we are today (measured)

| Signal | Value | Source |
|---|---|---|
| Google impressions, 28 days | 486 | Search Console via weekly report, issue #42 (2026-09-05 to 10-03) |
| Google clicks, 28 days | 2 (CTR 0.4%, avg position 8.8) | same |
| Branded query "gala tayo" | 26 impressions, position 8.2 | same |
| GA4 sessions, 28 days | 9 (Direct 4, Unassigned 4, Organic 1) | same. GA4 only counts people who accept cookies, so it undercounts |
| Indexable URLs in sitemap | 283 place pages, 53 area pages, 28 guides, plus /saan-tayo, /today, /about | live `sitemap.xml`, 2026-10-06 |
| Backlinks | none known | memory note 2026-10-05; Bing and Common Crawl had 0 pages |
| Lab speed (Lighthouse 12, mobile) | home LCP 7.4 s, guide 3.2 s, place 7.5 s (devtools throttling) | local run 2026-10-06, section 0.1 |
| Domain age | registered 2026-07-18 (about 11 weeks) | registrar |

**What this says:** Google is starting to trust the site (average position 8.8 is page 1), but many of the top pages in the report are malls, arcades and chain restaurants that don't meet the gala-worthy bar (for example, Tom's World SM City Caloocan has 20 of the 486 impressions). The new, curated, nationwide set has barely been seen. Distribution is close to zero. The product is far ahead of its audience.

### 0.1 Speed

PageSpeed Insights' keyless quota was used up on 2026-10-06, so these are local Lighthouse 12 runs (mobile preset). Simulated throttling overstates LCP on this site. Earlier tests found devtools throttling gives LCP of 2.2 to 2.5 s ([memory: seo-indexing-status]).

| Page | Throttling | Perf | LCP | FCP | TBT | CLS | SEO / A11y / BP |
|---|---|---|---|---|---|---|---|
| `/` (home) | devtools | 61 | 7.4 s | 3.2 s | 190 ms | 0 | 100 / 100 / 100 |
| `/` (home) | simulated | 69 | 7.2 s | 3.3 s | 30 ms | 0 | 100 / 100 / 100 |
| `/guides/things-to-do-in-baguio` | devtools | 73 | 3.2 s | 3.2 s | 400 ms | 0.052 | 100 / 100 / 100 |
| `/guides/things-to-do-in-baguio` | simulated | 72 | 5.2 s | 3.2 s | 60 ms | 0 | 100 / 100 / 100 |
| `/places/baguio/burnham-park-baguio` | devtools | 57 | 7.5 s | 2.8 s | 380 ms | 0.004 | not run |

These are single runs, so expect some noise. Even so, **home and place pages have slipped** from the 2.2 to 2.5 s LCP measured earlier with the same method. On home, the LCP element is the hero `<img>` served through `media.galatayo.app/cdn-cgi/image/width=1280…`, the Cloudflare resize switched on 2026-10-06. Likely causes are the first resize of each image (cold cache) or the 1280 px hero going to a phone. This needs a fix in the first 30 days (section 9), because Google uses Core Web Vitals in ranking and a 7 s hero hurts invite-link first impressions. SEO, accessibility and best practices are all 100. The main bottleneck is still distribution.

---

## 1. Positioning

**Category we own:** the place a Filipino group chat goes to decide *where to go*. It is not a booking site, not a review site and not a map.

**Positioning statement.** For barkadas, couples and families in the Philippines who waste days in the GC asking "saan tayo?", GalaTayo is a free planner with only gala-worthy places. Every place has a peso budget, real tips and live weather, and the group can vote, swipe and split the bill in one link. Google Maps lists everything and Klook sells tours. GalaTayo just tells you where is actually worth going, then helps the group agree.

**Proof points (all real and live):** curated list (53 places hidden on 2026-10-06 for not being truly gala-worthy), budget per head on every place, Did you know / What to do / safety extras, live weather on places and plan days, Kailan date poll, swipe deck, hatian, Plan with AI, story cards, Gala Wrapped, shareable lists.

### One-line pitch options

| # | Line | Best for |
|---|---|---|
| 1 | **"Saan tayo?" Sorted.** Only gala-worthy spots, plus a plan your barkada can vote on. | Home hero, TikTok bio |
| 2 | Stop the GC debate. One link, everyone votes, tara na. | Plan invite preview, FB groups |
| 3 | The Philippines, minus the tourist traps. Only places worth the trip, with the peso cost up front. | Foreign tourists, balikbayans, SEO meta |
| 4 | Every spot here passed one test: would your barkada actually plan a day around it? | About page, press pitch |
| 5 | Plan the gala in 2 minutes, hatian included. | Students, Plan with AI ads |

Recommendation: lead with **#1** (it uses the brand phrase people already search) and **#2** for anything shared in group chats.

**Brand-term finding:** Google autocomplete for "gala tayo" (gl=ph, en and tl) is all translation intent: "gala tayo in english", "gala tayo meaning", "gala tayo in bisaya / ilonggo / ilocano / bicol", "gala tayo bukas". People type our name as a phrase every day. A short `/gala-tayo-meaning` answer page ("Gala tayo means 'let's go out!'…" plus regional versions, linking to the planner) catches that demand and makes the brand the answer. See experiment E3.

---

## 2. Audience segments and jobs-to-be-done

| Segment | Job to be done ("When…, I want…, so I can…") | Main trigger | What wins them | Product hooks |
|---|---|---|---|---|
| **Barkada (18 to 30)**, core | When the GC says "gala tayo!" and nobody decides, I want a short list of good options and a quick vote, so we actually go this weekend. | Payday, long weekends, birthdays | Speed to a decision; fair hatian | Plan invite, Kailan poll, swipe deck, hatian, story cards |
| **Couples** | When I need a date idea that isn't the mall again, I want something special nearby with a clear budget, so the date feels planned. | Weekends, monthsary, Feb 14 | "Date spots in X" lists with peso cost | Date guides, lists, Plan with AI |
| **Families** | When the whole family is free on a holiday, I want a safe, kid-friendly, not-too-far place with parking and food, so nobody complains. | Holidays, Undas, Christmas, summer | Safety notes, budget per head, weather | Family guides, weather, plan days |
| **Students** | When sembreak or a free Saturday hits, I want cheap spots the org or block can go to, so we can hang out on a student budget. | Sembreak (Oct and Jan to Feb peaks), post-exams | Budget filter, hatian, group voting | Polls, hatian, Wrapped (bragging) |
| **Foreign tourists** | When I'm planning the Philippines, I want trusted, non-touristy picks with real costs and access info, so I don't waste a day. | Trip planning 1 to 3 months ahead | English-first pages, honest access rules, AI answers | Destination guides (El Nido, Siargao, Coron…), Plan with AI |
| **Balikbayans / OFWs** | When I'm home for a few weeks, I want what's new and worth it, so I can plan family outings fast. | December, Holy Week, summer homecoming | "What's new / trending" plus family plans | Lists, plan invites to family GC, weather |

**Priority order:** barkada → couples → students → families → foreign tourists → balikbayans. Barkada and students carry the viral loops. Couples and foreign tourists carry SEO volume. Families and balikbayans peak in December, which is our first big window.

---

## 3. Competitor gap map

| Product | What it does well | What it lacks for our job | Gap GalaTayo owns |
|---|---|---|---|
| Google Maps | Every place, reviews, routes, saved lists | No curation (lists everything, including the 168 Mall kind); no group decision | Curated plus group vote |
| Tripadvisor | Global reviews, "Things to do" SEO | Ads and paid rankings, foreign-tourist tone, stale PH data | Fresh, local, Taglish, peso budgets |
| Klook / GetYourGuide | Bookable tours and tickets, strong PH SEO | Only sells what it can book; free spots and food streets are missing | Free and non-bookable gala spots; we can still link to them for tickets (section 7) |
| Airbnb Experiences | Polished hosted experiences | Paid, hosted only, little PH depth | Free self-guided outings |
| Wanderlog | Itinerary, map, collaboration, expense split; 4.9★ from 36K ratings, Pro $5.99 to $59.99/yr ([App Store](https://apps.apple.com/us/app/wanderlog-travel-planner/id1476732439)) | Built for one organised planner on a long trip; English only; no curation | Day-outing and weekend scale; the whole GC decides; Taglish |
| Partiful | Invites that spread through group chats | US-centric, no places or budget | Invite loop **plus** where to go |
| Spot.ph, Booky, PH travel blogs, TikTok creators | Discovery, buzz | Content, not a tool; the decision still happens in Messenger | Turns "nakita ko sa TikTok" into a voted plan |
| FB groups (Pinoy travel, "Tara na" groups) | Real tips, huge reach | Chaotic threads; answers get buried | One shareable link per answer |

**Our wedge in one line:** *curation plus group decision plus peso budget, in Taglish, for the day-trip and weekend moment.* Nobody else combines all four.

---

## 4. Channel plan

### 4.1 Demand data (measured)

**Google Trends, Philippines, 5 years weekly** (explore API, pulled 2026-10-06). Index 100 is each term's best month:

| Term | Peak months (index) | Low | Read |
|---|---|---|---|
| things to do | Oct 100, Jan 96, Nov 96, Feb 95 | Jul 58 | **October is the peak**, which is now |
| long weekend | Aug 100, Oct 76 | May 3 | People search the holiday list ahead of Undas and Christmas |
| sembreak | Oct 100, Jan 73 | Mar to Jul 0 | Two student windows: Oct and Jan to Feb |
| date ideas | Feb 100, Jan 86 | Aug 56 | Valentine's run-up starts in January |
| staycation | Dec 100, Apr 91 | Sep 71 | December plus Holy Week |
| Baguio | Dec 100 | Sep 73 | Christmas trip |
| Tagaytay | Dec 100 | Sep 64 | Christmas trip |
| beach, Boracay, La Union, Siargao | Apr 100, Mar 81 to 97 | Aug to Sep | Summer and Holy Week |
| road trip | May 100, Jul 89 | Nov 54 | Summer |
| itinerary | Mar to Apr 100 | Dec 80 | Planning tool demand is high all year |
| outing | Apr 100, Mar 74 | Sep (near 0) | Low volume, summer company outings |

Relative volume in the same Trends query (52-week average): Baguio 59.5, Tagaytay 24.1, Boracay 19.8, La Union 17.9, Siargao 8.8. "things to do" is about 76 times "long weekend" as a bare term. Note: the bare term "gala" peaks in early May every year because of the Met Gala. It is useless as a Trends signal, so track "gala tayo" and "gala spots" instead.

**Google Autocomplete (gl=ph, en and tl, 2026-10-06)**, the phrases with real demand that match the product:

- `gala spots` → near me, in manila, in quezon city, in makati, in metro manila
- `date spots` / `date ideas` → manila, quezon city, makati, bgc, cebu, cavite, pampanga, tagaytay, philippines
- `pasyalan` → near me, manila, quezon city, sa tagaytay, sa pampanga, sa cavite, sa baguio (Tagalog guide titles work)
- `things to do in` / `where to go in` → manila, tagaytay, cebu, baguio, bgc, pampanga, iloilo, bohol
- `long weekend` → 2026 philippines, november, 2027, 2027 philippines
- `sembreak` → 2026, 2026 deped schedule, of public school 2026
- `day trip from manila` → to tagaytay, to beach, reddit, with kids
- `weekend getaway` → near manila for family, captions with friends
- `barkada outing` → near manila, food ideas, caption
- `trip planner` / `itinerary` → app, ai, maker, template
- `instagrammable` → cafe in quezon city / iloilo / baguio / silang cavite, places in cagayan de oro / iloilo city
- `hatian` has **no** travel or bill-split suggestions (it autocompletes to "haitian"), so don't build SEO around "hatian". Use it as in-product copy only.

**Seasonal calendar for the next 6 months.** Dates come from the holiday laws; weekdays are computed. The 2027 holiday proclamation is not out yet, so check it once it's issued.

| Window | Dates | Who | What to push |
|---|---|---|---|
| Undas long weekend | Sat Oct 31 to Mon Nov 2, 2026 (Nov 2 must be declared) | Families, balikbayans | Out-of-town family trips, rainy-day picks. Never cemetery content (gala-worthy rule) |
| Bonifacio Day weekend | Sat Nov 28 to Mon Nov 30, 2026 | Barkada | Weekend getaways from Manila, Baguio, La Union |
| Dec 8 bridge | Tue Dec 8 (Mon Dec 7 bridge if declared) | Barkada, couples | Short getaways |
| Christmas | Thu Dec 24 to Sun Dec 27 | Families, balikbayans | Baguio and Tagaytay peak (Trends Dec = 100), staycations, Christmas lights spots |
| Year-end | Wed Dec 30 to Sun Jan 3 | All | New Year trips, Gala Wrapped 2026 (see 5.3) |
| College sembreak and Valentine's | Late Jan to Feb 14, 2027 (Feb 14 is a Sunday) | Students, couples | Date spots by city, student-budget outings |
| Holy Week 2027 | Thu Mar 25 to Sun Mar 28, 2027 | All | Beach and summer. Trends peaks here every year |
| Araw ng Kagitingan | Fri Apr 9 to Sun Apr 11, 2027 | Barkada | Summer road trips |

### 4.2 SEO / AEO / GEO (main lever, mostly automated)

The engine already exists: weekly guides, trending guides, the report, llms.txt, robots that welcome AI crawlers, an SEO score of 100. The keyword engine on `feat/seo-data-engine` will map keywords to pages. Strategy on top of it:

1. **Fix the mismatch first.** Many of Google's top pages are mall, arcade and chain pages that don't meet the gala-worthy bar. Make sure every hidden place URL returns a 301 to its city page or a 410, not a thin 200, and remove them from the sitemap. Add a category blocklist (malls, cinemas, arcades) to `discover-guides.mjs`. It made "Malls in Makati" and "Cinemas in Metro Manila" from a weather trend, which breaks the gala-worthy promise. Those guides are already noindex because they're thin, but they shouldn't be generated at all.
2. **Own the four phrase families with demand:** `gala spots in <city>`, `date spots in <city>`, `pasyalan sa <city>`, `things to do in <destination>`. The guide template already supports these. The keyword engine picks the cities.
3. **Seasonal evergreen hubs** that are refreshed each year at the same URL: `/guides/long-weekends-2027` (holiday list plus where to go each weekend), `/guides/undas-getaways`, `/guides/christmas-getaways`, `/guides/holy-week-getaways`. Seasonal queries come back every year, so the same URL builds authority. Publish 3 to 6 weeks before each peak.
4. **AEO answer blocks.** Each guide opens with a 40 to 60 word direct answer ("The best date spots in BGC are…"), then a list and FAQ JSON-LD. That is the snippet and AI Overview format.
5. **GEO (getting cited by ChatGPT, Perplexity, Gemini).** AI engines cite pages with clear entities, numbers and sources. Keep the peso budget, "best time" and access rules in plain text near the top. Keep `llms.txt` listing the guides. Earn mentions on Reddit and in news, because AI engines weigh third-party mentions. Test monthly: ask 10 fixed questions ("best gala spots in Metro Manila", "things to do in Siargao on a budget"…) in ChatGPT, Perplexity and Gemini, and log whether galatayo.app is cited. Method in section 8.
6. **Bing / IndexNow.** Bing had 0 pages indexed, and Bing feeds ChatGPT search and Copilot. Submit the sitemap in Bing Webmaster Tools (owner step) and ping IndexNow on each deploy (the key file is already in `public/`).
7. **Backlinks without accounts or paid links:** an HARO-style press pitch to PH lifestyle sites (Spot.ph, Rappler Life, ABS-CBN Lifestyle, Philstar Life) built on a data story ("we cut 53 'famous' places that weren't worth it, and here's why"), campus papers, tourism office link pages (4.6), and Product Hunt / Hacker News "Show HN" for the AI planner.

### 4.3 TikTok / Instagram / Facebook

Captions and calendar live in `docs/marketing-kit.md`. This section covers strategy only.

- **TikTok is the discovery channel.** PH travel discovery happens there. Format: 15 to 30 s, a face or a POV, one place or one challenge. "₱500 gala challenge in Binondo", "Tier list: Baguio food spots", "Would you rather: Sagada or La Union?". These match the Gala Today formats the user approved, so one creative engine feeds both.
- **Instagram is for story-card reshares.** The product already makes 9:16 story cards and Wrapped. The IG account mainly reposts user story cards (with permission) and carousels of guides.
- **Facebook means groups, not the Page.** Creating the Page was blocked on the brand-named profile. Focus on answering in big PH travel and "saan maganda" groups with a link to the exact guide (4.4).
- Social automation was dropped by user choice. So keep social to **3 posts a week, batch-made once a week** (about 2 hours). That fits the near-zero daily effort goal.

### 4.4 Communities (highest early return, free)

- **Reddit:** r/Philippines, r/phtravel, r/CasualPH, r/manila, r/Cebu, r/baguio. Autocomplete shows "day trip from manila reddit", so people go to Reddit for this. Rule: answer the question in full in the comment and add the link as a source. Never drop bare links. One helpful answer a day, max.
- **FB groups:** Pinoy travel groups, university freedom walls, "tara na" barkada groups. Share a *list* or *plan* link (it carries a preview card), not the homepage.
- **Discord / Viber communities** for students: share Kailan poll links for org outings.

### 4.5 Creators

- Micro-creators (5K to 50K followers) in PH travel and food. Offer: we feature them as the photo credit and creator on the place page (credit plus link, as the photo rule already requires). They get a free plan template, "Gala with @creator". No cash at first.
- Ask each creator for one video that uses the swipe deck or Kailan poll on screen. That shows the tool, not just the place.
- Target 10 creators in 60 days, and expect 2 to 4 to post (**estimate**: cold creator outreach reply rates are usually 10 to 30%).

### 4.6 Campus

- **Campus org outings:** pitch "plan your org's sembreak outing in one link" to student councils and orgs at UP, Ateneo, La Salle, UST, PUP, Mapúa, USC (Cebu), SLU (Baguio). Time it for the late-January sembreak.
- **Campus ambassadors (unpaid, with perks):** a Wrapped-style "Top Planner" badge on their profile, plus a certificate for their portfolio.
- Campus papers and org pubs give **.edu.ph backlinks** for free.

### 4.7 Tourism offices

- LGU tourism offices (Baguio, Vigan, Iloilo, Siquijor, Camiguin, Bohol…) want visitors and good content. Offer a free "official picks" embed or link-back: a city guide they can link from their site and FB page.
- Ask for verified fees, hours and access rules. That improves accuracy (fixes "check before you go" gaps) and earns a .gov.ph link.
- DOT regional offices run "Love the Philippines" campaigns. Pitch GalaTayo guides as a partner resource. This is slow (months), so start in the 60-day window.

---

## 5. Viral loops in the product and how to amplify them

| Loop | How it works today | Weak spot | Fix to amplify |
|---|---|---|---|
| **Plan invite** | Plan link has a preview card (name, date, first stop photo) and forwards to the plan. "The plan link is the invite": anyone signed in can RSVP and vote | Invitees **must sign in** to vote. Guest mode is built (#58) but OFF. The link domain is azurewebsites.net, not galatayo.app | (1) Turn on guest voting: Supabase anonymous sign-ins, already built. (2) Serve invites from `galatayo.app/p/*` through Cloudflare. (3) After a vote, show "Make your own plan" to the voter |
| **Story cards** | 9:16 cards per place and plan recap | No tracking of shares; no CTA URL burned into the image | Put a short `galatayo.app` URL plus place name on every card. Add `?ref=story` on links and count it |
| **Gala Wrapped** | Year or period recap from passport check-ins | Only works with check-in history, which few users have yet | Plan a **"Gala Wrapped 2026"** drop on Dec 26 to Jan 3 that also works from saved places, plans and votes, so new users get one too |
| **Lists** | Shareable list links with preview cards; others can copy a list | Lists are noindex and private by design | Allow *opt-in* public lists ("Ate Mika's Baguio list") as UGC pages, noindex until they have 6+ places and an edit. Feature the best ones in guides |
| **Plan with AI** | Makes a draft plan from intent | Result isn't designed to be shared first | Add a "Send to GC" button right on the AI result |
| **Passport / check-ins** | Geolocation check-ins | Lonely without friends | Show friends' stamps; feeds Wrapped |

**Viral coefficient (target, estimate):** K = invites sent per plan × invite-to-signup rate. Invite products grow fastest when invitees can act without signing up. For us, a realistic first target is **0.2 to 0.4 by day 90** once guest voting is on (method in section 8).

---

## 6. Partnership plays

| Partner | Offer | We get | Effort | When |
|---|---|---|---|---|
| LGU tourism offices | Free city guide plus "official picks" link | .gov.ph backlink, verified facts, local press | Medium | 60 days |
| Campus orgs | Free org outing planning, Top Planner badge | Users in groups (viral), .edu.ph links | Low | 30 to 60 days |
| Micro-creators | Credit, featured plan, early access | Content plus reach | Low to medium | 30 days |
| Gala-worthy venues (resorts, famous restaurants, attractions) | "Gala-worthy pick" badge or sticker for their IG and counter (free, only for places already listed) | Backlinks, social proof, store QR codes pointing to their page | Low | 60 days |
| Transport (bus lines, ferry apps, Grab) | Content swaps: "Where to go from the Baguio bus terminal" | Reach at the moment of travel | High | 90+ days |
| Banks and telco promos (GCash, Maya, Globe, Smart) | "Gala Week" co-marketing with real places | Big reach | High | After traction |

---

## 7. Monetisation that keeps the core free

Rule: browsing, curation, planning, voting, hatian and sharing stay free forever. Money must never decide what counts as gala-worthy.

| Option | How | Upside (estimate) | Risks | Verdict |
|---|---|---|---|---|
| **Affiliate links** (Klook, Agoda, Booking.com, 12Go, ferry and bus booking) on bookable places only | "Book tickets" or "Stay nearby" buttons | Low until traffic grows. Commission is a % of bookings, so at 1,000 visits a month it is pocket money | Trust (looks like ads); Klook's own SEO competes; must disclose | **Yes, first.** Clearly labelled, only on places that need tickets or stays |
| **Venue "claim your page"** (free) plus paid extras (photos, menu, booking link) | Venues already listed can add verified info. Paid only for extras, never for ranking | Medium later | Selling inclusion would kill the brand. Admission stays editorial | Later (6+ months) |
| **Sponsored "Gala Week" editorial packages** | A brand sponsors a themed guide (e.g. "Beach Week by X"); places are still picked by curation | Medium | Disclosure needed; audience must trust picks | After 10K monthly users |
| **GalaTayo Plus** (₱49 to ₱99 a month, **estimate**) | Unlimited Plan with AI, offline plans, Wrapped themes, bigger group plans | Low to medium; Wanderlog proves people pay for Pro | Paywalling core loops would slow virality. Keep voting and hatian free | Test interest with a waitlist button first |
| **Group trip packages** (partner tour operators) | "Book this whole plan" for barkadas | Medium to high per booking | Ops-heavy, liability, refunds | Not now |
| **B2B data and LGU content** | Trend and demand reports, guide content for tourism offices | Low to medium | Slow procurement; must not sell personal data (Data Privacy Act) | Explore after 90 days |
| **Merch / physical Pasyal Passport** | Printed stamp book | Low | Inventory | Fun brand play only |

---

## 8. KPIs, targets and how we measure

Baselines from issue #42 (28 days to 2026-10-03). Targets are **estimates**: a new domain with 300+ quality pages, steady weekly publishing and a few backlinks usually grows impressions 5 to 20 times over its first 3 to 6 months. The ranges are wide on purpose.

| KPI | Baseline | Day 30 | Day 60 | Day 90 | How to measure |
|---|---|---|---|---|---|
| Google impressions / 28 d | 486 | 1.5K to 3K | 4K to 8K | 8K to 20K | Weekly SEO report issue (GSC) |
| Google clicks / 28 d | 2 | 20 to 60 | 80 to 200 | 200 to 600 | same |
| Non-branded share of clicks | ~50% | 60% | 70% | 80% | GSC queries without "gala tayo" |
| Guides with 100+ impressions / 28 d | 0 known | 3 | 8 | 15 | Per-guide table in the report (#45) |
| Bing indexed pages | 0 | 100+ | 250+ | 300+ | Bing Webmaster Tools (owner) |
| AI citations (10 fixed questions × 3 engines) | not measured | 0 to 1 / 30 | 2 to 4 / 30 | 4 to 8 / 30 | Monthly manual check, logged in the report issue |
| Referring domains | 0 | 3 | 8 | 15 | GSC Links report |
| Weekly active planners (created or voted on a plan) | not tracked | 10 | 40 | 100 | Supabase query on plans and votes (add to weekly report) |
| Invites per plan | not tracked | 1.5 | 2.5 | 3+ | Supabase: plan members per plan |
| Invite → new user | not tracked | 10% | 15% | 20 to 25% | ref param plus new accounts or guests |
| K-factor | not tracked | 0.05 | 0.15 | 0.2 to 0.4 | invites per plan × invite → new user |
| Story card / Wrapped shares | not tracked | 20 | 80 | 300 (Wrapped week) | `?ref=story` / `?ref=wrapped` visits in GA4 |
| Social followers (TikTok + IG) | ~0 | 200 | 800 | 2K | Platform counts |

**Instrumentation to add (small):** `ref` params on every share URL (`plan`, `list`, `story`, `wrapped`, `ai`). A weekly Supabase count of plans, votes, members and guests in `report.mjs`. A GA4 event for share-button taps. Remember GA4 only sees consented visitors, so trust Supabase and GSC more.

---

## 9. 30 / 60 / 90-day roadmap

Effort: **S** = under half a day, **M** = 1 to 2 days, **L** = 3+ days. The owner is "dev" (Claude agents) unless it says "owner" (needs the user: accounts, approvals, outreach as a person).

### Days 1 to 30 (to Nov 5): fix the base, catch Undas

| Task | Effort | Owner |
|---|---|---|
| 301/410 for hidden place URLs; category blocklist in `discover-guides.mjs` | S | dev |
| Turn on guest voting (Supabase anonymous sign-ins, manual linking, rate limit) | S | owner (Supabase settings) then dev QA |
| Plan and list invite links on `galatayo.app/p/*` via Cloudflare | M | dev |
| `ref` params plus weekly Supabase counts in the report | S | dev |
| Bring home and place LCP back under 2.5 s (hero image via cdn-cgi resize: check cold-cache latency, serve the 640 width to phones, preload); re-run Lighthouse | M | dev |
| `/gala-tayo-meaning` answer page (E3) | S | dev |
| `/guides/long-weekends-2027` hub, plus Undas and Bonifacio getaway guides | M | dev |
| Bing Webmaster sitemap submit; IndexNow on deploy | S | owner (Bing) and dev |
| Reddit / FB group answering: 1 a day | S/day | owner |
| TikTok and IG accounts; first 6 posts from the marketing kit | M | owner |

### Days 31 to 60 (to Dec 5): Christmas content, creators, campus

| Task | Effort | Owner |
|---|---|---|
| Christmas getaways, Baguio and Tagaytay December guides (Trends peak = Dec) | M | dev |
| "Send to GC" on Plan with AI result; "Make your own" CTA after voting | M | dev |
| Burn the short URL into story cards | S | dev |
| Creator outreach: 10 micro-creators | M | owner |
| Press pitch: "53 famous places we cut" data story | S | owner (sends) and dev (draft) |
| LGU tourism office pitch: 5 cities | M | owner |
| Gala-worthy pick badge kit for listed venues | S | dev |
| Gala Today relaunch once the creator upgrade passes QA | M | dev |

### Days 61 to 90 (to Jan 4): Wrapped, sembreak, Valentine's

| Task | Effort | Owner |
|---|---|---|
| Gala Wrapped 2026 drop, Dec 26 to Jan 3, that works without check-ins | L | dev |
| Campus org push for the late-January sembreak: 8 schools | M | owner |
| Date spots by city guides, live by mid-January for Feb 14 | M | dev |
| Affiliate links on bookable places, labelled | M | dev, owner signs up for programs |
| Opt-in public lists (UGC) | L | dev |
| Plus waitlist button (demand test) | S | dev |
| Holy Week 2027 guide prep (publish by late Feb) | M | dev |

---

## 10. Top 10 experiments (ranked by impact ÷ effort)

Impact and effort are scored 1 to 5. Score = impact ÷ effort.

| Rank | Experiment | Hypothesis | Metric and pass bar | Impact | Effort | Score |
|---|---|---|---|---|---|---|
| E1 | **Guest voting on plan invites** | Removing sign-in raises invite → action rate a lot | Vote rate per invite opened ≥ 40% (vs. baseline once tracked) | 5 | 1 | 5.0 |
| E2 | **301/410 hidden pages and block mall/cinema guides** | Google shifts impressions to curated pages | Share of impressions on visible pages > 80% in 4 weeks | 4 | 1 | 4.0 |
| E3 | **`/gala-tayo-meaning` answer page** | Captures daily translation searches for our brand phrase | Page in top 3 for "gala tayo meaning" in 6 weeks; 50+ impressions / 28 d | 3 | 1 | 3.0 |
| E4 | **Long weekends 2027 hub** | Holiday-list searches (Aug and Oct peaks) can be turned into trips | 500+ impressions / 28 d by the 2027 proclamation week | 4 | 2 | 2.0 |
| E5 | **Reddit / FB answer routine (1 a day, 30 days)** | Helpful answers bring first real visitors and links | 100+ referral sessions and 3+ links in 30 days | 4 | 2 | 2.0 |
| E6 | **Short URL burned into story cards plus `ref` tracking** | Shared images bring visitors back | 1+ visit per 5 cards made | 3 | 1.5 | 2.0 |
| E7 | **"Send to GC" on Plan with AI** | AI users become inviters | 25% of AI plans get shared | 4 | 2 | 2.0 |
| E8 | **Gala Wrapped 2026 (no check-in needed)** | Year-end recap is the most-shared format of the season | 300 shares; K above 0.3 during the drop week | 5 | 4 | 1.25 |
| E9 | **Campus org outing pitch (8 schools)** | Orgs bring 20 to 60 people per plan | 5 org plans with 15+ members each | 4 | 3 | 1.3 |
| E10 | **Data-story press pitch ("we cut 53 famous places")** | Curation is a newsworthy angle that earns links | 2+ articles or links in 6 weeks | 3 | 2.5 | 1.2 |

Run E1 to E3 first; they take a few days in total and fix leaks before we pour traffic in.

---

## Sources

- Search Console and GA4: weekly report issue #42, tegrado-jerome/gala-tayo (2026-10-05).
- Google Autocomplete: `suggestqueries.google.com`, client=firefox, gl=ph, hl=en and tl, pulled 2026-10-06.
- Google Trends: trends.google.com explore and multiline API, geo=PH, today 5-y, weekly, pulled 2026-10-06. Monthly index = average per calendar month ÷ best month.
- Sitemap counts: https://galatayo.app/sitemap.xml (2026-10-06).
- Lighthouse 12 local runs, mobile preset (2026-10-06); PageSpeed Insights keyless quota was exhausted that day.
- Wanderlog App Store listing: https://apps.apple.com/us/app/wanderlog-travel-planner/id1476732439
- Holiday dates: Philippine holiday laws (fixed-date holidays, last Monday of August for National Heroes Day; Holy Week 2027 from the Easter date of Mar 28, 2027); weekdays computed. Special days such as Nov 2 and Dec 7 bridges depend on the yearly proclamation.
- Repo: `frontend/src/data/seoGuides.json`, `frontend/src/utils/share.ts`, `frontend/src/components/gala-plan/BarkadaPanel.tsx`, `frontend/src/utils/galaWrapped.ts`.
