# AI assistant benchmark: travel and place assistants

## 1. Scope and method

- Research date: 2026-10-06 (written 2026-10-07).
- Public pages only. No logins, no accounts. Pages were fetched directly or through a public reader proxy.
- Every claim below comes from a page that was opened and read. Sources are listed in section 6 as `[Sn]`.
- If a page was blocked (CAPTCHA, 403, 429, or only a login wall) or said nothing on a topic, it is marked **not publicly documented**.
- Blocked or empty during this pass: Tripadvisor AI Trip Builder page (CAPTCHA), Expedia.com Romie pages (CAPTCHA), Klook site and blog (403; the newsroom had no AI item), Perplexity product and blog pages (403), Mindtrip FAQ and how-it-works (login wall), Wanderlog help center (403).
- Dimensions: grounding and hallucination control, tool use, answer format, memory, multilingual, speed/streaming, citations/attribution, guest/usage limits.

---

## 2. Per-product notes

### 2.1 Google Maps: Ask Maps (consumer)

- **Grounding:** "Maps analyzes information from over 300 million places, including reviews from our community of more than 500 million contributors" [S5]. Gives "insider tips from real people" from contributors [S5].
- **Tool use:** Directions, ETAs, reservations, saving to lists, sharing with friends, navigation [S5]. Later added: agentic food ordering (Square, Toast; Uber Eats coming), hotel price and availability checks, events with ticket links, and a live transit widget that updates delays every minute [S6]. Users can suggest edits by chat; a photo of a sign can update hours, and the user confirms before it is submitted [S6].
- **Answer format:** A conversational answer plus "a customized map to help you visualize your options" [S5]. A transit "virtual departure board" widget [S6].
- **Memory:** Personalized from places you searched or saved [S5]. If history is on, it "remembers past conversations so you can pick up where you left off" [S6]. Gmail link ("Personal Intelligence") is opt-in and "off by default" [S6].
- **Multilingual:** Launched in the U.S. and India [S5]. Later in Australia, Brazil, Canada, Indonesia, Japan, Mexico, "along with over 150 countries and territories in English" [S6]. The Philippines is not named; list of supported languages is not publicly documented.
- **Speed/streaming:** Not publicly documented.
- **Citations:** Not publicly documented for the consumer UI. The blog only says tips come from contributors [S5].
- **Limits:** Not publicly documented. Desktop was "coming soon" at launch [S5].

### 2.2 Gemini API: Grounding with Google Maps (developer rules)

- **How it works:** The model sees location intent, calls the Maps tool (optionally with lat/lng), and returns grounded text with source annotations [S1]. The tool is "off by default", so you must turn it on [S1].
- **Response data:** The Gemini API (Interactions) returns source annotations with `url` and `name` (type `place_citation` in the sample) [S1]. Vertex returns `groundingMetadata.groundingChunks[].maps` with `uri`, `title`, `placeId`, optional `placeAnswerSources.reviewSnippets`, plus `groundingSupports` linking text segments to chunks [S2]. When combined with function calling, the `google_maps` built-in tool returns user-visible `queries`, `places` and a `google_maps_widget_context_token` [S4].
- **Required display rules** [S1][S2]:
  - Google Maps sources "must immediately follow the generated content that the sources support."
  - Sources "must be viewable within one user interaction" (a collapsed list is allowed [S2]).
  - For each source: attribute it to Google Maps, show the source title or name, and link to the returned uri/url.
  - Text "Google Maps": do not change its capitalization, do not wrap it onto two lines, do not translate it, and add `translate="no"`.
  - Vertex style spec: Roboto or a sans-serif fallback, weight 400, color white, #1F1F1F or #5E5E5E with 4.5:1 contrast, 12–16sp [S2].
  - Optional: a Google Maps favicon before the text, and the place's og:image [S2].
  - Voice UIs need a companion UI with a verbatim history plus active disclosure [S2]. This does not apply to us now.
