# Lakbay — GalaTayo design direction (replaces "Dusk")

Approved mockup (look at it first): `D:/Personal Projects/gala-tayo-benchmarks/galatayo-lakbay.png`.
Direction = Polarsteps' plan-first map + Pinterest's photo feed. As minimal as possible, but trendy and catchy.

## System (already in `frontend/src/design/gt1.css`, class names unchanged: `g-*`)
- Surfaces white (`--paper`/`--surface` #fff) with mist `--fill` #F2F4F7 for inputs/chips. No beige anywhere.
- Brand/text/secondary buttons: navy `--ink` #0F2138.
- Main action: bright coral `--tara` #FF6B4A with NAVY text (`g-btn-tara` already does this). Exactly one coral action per screen. Coral also draws map routes and route numbers. Coral used as text → `--tara-ink` #C93F22.
- Teal `--sea` (#13786D text / `--sea-soft` fill; bright #2BB3A3 allowed only as decorative fill) for stamps, "going", live, open now.
- Fonts: Sora (display, headings) + Plus Jakarta Sans (body). Use `g-d1/g-h1/g-h2/g-h3`.
- Radii larger and softer: 12/18/26px; sheets 26px top corners; pills 999.
- Maps: `GtMap` has a `night` prop → navy map tiles (Polarsteps). Use `night` for plan/route/home-plan-card maps; default light-grey for Explore and place "getting there".
- Photo pins: circular 44px photo with 3px white border over the map where a place has an image (see mockup); numbered coral dots (`.num` style: 26px coral circle, white 2px border, navy... use white text on coral only at ≥ 13px bold — or navy text) for route order.

## Layout patterns
- **Masonry feed** (Pinterest): CSS columns (2 on phone, 3–4 desktop), 8–10px gap, 18px radius images with natural varying heights (alternate aspect ratios 3/4, 4/5, 1/1, 4/3 by index when real dimensions are unknown), caption on the image bottom-left (white, 13px bold, text-shadow) with price, small white circular heart top-right. Title/meta below only on desktop if needed.
- **Pull-up sheet over a hero** (Polarsteps): full-bleed photo or night map top ~45–50% of the phone viewport, white sheet with 26px top radius overlapping by ~28px, drag handle, content inside.
- **Sticky bottom action bar** on phones: white, hairline top border, one coral main button + one mist secondary/icon.
- Chips instead of boxes; minimal borders; whitespace.

Read `docs/gt1-build-guide.md` for rules that still apply (mobile first, keep all data/behaviour, tokens only, no new deps, verify). Verify at 360/390/1440: dev server http://localhost:5199; signed-in Playwright storage state `C:\Users\tegra\AppData\Local\Temp\claude\D--Personal-Projects-gala-tayo\6b8c4873-c489-4404-a131-f789f8bbf971\scratchpad\qa-local.json`; proxy `/api/*` to `https://galatayo-api-cvawfwgrg6akdmem.southeastasia-01.azurewebsites.net` as in `scratchpad\bench\sweep.mjs`. Avoid many parallel browser contexts (auth refresh rate limit). tsc + eslint clean. Don't commit. Edit only your files.
