# GT1 build guide (rebuilding pages in the real app)

Design source of truth:
- Tokens + component classes: `frontend/src/design/gt1.css` (classes prefixed `g-`).
- React kit: `frontend/src/components/ui/index.tsx` (`Button`, `Chip`, `Chips`, `Tag`, `Panel`, `Page`, `SectionHead`, `Avatar`, `AvatarStack`, `Tabs`, `Stats`, `SulitMeter`, `PlaceCard`, `PlaceCardSkeleton`, `Row`, `Empty`, `Skeleton`, `Stamp`, `Sheet`, `KeyValue`, `cx`) and `components/ui/GtMap.tsx` (real Leaflet + OSM map with GT1 pins).
- Approved mockups (look at the PNGs before building your page): `D:/Personal Projects/gala-tayo-benchmarks/mockups/gt1/out/<page>-mobile.png` and `-desktop.png`, HTML in `.../mockups/gt1/pages/<page>.html`. Component sheet: `.../mockups/gt1/components.html`.
- The shell is done: `SiteHeader` (all sizes) and `MobileBottomNav` (5 tabs, centre "Tara") render around every page. Do NOT render your own top header, logo bar, or bottom nav inside pages. A small in-page back link is fine.

## Rules
1. **Mobile first.** Design for 360–430 px first, then enhance at `md` (768) and `lg` (1024). No horizontal page scroll. Flex children holding text get `min-w-0`. Tap targets ≥ 44 px.
2. **Keep all behaviour.** Do not change data fetching, hooks, services, routing, auth, analytics, SEO tags, or business logic. Rewrite presentation (JSX + classes) only. Keep every feature reachable. You may delete purely decorative components that become unused.
3. **Zero old look.** Remove the old visual classes on your files (legacy `gala-*` CSS classes, hard-coded hex colours, `rounded-[24px]` shadows, gradients, FontAwesome where an equivalent lucide icon exists). Use the GT1 kit + `g-*` classes. Tailwind utilities are allowed only for layout glue (flex/grid/gap/margin/padding/width). Colours only via tokens: `var(--ink)`, `var(--ink-2)`, `var(--ink-3)`, `var(--paper)`, `var(--surface)`, `var(--fill)`, `var(--fill-2)`, `var(--line)`, `var(--line-2)`, `var(--tara)`, `var(--tara-soft)`, `var(--tara-ink)`, `var(--ok)`, `var(--bad)`, `var(--warn)` (+ `-soft`).
4. **One orange per screen.** `variant="tara"` only for the single most important action. Everything else: `ink`, `soft`, `line`, `text`.
5. **Type**: `g-d1` (page hero only), `g-h1`, `g-h2`, `g-h3`, `g-sm`, `g-xs`, `g-mut`, `g-fnt`, `g-eyebrow`. Bricolage Grotesque is display, Instrument Sans body (already global).
6. **Layout**: wrap page content in `<Page>` (or `<Page narrow>` for forms/settings). Sections use `<SectionHead>`. Two-column desktop = `.g-split` + `.g-side` (stacks on mobile). Card grids = `.g-grid` (2 cols mobile, 3 desktop, `is-4` for 4). Horizontal rails = `.g-hscroll`. Lists = `.g-list` of `<Row>`.
7. **Maps**: use `GtMap` for any new map. Existing Leaflet maps are auto-tinted by gt1.css; restyle their markers to GT1 pins (`g-lpin`, `is-n`, `is-on`, `g-lme`) where you touch them.
8. **AI is a lead feature.** Where the brief for your page mentions AI, surface it with the `g-ai` composer / `g-draft` result styles or a `Button` with the lucide `Sparkles` icon. Open the global AI chat with `openFloatingChat(question?)` from `utils/floatingChat`. Plan creation with AI lives at `/plan-with-ai`.
9. **States**: every list has a loading state (`PlaceCardSkeleton` / `Skeleton`), an empty state (`Empty`, plain Taglish-English, one next step) and an error state.
10. **Copy**: short, warm, Taglish where natural ("Tara!", "Baka", "Pass", "Wala pang…"). Sentence case. No emoji as icons.
11. **Clean code**: no narrating comments, no dead code, no new dependencies. Keep files focused; extract a component only when reused.
12. **Verify before finishing**: `cd frontend && npx tsc -b` must pass and `npx eslint <your files>` must be clean. Only fix errors in files you own; if another file breaks, report it instead of editing it.

## File ownership
Only edit the files assigned to you. Shared files (`gt1.css`, `components/ui/*`, `index.css`, shell, routes) are owned by the lead: if you need a new shared class or component, add it locally in your page first and mention it in your report.