- **Caching:** Vertex says `placeId` and `reviewId` may be cached, stored and exported. "The restrictions against caching in the Grounding with Google Maps Terms don't apply" to those two fields [S2]. This implies other returned content is limited by those Terms. We did not open the Terms themselves.
- **Prohibited territories:** You may not offer the feature in a Google Maps Platform "Prohibited Territory" [S2]. We did not open that list; check that the Philippines is not on it before launch.
- **Language limit:** "Grounding with Google Maps currently only supports English language prompts and responses" [S1]. This matters a lot for a Taglish assistant.
- **Best practices:** Pass the user's lat/lng when known. Tell users that Google Maps data is used. Only turn the tool on for queries with clear location intent, to save speed and cost [S1].
- **Routing (Vertex):** "Find Directions" supports driving, walking, bicycling, transit and two-wheelers; up to 13 waypoints; real-time traffic [S2]. Vertex warns: "Information in the Google Maps Grounded Results might differ from actual conditions of the road or venue" [S2].
- **Billing:** Gemini 3 models are billed per Maps search query the model runs, and one prompt can run several queries. Gemini 2.5 is billed per prompt that returns a grounded result [S1].
- **Tool combos:** Gemini 3 models can mix built-in tools (Maps, Search) with custom functions. This is marked **Preview** [S1][S4].

### 2.3 Gemini API: function calling best practices

- Official list [S3]: clear, specific function and parameter descriptions; descriptive names with no spaces or special characters; strong typing (integer, string, enum); "keep active set to 10-20 tools maximum"; give context in the prompt; "validate function calls before executing"; robust error handling; proper auth for external APIs.
- Modes: `auto` (default), `any` (must call a function), `none`, and `validated` (enforces the schema) [S3]. `allowed_tools` can limit `any` to named tools [S3].
- Parallel calls (several in one turn) and compositional calls (chained) are supported [S3]. The samples show `"stream": true` with tools [S3].
- Known issue: making the model write structured text right before a tool call can cause malformed function calls [S3].

### 2.4 Mindtrip

- **Grounding:** "Scours thousands of data sources" [S8]. Recommendations are combined with "guides and perspectives from real travelers and local experts" [S7]. Destination partners (DMOs) feed in their own curated content. For example, Visit Denver content becomes "custom recommendations complete with curated imagery, interactive maps, distance estimates and thoughtfully sequenced recommendations" [S10].
- **Tool use:** Search and booking for flights, stays and restaurants; price-drop alerts; "agents" that keep working after the chat, such as watching hotel prices or looking for events [S7][S9]. The homepage shows weather-aware advice ("looks like it's going to rain tomorrow. Here are some indoor ideas") [S7].
- **Answer format:** "Beautiful photos, interactive maps and reviews"; customizable, shareable itineraries [S8]. Testimonials praise "clear reasoning": it explains why a pick fits [S7].
- **Memory:** The core pitch. It "remembers how you like to travel" and weighs when a saved preference should yield to the needs of a given trip [S7][S9]. In beta, users who set up the assistant were "3x more likely to create a trip" [S9].
- **Multilingual, speed, citations, limits:** Not publicly documented (the FAQ is behind a login wall).

### 2.5 Layla (layla.ai, acquired by Expedia Group on 2026-07-31)

- **Grounding:** Builds "a personalized, day-by-day plan using live pricing and availability"; compares "live prices for flights, hotels, trains, and activities" [S11].
- **Human in the loop:** Human travel experts can plan, book and change trips, free of charge [S11].
- **Answer format:** Day-by-day itineraries; shareable trip pages [S11]. Map details are not publicly documented.
- **Limits:** "Free to use… no subscription fee" [S11].
- **Ownership:** Expedia Group bought Layla, "an AI-native trip planning and booking platform… through a conversational travel agent" [S12].
- **Memory, multilingual, streaming, citations:** Not publicly documented. The homepage shows trip titles in Czech and Latvian, but no language policy is stated [S11].

### 2.6 Wanderlog AI assistant

- **Grounding:** Auto-fill uses "traveler reviews from Tripadvisor and Google to rank activities, restaurants, and more" [S14].
- **Tool use:** Suggestions, quick translations, destination Q&A, route optimization ("pick a starting and ending point… fastest route"), email/Gmail import of bookings [S14]. Map view with export to Google Maps [S13]. Real-time group planning [S13].
- **Limits:** Pro unlocks offline access, export to Google Maps, unlimited attachments and more [S15]. A press quote calls route optimization a Pro feature [S14]. AI usage caps are not publicly documented.
- **Multilingual:** The site offers Tagalog among its languages [S13]. The assistant's own language behavior is not publicly documented.
- **Memory, streaming, citations:** Not publicly documented.

### 2.7 Tripadvisor (AI Trip Builder; Viator in Gemini)

