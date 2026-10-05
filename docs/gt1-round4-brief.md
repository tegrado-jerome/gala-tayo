# GT1 round 4 — strict redesign brief

Read `docs/gt1-build-guide.md` first; its rules still apply. This round fixes a harsh design review benchmarked against Airbnb, Luma, Partiful, Headout, Polarsteps and Duolingo (screenshots in `D:/Personal Projects/gala-tayo-benchmarks/*-mobile.png`). Mobile first.

## New global rules (already in `gt1.css`)
- Paper is deeper (`--paper: #f6f2eb`) so white surfaces separate from the page.
- New supporting colour `--sea` / `--sea-soft` (deep teal). Use it for: "Open now" (`Tag tone="sea"` = class `g-tag is-sea`), unlocked stamps, streaks, map "you" dot, live/status. Orange (`--tara`) now means only "act now": at most ONE orange element per screen (the main CTA). Labels, badges, eyebrows, "Today" chips are never orange.
- The tab bar centre "Tara" button is now ink, not orange.
- Disabled buttons keep their colour at 40% opacity.
- New grouped list: wrap rows in `<div className="g-group">` and use `className="g-group-row"` on each row (`a`/`button`), icon first, `<span className="g-group-end">` for trailing value + chevron. Use this instead of stacks of separately boxed rows (settings, profile shortcuts, menus).
- Mobile header now shows Search + Ask AI icons; the avatar menu is desktop only. On phones, account actions (settings, log out, privacy) must be reachable from the Me tab (profile page).

## Content rules
- Never render a grey empty image box. If an image is missing, render a tinted fallback: `--sea-soft` background with a centred lucide category icon (32px, `--sea`) — or hide the card when it is in a decorative rail.
- One fact, one place. Don't repeat price/rating/directions on the same screen (sticky bar + one facts block max).
- No visible SEO filler paragraphs or duplicate H1/H2/subtitles. One subtitle under an H1, under ~60 characters.
- Plurals: "1 visit", "2 visits" — never "1 check-ins".
- Naming: "Passport", "I'm here", "Invite link" (not "Tara? link"), "Hatian" introduced once as "Hatian (split the bill)".
- AI entry points: header sparkle + the centre Tara tab (opens Plan with AI) + the Home composer are the primary ones. Any per-page AI button ("Ask AI about this place", etc.) is at most ONE small `variant="text"` or `size="sm" variant="soft"` button per page, never a big pill, never next to another AI button.
- Lists of things (good for, tags) are wrapped chips, not stacks of full-width boxes. No icon unless it truly matches.
- Less card soup: prefer bare image + text (Airbnb) or a single `g-group`, instead of a border box around every block.

## Verify
`cd frontend && npx tsc -p tsconfig.app.json --noEmit --incremental false` and `npx eslint <your files>`. Look at your pages in a browser at 390px and 1440px (dev server http://localhost:5199; for real data proxy GET `/api/*` to `https://galatayo-api-cvawfwgrg6akdmem.southeastasia-01.azurewebsites.net` using Playwright `context.route`, pattern in `C:\Users\tegra\AppData\Local\Temp\claude\D--Personal-Projects-gala-tayo\6b8c4873-c489-4404-a131-f789f8bbf971\scratchpad\bench\desk.mjs`). Don't commit. Edit only your files.
