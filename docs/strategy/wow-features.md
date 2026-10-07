# GalaTayo wow features

Written 2026-10-07. Research only, nothing built yet.
Goal: features that competitors don't have, that feel human and Pinoy, and that people want to share.
Every source below was opened on 2026-10-07. Numbers come from those pages.

---

## 1. What we already have (so we don't repeat it)

Tara AI, Plan with AI, Saan tayo picker with the "Bahala na!" deck, barkada plans (RSVP going/maybe/no, Kailan date poll, swipe deck, hatian with a `paid` flag), Gala Today, live weather, passport with stamps and a streak, Gala Wrapped, story cards, lists, Sulit meter, check-ins, reviews.
Place data: budget, best time, crowd level, indoor/outdoor, weather fit, commute, parking, lat/long, and for 287 places `didYouKnow`, `whatToDo`, `safetyTips` with sources (`frontend/src/data/placeExtras.json`).

## 2. What Filipinos actually go through (evidence)

| Moment | Evidence |
|---|---|
| One person does all the planning, and nobody thanks them | Klook survey (2,725 travellers, 10 markets): 72.2% of Filipino planners say the trip only leaves the GC because of them; 80%+ say they deserve more recognition; some spend up to 40 hours on one trip ([ThePost.ph](https://thepost.ph/travel/filipino-travel-planners-most-taken-for-granted-people/)) |
| Money is the top stress | Same survey: managing budgets 57.6% (top stress); "That's out of my budget" 58.2% (top complaint) |
| Collecting ambag is awkward | GCash KKB splits bills but "can't actually chase people who refuse to pay" ([Spot.ph](https://old.spot.ph/newsfeatures/money/102502/gcash-kkb-split-bills-feature-guide-how-it-works-a4373-20220921)) |
| Pasalubong is expected | Gifts for "people left behind" keep ties strong; places have signature items ([SunStar](https://www.sunstar.com.ph/more-articles/the-pinoy-culture-of-pasalubong)) |
| Photos matter a lot | Makati/Pasig ranked #1 "selfiest city" in the world, Cebu #9 (TIME study, 2014, via [Inquirer](https://technology.inquirer.net/34768/makati-pasig-selfie-capitals-of-the-world/amp)) |
| Rain ruins plans | About 20 tropical cyclones enter PAR each year, 8 or 9 cross the country ([PAGASA](https://www.pagasa.dost.gov.ph/climate/tropical-cyclone-information)) |
| The GC lives in Messenger, discovery on TikTok | Messenger reach 61.8M; TikTok 62.3M adults (80.1% of adults) ([DataReportal 2025](https://datareportal.com/reports/digital-2025-philippines)) |
| Commute help is Metro Manila only | Sakay.ph covers NCR only ([App Store](https://apps.apple.com/app/id937998546)) |
| Too many options stall decisions | "An excess of choices can lead to fatigue… or even abandon the process" ([NN/g](https://www.nngroup.com/articles/simplicity-vs-choice/)) |

## 3. What the benchmarks do (opened pages)

| Product | Mechanic worth noting | Gap for our job |
|---|---|---|
| Beli (4.8, 17K ratings) | Rank by "which was better?" pairs, not stars ([App Store](https://apps.apple.com/us/app/beli/id1478375386)); about log2(n) taps per add ([HackerNoon](https://hackernoon.com/belis-binary-search-rating-system-explained)) | Solo, restaurants only, no group ranking |
| Corner (4.5, 842) | Share a social link, it becomes a pin; shared lists ([App Store](https://apps.apple.com/us/app/corner-curate-share-places/id1668282277)) | No vetting; US cities |
| Mapstr (4.7, 2.6K) | Tags, maps open in any browser, import from Google Maps ([App Store](https://apps.apple.com/us/app/mapstr-save-follow-places/id917288465)) | Personal saving, no group decision |
| Partiful (5.0, 263K) | RSVP without app, text blasts, shared photo album, date poll ([App Store](https://apps.apple.com/us/app/partiful-fun-party-invites/id1662982304)) | No places, no budget |
| Wanderlog (4.9, 36K) | Real-time collaboration, expense split, offline ([App Store](https://apps.apple.com/us/app/wanderlog-travel-planner/id1476732439)) | Long trips, one organised planner |
| Polarsteps (4.9, 9.7K) | Auto route tracking, trip stats, Trip Reels, printed Travel Book ([App Store](https://apps.apple.com/us/app/polarsteps/id947925763)) | Solo traveller story, not a barkada |
| Google Maps | Group lists with emoji votes ([Google blog](https://blog.google/products/maps/google-maps-updates-november-2023/)) | No curation, no money, no "who's coming" |
| Airbnb | Experiences, Services, a profile with "Connections" ([Airbnb News](https://news.airbnb.com/airbnb-2025-summer-release/)) | Paid and hosted only |
| Instagram Map | Share last active location with picked friends; location-tagged posts, 24 h ([Buffer](https://buffer.com/resources/instagram-friends-map/)) | Content, not a plan; privacy worries |
| TikTok Local Feed | Local tab for travel, food, events, US only, Feb 2026 ([TikTok](https://newsroom.tiktok.com/introducing-the-local-feed)) | Discovery ends at "save"; the decision still happens in the GC |
| Spotify Wrapped 2025 | Wrapped Party (live with up to 9 friends), Clubs, Listening Age ([Spotify](https://newsroom.spotify.com/2025-12-03/2025-wrapped-user-experience/)) | Music only; no travel group recap |
| Duolingo | Easy streak rules lifted D14 retention 3.3%; 7-day streak users 2.4x more likely to return ([Duolingo blog](https://blog.duolingo.com/improving-the-streak)) | — |
| BeReal | Same-moment prompt, 2-minute window, "late" tag, post to see friends ([IMH](https://influencermarketinghub.com/what-is-bereal/)) | — |
| PhotoHound | Exact photo spot, parking, sunrise/sunset, tips ([photohound.co](https://photohound.co/)) | For photographers, not barkada group shots |
| Klook PH | "Get your travel right" ad campaign praising the group planner, Aug 2026; not an in-app feature ([ContentGrip](https://www.contentgrip.com/get-your-travel-right/)) | Talk, no product |
| Booky (4.5, 63) | Daily sulit deals, "share B1G1 for barkada hangouts" ([App Store](https://apps.apple.com/app/id875812559)) | Food deals, no outings |

**The gap:** nobody turns the barkada's own gala history into something fun, and nobody builds for Pinoy rituals (pasalubong, ambag, the thankless planner, the group photo, the rain).

---

## 4. Candidate features

Effort: **S** under half a day, **M** 1–2 days, **L** 3+ days.

### F1. Salamat, Planner!
- **What:** after a plan's date, members get one tap: "Salamat sa pag-plan!" The planner gets a "Lodi Planner" stamp and a story card: "This gala happened because of Mika. 5 went, 3 stops, ₱650 each."
- **Moment:** the planner did 10+ hours of work and the GC just says "next time ulit".
- **Evidence:** 80%+ of PH planners want more recognition ([ThePost.ph](https://thepost.ph/travel/filipino-travel-planners-most-taken-for-granted-people/)). Klook only made an ad about it ([ContentGrip](https://www.contentgrip.com/get-your-travel-right/)). We put it in the product.
- **Not slop:** a real thank-you from real friends, numbers from the real plan. No AI text.
- **Effort:** S. **Data:** plans, members, RSVP, item count, budget per head, stamps.

### F2. Barkada Wrapped
- **What:** a Wrapped for a friend group, not a person. "Your barkada's 2026: 6 galas, 14 stops, ₱3,900 each. Laging Maybe award: Jun. Fastest to pay: Bea. Top pick: La Union."
- **Moment:** end of year, the GC wants to look back and roast each other.
- **Evidence:** Spotify made Wrapped multiplayer in 2025 with Wrapped Party ([Spotify](https://newsroom.spotify.com/2025-12-03/2025-wrapped-user-experience/)). Polarsteps has solo trip stats ([App Store](https://apps.apple.com/us/app/polarsteps/id947925763)). No travel app does a group recap.
- **Not slop:** every line is a count from the group's own plans. Funny awards are fixed, kind templates; any member can hide an award about themselves.
- **Effort:** M. **Data:** plans, members, RSVP history, `paid`, poll votes, check-ins, existing Wrapped canvas code.

### F3. Pabili List (pasalubong)
- **What:** every plan gets a "Pabili?" link for friends and family who aren't going. They add requests ("1 ube jam, ₱250 max"). The goer sees a checklist at the last stop, with the area's known pasalubong items.
- **Moment:** "Uy, pasalubong ha!" in five different chats, half forgotten.
- **Evidence:** pasalubong is for "people left behind" ([SunStar](https://www.sunstar.com.ph/more-articles/the-pinoy-culture-of-pasalubong)). None of Wanderlog, Klook, Partiful or Google Maps has anything like it (opened listings above).
- **Not slop:** pure Pinoy ritual; requests are written by people, items per area are curated with a source.
- **Effort:** M. **Data:** plans, areas, share-link system. **New:** 1–3 signature items per area with a source (start with the top 20 areas).
- **Bonus:** it pulls people who *aren't* going into the plan link, a new invite loop.

### F4. Singil Card (soft ambag reminder)
- **What:** from hatian, one tap makes a friendly card for the GC: "3 of 5 paid na! Kulang: ₱1,300. Salamat, mga lodi." No names of who hasn't paid unless the planner turns it on.
- **Moment:** chasing ambag feels awkward.
- **Evidence:** GCash KKB "can't actually chase people" ([Spot.ph](https://old.spot.ph/newsfeatures/money/102502/gcash-kkb-split-bills-feature-guide-how-it-works-a4373-20220921)); Wanderlog splits costs but has no social nudge ([App Store](https://apps.apple.com/us/app/wanderlog-travel-planner/id1476732439)).
- **Not slop:** solves a real awkward moment with tone, not tech. No payment data stored.
- **Effort:** S. **Data:** `gala_plan_members.paid`, hatian totals, story card renderer.

### F5. Kasya ba ₱500? (whole-day budget)
- **What:** type a per-head budget; Saan tayo only shows outings where entry + typical food fit, with a "sukli" line ("₱120 left for pasalubong").
- **Moment:** "That's out of my budget" is the #1 complaint.
- **Evidence:** budgets are the top stress at 57.6% ([ThePost.ph](https://thepost.ph/travel/filipino-travel-planners-most-taken-for-granted-people/)). Booky does deals, not whole outings ([App Store](https://apps.apple.com/app/id875812559)).
- **Not slop:** plain filter on real budgets. Commute shown as text only (we have no fare data, and Sakay covers NCR only).
- **Effort:** S–M. **Data:** `budget_min`, `budget_note`, Sulit meter.

### F6. Kuha Spot (barkada photo spot)
- **What:** on each place: where the classic group shot is, best light time (from sunrise/sunset at the place's lat/long), and one tip ("go before 9 to skip the line at the sign").
- **Moment:** "Saan tayo magpi-picture?" and a bad backlit group shot.
- **Evidence:** PhotoHound does this for photographers ([photohound.co](https://photohound.co/)); PH tops selfie rankings ([Inquirer](https://technology.inquirer.net/34768/makati-pasig-selfie-capitals-of-the-world/amp)). Instagram and TikTok show posts, not "stand here" ([Buffer](https://buffer.com/resources/instagram-friends-map/), [TikTok](https://newsroom.tiktok.com/introducing-the-local-feed)).
- **Not slop:** human-curated notes with creator credit (photo rule). Sun time is maths, not guesses.
- **Effort:** M. **Data:** lat/long, best time, credited photos. **New:** one spot note per place.

### F7. Ulan Plan B
- **What:** each outdoor stop has a nearby indoor gala-worthy backup. Two days out, if rain is forecast, the plan shows "Mukhang uulan. Swap to Plan B?" and the group votes in one tap.
- **Moment:** typhoon week; the GC scrambles at 6 am.
- **Evidence:** ~20 cyclones a year ([PAGASA](https://www.pagasa.dost.gov.ph/climate/tropical-cyclone-information)). Wanderlog and Google Maps don't swap stops for weather (opened pages list no such feature).
- **Not slop:** uses real forecast and real indoor/outdoor tags.
- **Effort:** M. **Data:** weather, `indoor_outdoor`, `weather_fit`, lat/long, polls.

### F8. Barkada Tier List
- **What:** after a gala, each member answers 2–3 "Alin mas sulit?" pairs. The group gets "Our Top Galas" and a shareable S/A/B tier card.
- **Moment:** the post-trip debate in the GC ("mas maganda yung Sagada!").
- **Evidence:** Beli ranks by pairs, about log2(n) taps ([HackerNoon](https://hackernoon.com/belis-binary-search-rating-system-explained)) but solo and food only ([App Store](https://apps.apple.com/us/app/beli/id1478375386)). Tier lists are already a planned TikTok format (growth plan 4.3).
- **Not slop:** opinions from the group, no AI scoring.
- **Effort:** M. **Data:** plans, check-ins, places.

### F9. Sabay-sabay Deck (live group swipe)
- **What:** the planner starts a 60-second live round; everyone in the GC swipes the same deck at the same time; the winner shows to all at once.
- **Moment:** a vote that drags for three days.
- **Evidence:** BeReal's shared 2-minute window ([IMH](https://influencermarketinghub.com/what-is-bereal/)); Spotify's live Wrapped Party ([Spotify](https://newsroom.spotify.com/2025-12-03/2025-wrapped-user-experience/)). Google Maps group votes are not live ([Google blog](https://blog.google/products/maps/google-maps-updates-november-2023/)).
- **Not slop:** a game mechanic built on our existing deck. Late joiners get a "late" tag, like BeReal.
- **Effort:** M–L (realtime). **Data:** swipe deck, plan members.

### F10. Kita-kits
- **What:** a meeting point (gate, terminal, landmark) plus a status tap per member: "Papunta na", "Late 15 mins", "Nandito na". No live GPS.
- **Moment:** "Nasaan na kayo?" times twenty.
- **Evidence:** Instagram Map shares location, which raised privacy worries ([Buffer](https://buffer.com/resources/instagram-friends-map/)); Partiful has text blasts ([App Store](https://apps.apple.com/us/app/partiful-fun-party-invites/id1662982304)). Ours is status only, safer.
- **Not slop:** tiny, honest utility for the day itself.
- **Effort:** S–M. **Data:** plan, members, place `parking_info`, `commute_access`.

### F11. Gala Bingo
- **What:** a 3x3 card per place from its verified "What to do" items; the group ticks squares with photos; full card = a story card.
- **Moment:** "Ano gagawin natin dun?" and a day that feels done after one photo.
- **Evidence:** Polarsteps "steps" and stats ([App Store](https://apps.apple.com/us/app/polarsteps/id947925763)); Duolingo shows small goals keep people going ([Duolingo blog](https://blog.duolingo.com/improving-the-streak)).
- **Not slop:** squares come from sourced place facts, not made-up quests.
- **Effort:** M. **Data:** `whatToDo` for 287 places, check-ins, story cards.

### F12. "Nakita ko sa TikTok" paste
- **What:** paste a TikTok, IG or FB link; we match it to a gala-worthy place and add it to the plan, or say plainly "Not on our list yet" with a submit button.
- **Moment:** a viral video in the GC with no name or address.
- **Evidence:** Corner turns links into pins ([App Store](https://apps.apple.com/us/app/corner-curate-share-places/id1668282277)) but with no vetting. Ours adds the gala-worthy check, budget and safety.
- **Not slop:** an honest match or an honest "no".
- **Effort:** M. **Data:** place names and areas, place submissions.

---

## 5. Scores

1 = low, 5 = high. For effort, 5 = easiest.

| # | Feature | Unique | Delight | Share | Effort | Data fit | Total |
|---|---|---|---|---|---|---|---|
| F1 | Salamat, Planner! | 4 | 5 | 4 | 5 | 5 | **23** |
| F2 | Barkada Wrapped | 5 | 5 | 5 | 3 | 4 | **22** |
| F3 | Pabili List | 5 | 5 | 5 | 3 | 3 | **21** |
| F4 | Singil Card | 3 | 4 | 3 | 5 | 5 | 20 |
| F8 | Barkada Tier List | 4 | 4 | 5 | 3 | 4 | 20 |
| F9 | Sabay-sabay Deck | 4 | 5 | 4 | 2 | 4 | 19 |
| F11 | Gala Bingo | 4 | 4 | 4 | 3 | 4 | 19 |
| F5 | Kasya ba ₱500? | 3 | 3 | 3 | 4 | 5 | 18 |
| F6 | Kuha Spot | 4 | 4 | 4 | 3 | 3 | 18 |
| F7 | Ulan Plan B | 4 | 4 | 2 | 3 | 5 | 18 |
| F10 | Kita-kits | 3 | 4 | 3 | 4 | 4 | 18 |
| F12 | Nakita ko sa TikTok | 3 | 4 | 4 | 3 | 4 | 18 |

---

## 6. Top 3 to build first

They fit together: F1 feeds F2, and F3 brings new people into plan links.

### Build 1: Salamat, Planner! (S)
- **Screens:**
  1. Plan page, after the plan date: a sand card "Natuloy ang gala! Thank Mika?" with one black pill "Salamat!" (one per member).
  2. Planner sees a toast plus a new "Lodi Planner" stamp in Passport (count goes up per plan with 2+ thanks).
  3. "Share" makes a 9:16 card: planner name, people who went, stops, ₱ per head, short `galatayo.app` URL.
- **Data:** new `gala_plan_thanks (plan_id, user_id, created_at)`, one row per member. Everything else exists.
- **Rules:** only members who RSVP'd going; no thanks before the plan date; the planner can't thank themselves.
- **Success:** 30% of past-date plans get 2+ thanks; 15% of thanked planners share the card (`?ref=thanks`).

### Build 2: Barkada Wrapped (M)
- **Screens:**
  1. Plans tab, Dec 26 to Jan 3: banner "Barkada Wrapped 2026" for any group with 2+ shared plans.
  2. 6–8 swipe cards: galas count, stops, peso total per head, top area, Lodi Planner (from F1), Laging Maybe, Fastest to Pay, group's top pick.
  3. Last card: one share image plus "Plan our next gala" (opens a new plan with the same members).
- **Data:** plans, members, RSVP, `paid`, poll votes, check-ins, F1 thanks. A "group" = the same 3+ people across 2+ plans.
- **Rules:** awards only from fixed, kind templates; any member can hide an award about themselves; no data from people who left the plan.
- **Success:** 300 shares in drop week (matches growth plan E8); 20% of viewers tap "Plan our next gala".

### Build 3: Pabili List (M)
- **Screens:**
  1. Plan page: "Pabili?" row with a share button ("Send to family GC").
  2. Request page (works signed out, like guest voting): name, item, max ₱, optional note. Shows the area's known pasalubong items as tap chips.
  3. Goer view at the last stop: checklist, tick "Nabili na", total spent; the requester gets "Nabili na ni Bea!" when they open the link.
- **Data:** new `gala_plan_pabili (id, plan_id, requester_name, item, max_pesos, bought, created_at)`; new curated `pasalubong.json` with 1–3 items per area plus a source URL (top 20 areas first). Rate-limit signed-out writes.
- **Rules:** items are food or local crafts with a source; no shop pins are added as places (gala-worthy rule stays).
- **Success:** 20% of plans share a Pabili link; 10% of requesters later open the home page or make a plan (`?ref=pabili`).

---

## 7. Checklist for critic and QA

- [ ] Every number on a card comes from the user's own plan or place data; nothing is invented.
- [ ] No AI-written text on these cards; copy is fixed Taglish templates.
- [ ] Kind tone: no shaming names for unpaid or late members unless the planner opts in; any member can hide their award.
- [ ] Works at 360, 390 and 430 px; one black main action per screen; tap targets 44 px or more.
- [ ] Share images carry a short `galatayo.app` URL and a `ref` param.
- [ ] Signed-out flows (Pabili requests) are rate-limited and store no contact details.
- [ ] Pasalubong items each have a source URL; no new places added outside the gala-worthy list.
- [ ] Layouts are our own (Editorial Picks tokens); nothing copied from Spotify, Beli or Partiful.

---

## Sources (all opened 2026-10-07)

- Beli App Store: https://apps.apple.com/us/app/beli/id1478375386
- Beli ranking explained: https://hackernoon.com/belis-binary-search-rating-system-explained
- Corner App Store: https://apps.apple.com/us/app/corner-curate-share-places/id1668282277
- Mapstr App Store: https://apps.apple.com/us/app/mapstr-save-follow-places/id917288465
- Partiful App Store: https://apps.apple.com/us/app/partiful-fun-party-invites/id1662982304
- Wanderlog App Store: https://apps.apple.com/us/app/wanderlog-travel-planner/id1476732439
- Polarsteps App Store: https://apps.apple.com/us/app/polarsteps/id947925763
- Google Maps group lists: https://blog.google/products/maps/google-maps-updates-november-2023/
- Airbnb 2025 Summer Release: https://news.airbnb.com/airbnb-2025-summer-release/
- Instagram Map: https://buffer.com/resources/instagram-friends-map/
- TikTok Local Feed: https://newsroom.tiktok.com/introducing-the-local-feed
- Spotify 2025 Wrapped: https://newsroom.spotify.com/2025-12-03/2025-wrapped-user-experience/
- Duolingo streaks: https://blog.duolingo.com/improving-the-streak
- BeReal mechanics: https://influencermarketinghub.com/what-is-bereal/
- PhotoHound: https://photohound.co/
- Klook planner survey: https://thepost.ph/travel/filipino-travel-planners-most-taken-for-granted-people/
- Klook campaign: https://www.contentgrip.com/get-your-travel-right/
- Booky App Store: https://apps.apple.com/app/id875812559
- Sakay.ph App Store: https://apps.apple.com/app/id937998546
- GCash KKB: https://old.spot.ph/newsfeatures/money/102502/gcash-kkb-split-bills-feature-guide-how-it-works-a4373-20220921
- Pasalubong culture: https://www.sunstar.com.ph/more-articles/the-pinoy-culture-of-pasalubong
- Selfiest cities: https://technology.inquirer.net/34768/makati-pasig-selfie-capitals-of-the-world/amp
- PAGASA cyclones: https://www.pagasa.dost.gov.ph/climate/tropical-cyclone-information
- DataReportal Philippines 2025: https://datareportal.com/reports/digital-2025-philippines
- NN/g choice overload: https://www.nngroup.com/articles/simplicity-vs-choice/