- The AI Trip Builder page was behind a CAPTCHA, so its features are **not publicly documented** for this pass.
- Viator is "the first connected app for travel experiences on Google Gemini": 425,000+ experiences, with "photos, ratings, and prices directly in the conversation", refined by follow-up questions, then click through to book [S16].
- Pattern: the trusted catalog is the source, and the chat only presents it [S16].

### 2.8 Expedia (Romie / AI assistant)

- Romie product pages were behind a CAPTCHA: **not publicly documented** this pass.
- Explore 2026 [S17]: AI chats inside Meta ads; Trip Matching (itineraries from Instagram Reels); Hotels.com "AI Property Compare" (vibe, location, amenities, trade-offs) and "Property Expert" (answers "using trusted property information and guest reviews"); an "Activity Planner" turning open-ended ideas into a "bookable itinerary"; Vrbo natural-language search "by vibe and group dynamics" such as "a laid-back friends getaway".
- Trust research [S18]: 68% prefer booking with a trusted brand over AI chatbots; 66% would not let an AI book for them; only 8% of US/UK travelers rely on AI chatbots for planning. "Travelers don't have a technology problem with AI. They have a trust problem."

### 2.9 Booking.com

- AI Trip Planner (2023 beta) [S19]: built on Booking's ML recommenders plus OpenAI's API; returns "a visual list of destinations and properties, including Booking.com's pricing information, with deep-links"; users move between chat and app UI. Launch was signed-in Genius members, US, English only.
- 2026 [S20]: Booking.com app in ChatGPT for car rentals (search in chat, book on Booking.com); AI Car Rental Helper in FR/ES/CA/DE/NL/IT and English; AI review summaries; "Smart Search" filters.

### 2.10 Klook

- Klook's site and blog returned 403. The newsroom's first page had no AI-assistant item [S21]. Klook AI features are **not publicly documented** in what we could open.

### 2.11 Perplexity

- **Grounding and citations:** Searches the web in real time; "Each response includes citations and links to original sources" [S22]. It says: "we encourage you to double-check sources" [S23].
- **Memory:** Stores memories and search history; each can be toggled in Settings → Memory, and entries can be deleted. "Perplexity will cite any reference that determines the answer" [S24].
- **Limits:** The free tier has "practically unlimited basic searches" and a "very limited amount of Pro Searches" [S25].
- **Travel, hotel and place cards:** **Not publicly documented.** The public help-center index has no travel article, and the blog was blocked.

### 2.12 Airbnb

- Fall 2026 update (US first) [S26]: AI search in your own words or by voice; AI filters (typing "baby" surfaces cribs, playgrounds and so on); AI listing descriptions; AI side-by-side comparison of wishlist homes; AI customer support chat "in more than 50 languages", with voice support coming.
- Grounding: AI works on Airbnb's own listings and filters [S26]. How it controls hallucination is not publicly documented.
- Streaming, citations, limits: not publicly documented.

---

## 3. Comparison table

| Product | Grounding | Tools | Format | Memory | Multilingual | Streaming | Citations | Limits |
|---|---|---|---|---|---|---|---|---|
| Google Ask Maps | 300M places, contributor reviews [S5] | Directions, booking, food order, transit, hotels, events [S5][S6] | Answer + custom map, widgets [S5][S6] | Saved/searched places; past chats; opt-in Gmail [S5][S6] | 150+ countries in English; some locales [S6] | n/d | n/d (consumer) | n/d |
| Gemini Maps grounding | Maps data; "may differ from actual conditions" [S2] | Places, Find Directions [S2] | Text + sources + widget token [S1][S4] | n/a | **English only** [S1] | n/d | **Required**, strict rules [S1][S2] | Billed per query [S1] |
| Mindtrip | Many sources + DMO curated content [S8][S10] | Book, alerts, background agents [S7][S9] | Photos, maps, itineraries, reasons [S7][S8] | Strong, cross-trip [S9] | n/d | n/d | n/d | n/d |
| Layla | Live prices [S11] | Flights, hotels, trains, activities, human experts [S11] | Day-by-day plan [S11] | n/d | n/d | n/d | n/d | Free [S11] |
| Wanderlog | Tripadvisor + Google reviews [S14] | Route optimize, translate, email import [S14] | Itinerary + map [S13] | n/d | Site has Tagalog [S13] | n/d | n/d | Pro tier [S15] |
| Tripadvisor/Viator | Own catalog, reviews [S16] | In Gemini: compare, refine [S16] | Photos, ratings, prices in chat [S16] | n/d | n/d | n/d | n/d | n/d |
| Expedia | Trusted property info + reviews [S17] | Compare, Q&A, activity planner [S17] | Bookable itinerary [S17] | n/d | n/d | n/d | n/d | n/d |
| Booking.com | Own ML + inventory [S19] | Search, deep links, rental helper [S19][S20] | Visual list with price [S19] | n/d | Helper in 6+ langs [S20] | n/d | n/d | 2023: signed-in only [S19] |
| Perplexity | Live web [S22] | Web search | Answer + citations [S22] | Toggleable memory [S24] | n/d | n/d | Yes, inline [S22] | Free: limited Pro [S25] |
| Airbnb | Own listings [S26] | AI search, filters, compare [S26] | Side-by-side compare [S26] | n/d | Support in 50+ langs [S26] | n/d | n/d | n/d |
| Klook | n/d | n/d | n/d | n/d | n/d | n/d | n/d | n/d |

n/d = not publicly documented.

---

## 4. Patterns that work (and why)

1. **Answer + map together.** Ask Maps, Mindtrip and Wanderlog all pair the chat with a live map [S5][S8][S13]. Places are spatial, so a list alone hides distance.
2. **The catalog is the source; the model only presents it.** Viator-in-Gemini, Booking's visual list, Expedia's Property Expert and Mindtrip's DMO deals all return items from a trusted catalog, not free text [S16][S19][S17][S10]. Users can tap a real item, and nothing is invented.
3. **Structured cards before prose.** Photos, ratings and prices appear in the conversation and are refined by follow-ups [S16][S19]. Users scan cards faster than paragraphs.
4. **Explain the "why".** Mindtrip users single out "clear reasoning" and "real feedback" [S7]. A short reason per pick builds trust.
5. **Visible, controllable memory.** Mindtrip remembers preferences across trips [S9]. Ask Maps and Perplexity let users turn memory or history off [S6][S24]. Memory helps only if users can see it and turn it off.
6. **Context-aware nudges.** Mindtrip's rain → indoor ideas [S7] and Ask Maps' live transit [S6] show that live conditions make picks feel smart.
7. **Ask, don't act, on risky steps.** Ask Maps adds food to the cart for the user to review [S6] and asks before submitting edits [S6]. Expedia's data shows 66% won't let AI book for them [S18]. Keep the user in control.
8. **Natural language that maps to filters.** Airbnb's AI filters and Vrbo's "group dynamics" search turn free text into real filters [S26][S17]. Results stay inside the real inventory.
9. **Group framing.** Vrbo searches by "friends getaway" [S17] and Wanderlog has real-time collaboration [S13]. Group trips are a first-class use case.
10. **Turn grounding on only when needed.** Google's own advice [S1]: it saves cost (billed per query) and speed.

---

## 5. Design for GalaTayo

Current build (from the team): a single assistant with chat and map modes on Gemini function calling. Tools: `search_places`, `get_place`, `nearby_places`, `weather`, `plan_day`, `route_hint`, and an optional Google Maps verify that runs only for curated places. Output streams as NDJSON (status, then cards, then text). It has numbered map pins, a day-plan timeline, follow-up chips, a visible memory strip, provider fallbacks (Groq, Cloudflare, OpenRouter), a deterministic tool-only fallback, an answer cache, and a 47-case eval harness.

### 5.1 Copy these patterns (patterns only, not assets or layouts)

- Cards first, then a short reason per pick (patterns 2–4). The current NDJSON order already does this.
- A map with numbered pins that match card numbers (pattern 1).
- Memory users can see and clear (pattern 5). Add a one-tap "forget" on the memory strip.
- Weather-aware swaps: rain means indoor gala picks (pattern 6).
- Free text mapped to real filters: budget, vibe, group size, area (pattern 8).
- Ask before acting: saving to a plan or sharing needs one tap from the user (pattern 7).
- Follow the official function-calling rules [S3]: keep under 10–20 tools (we have 7), use enums for category/area/budget, validate arguments server-side, and return typed errors the model can recover from. Try `validated` mode.

### 5.2 Do better than the benchmark

- **Zero invented places.** Every card must come from a tool result with a curated place ID. Drop any place name in the text that is not in the tool results.
- **No invented prices or hours.** Show only fields from our verified data. If a field is missing, say "check before you go", not a guess. Vertex itself warns that Maps data "might differ from actual conditions" [S2].
- **Taglish everywhere.** Maps grounding is English only [S1]. So keep the curated tools as the main path. Use Maps only for the curated-place verify step, and never let Maps text appear as the Taglish answer.
- **Barkada-first.** No competitor plans by friend-group budget per head and group vibe in PH. Expedia/Vrbo only hint at "group dynamics" [S17].
- **Safety notes on cards** (flood, night travel, crowd). We found no competitor that shows place safety notes.
- **Graceful degradation.** The deterministic tool-only fallback means we still show real cards when every LLM fails. Make sure this path also renders chips and the map.

### 5.3 Our unfair advantages

- A curated, gala-worthy dataset with verified facts, photos and safety notes. This is the same "trusted catalog" pattern the big players use [S16][S17], but tuned for PH outings.
- Barkada planning (plans, per-head budget, group share).
- Live weather on places and plan days.
- Taglish voice, which Maps grounding cannot produce [S1].
- Philippine focus. Ask Maps launch lists do not name the Philippines [S5][S6].

### 5.4 Google Maps attribution rules (if the Maps verify step uses Gemini Maps grounding)

- Show the sources right under the content they support, reachable in at most one tap (collapsing is OK) [S1][S2].
- Each source: the text "Google Maps" + the source title + a link to the returned uri [S1][S2].
- Render "Google Maps" exactly like that, never translated, never wrapped, with `translate="no"`, in a sans-serif font at weight 400, color #5E5E5E or #1F1F1F (4.5:1 contrast), 12–16px [S2].
- Cache only `placeId`/`reviewId` long-term [S2]. Treat other grounded text as non-cacheable until the Maps grounding Terms are reviewed. This affects the answer cache.
- Tell users that Google Maps data is used when the tool is on [S1].
- Check that the Philippines is not a Prohibited Territory [S2].
- If built-in Maps is combined with custom functions, note that this is Preview on Gemini 3 [S4]. Keep the verify step as a separate call if stability matters.

### 5.5 QA checklist for the live assistant

Run each item against the 47-case eval harness and by hand on prod.

Grounding and truth
- [ ] Every recommended place is in our curated set (card ID resolves via `get_place`).
- [ ] Text names no place that is missing from the cards.
- [ ] No price, hours, fee or phone number that is not in our verified data.
- [ ] Missing data is labeled ("check before you go"), never guessed.
- [ ] Off-topic or non-PH requests get a polite redirect, not invented places.
- [ ] Only gala-worthy categories appear (no cemeteries, plain churches, malls or cinemas).

Tools
- [ ] "Near me" and area queries call `nearby_places` or `search_places` with valid enum arguments.
- [ ] Weather is fetched for date-specific or "today" asks, and rain swaps to indoor picks.
- [ ] `plan_day` output has a timeline with times in order and travel hints between stops.
- [ ] Bad tool arguments are rejected server-side and the model recovers on retry.
- [ ] The Maps verify step runs only for curated places.

Format
- [ ] Cards stream before text; numbered pins match the card numbers.
- [ ] 2–4 follow-up chips on every answer, in the user's language.
- [ ] Each pick has a 1-line "why it fits" reason.
- [ ] Safety notes show on cards when the data has one.
- [ ] Works at 360px phone width.

Memory
- [ ] The memory strip shows what is remembered (area, budget, group size).
- [ ] A follow-up like "mas mura?" keeps the area and lowers the budget.
- [ ] The user can clear memory in one tap; after that, no stale context is used.

Language and voice
- [ ] Language mirrors the user (English → English, Tagalog/Taglish → Taglish).
- [ ] The "Google Maps" label is never translated.
- [ ] Taglish is natural, lively and not cringe; facts stay unchanged.

Speed and resilience
- [ ] First NDJSON event (status) in under 1s; first card or token in under 2s (p75).
- [ ] Full answer in under 8s (p75).
- [ ] If the primary model fails, a fallback answers; if all fail, the tool-only answer still shows cards, map and chips.
- [ ] Cached answers hold no grounded Maps text beyond `placeId`/`reviewId`.

Attribution
- [ ] When Maps grounding is used, Google Maps sources appear right under the content, within one tap, linked, styled to spec.
- [ ] A disclosure that Google Maps data was used is visible when the tool is on.

Limits
- [ ] Guest usage limits show a friendly message with a sign-up path; the answer is never cut off silently.

---

## 6. Sources

- [S1] Gemini API, Grounding with Google Maps: https://ai.google.dev/gemini-api/docs/maps-grounding
- [S2] Vertex AI / Agent Platform, Grounding with Google Maps: https://cloud.google.com/vertex-ai/generative-ai/docs/grounding/grounding-with-google-maps
- [S3] Gemini API, Function calling: https://ai.google.dev/gemini-api/docs/function-calling
- [S4] Gemini API, Combine built-in tools and function calling: https://ai.google.dev/gemini-api/docs/tool-combination
- [S5] Google blog, How we're reimagining Maps with Gemini (2026-03-12): https://blog.google/products-and-platforms/products/maps/ask-maps-immersive-navigation/
- [S6] Google blog, Ask Maps gets more helpful with food ordering and more (2026-08-06): https://blog.google/products-and-platforms/products/maps/order-food-in-ask-maps/
- [S7] Mindtrip homepage: https://mindtrip.ai/
- [S8] Mindtrip about: https://mindtrip.ai/about
- [S9] Mindtrip Personal Travel Assistant press release (2026-09-30): https://www.prnewswire.com/news-releases/mindtrip-launches-personal-travel-assistant-that-knows-the-traveler-not-just-the-trip-302893318.html
- [S10] Mindtrip x Visit Denver (2026-06-04): https://mindtrip.ai/press/visit-denver-partners-with-mindtrip-to-help-visitors-discover-everything-denver-has-to-offer-powered-by-ai
- [S11] Layla homepage + FAQ: https://layla.ai/
- [S12] Expedia Group acquires Layla (2026-07-31): https://ir.expediagroup.com/news-and-events/news/news-details/2026/Expedia-Group-acquires-Layla-accelerating-its-AI-powered-trip-planning-and-booking-strategy/default.aspx
- [S13] Wanderlog homepage: https://wanderlog.com/
- [S14] Wanderlog Trip Planner AI: https://wanderlog.com/trip-planner-ai
- [S15] Wanderlog AI landing: https://wanderlog.com/ai
- [S16] Viator becomes Google's first connected app for travel experiences (2026-07-30): https://tripadvisor.mediaroom.com/2026-07-30-Viator-Becomes-Googles-First-Connected-App-for-Travel-Experiences
- [S17] Expedia Group Explore 2026 (2026-05-19): https://ir.expediagroup.com/news-and-events/news/news-details/2026/Expedia-Group-Unveils-New-AI-Experiences-Expands-Travel-Ecosystem-and-Launches-Philanthropy-Program-at-Explore-2026/default.aspx
- [S18] Expedia Group, The AI Trust Gap (2026-04-14): https://ir.expediagroup.com/news-and-events/news/news-details/2026/Expedia-Group-Reveals-The-AI-Trust-Gap-Travelers-Embrace-AI-for-Planning-but-Rely-on-Trusted-Brands-to-Book/default.aspx
- [S19] Booking.com AI Trip Planner launch (2023-06-27): https://news.booking.com/bookingcom-launches-new-ai-trip-planner-to-enhance-travel-planning-experience/
- [S20] Booking.com car rentals app in ChatGPT (2026-05-20): https://news.booking.com/bookingcom-is-making-car-rentals-easier-with-app-in-chatgpt/
- [S21] Klook newsroom: https://www.klook.com/en-US/newsroom/
- [S22] Perplexity, What is Perplexity?: https://www.perplexity.ai/help-center/en/articles/10352155-what-is-perplexity
- [S23] Perplexity, What is an answer engine: https://www.perplexity.ai/help-center/en/articles/10354917-what-is-an-answer-engine-and-how-does-perplexity-work-as-one
- [S24] Perplexity, Memory: https://www.perplexity.ai/help-center/en/articles/10968016-memory
- [S25] Perplexity, Which subscription plan: https://www.perplexity.ai/help-center/en/articles/11187416-which-perplexity-subscription-plan-is-right-for-you
- [S26] Airbnb 2026 fall update (2026-09-30): https://news.airbnb.com/airbnb-2026-fall-update
