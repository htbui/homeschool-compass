# Freerange test coverage

Four layers, from fastest to slowest. Pure logic is tested in unit tests; every
SQL rule (row-level security, RPC guards) in server tests against the local
Supabase stack; real user journeys in browser e2e tests at desktop (1280×900)
and phone (390×844) sizes. Tests compute dates from today and create their own
users and families, so they can run in any order, on any day.

## How to run

| Suite | Command | Needs |
| --- | --- | --- |
| Unit (vitest) | `npm test` | nothing |
| Unit + coverage | `npm run test:coverage` (text summary in the terminal, HTML in `coverage/`) | nothing |
| Typecheck / lint | `npm run typecheck` · `npm run lint` | nothing |
| Server (RLS, RPCs) | `npm run test:cloud` | `npm run db:start` (local Supabase on 5542x) and `.env.local` |
| Browser e2e, local-only | `npm run test:e2e` | `npm run web:local` on :8082, Chrome (or `CHROME_PATH`) |
| Browser e2e, cloud | `npm run test:e2e:cloud` | the local Supabase stack, `npm run web` on :8081 |

Any e2e file runs on its own against another server with `BASE_URL=http://localhost:<port> node e2e/<file>.mjs`;
add `W=390 H=844` for the phone size. Screenshots land in `e2e/screenshots/`.

## Compass & kid mode

Onboarding, the Flight Deck (Today), the weekly rhythm, curriculum pacing and plan
updates, kid mode, compliance and records, settings, backups, accounts and sync,
and the parent's notifications from this device.

Files: unit `src/lib/__tests__/compass-schedule.test.ts`, `compass-records.test.ts`,
`compass-onboarding.test.ts`, `src/store/__tests__/useStore.test.ts` (store actions,
AsyncStorage mocked), plus the older `engines`, `curriculum`, `planUpdate`, `standards`,
`sync`, `notifications`, `worksheet` tests; server `supabase/tests/compass.test.ts`
(plus `cloud.test.ts`); e2e `e2e/compass-kid.mjs`, `e2e/compass-records.mjs` (local-only,
shared seed in `e2e/compass-helpers.mjs`), `e2e/compass-cloud.mjs` (accounts), plus
`scenarios.mjs`, `onboarding.mjs`, `cloud.mjs`.

| Feature | Covered by | Known gaps |
| --- | --- | --- |
| Dates (DST, leap days, school year, day stepping) | compass-schedule: *dates* | Time zones other than the machine's |
| Onboarding: family, kids, quiz, results | scenarios.mjs *Onboarding*, onboarding.mjs; compass-onboarding: *style quiz*, *recommended rhythm* (no parent or child double-booking for 1–4 kids × every style); useStore: *completeOnboarding* | ZIP → state picker UI edge cases beyond the lookup table |
| Rhythm → daily tasks, block edits | compass-schedule: *rhythm → tasks*; useStore: *ensureTasks*, *editing a block re-plans…*, *removing a block…*; scenarios *Rhythm builder* | |
| Parent conflicts + auto-stagger | compass-schedule: *parent conflicts*, *auto-stagger* (done work, groups, end of day, solo push, 3 kids); useStore *staggerDay*; compass-kid *Flight Deck: conflict*; scenarios | Stagger across a lunch break (no notion of breaks) |
| Gentle bump + targets | compass-schedule: *gentle bump*, *bump targets*; useStore *bumpDay*; compass-kid *Gentle bump*, *Bump with no school days (regression)*; compass-cloud *Concurrent offline edits* | |
| Help queue (+ while-you-wait) | useStore *help queue*; compass-schedule *timeline + help queue filler*; compass-kid *Help queue*, *Grown-up exit*; compass-cloud *Kid mode is per device…* | |
| Curriculum pacing | compass-schedule *pacing* (not started/ahead/on track/behind/done, breaks, no school days); engines | Pace past the target end date shows the whole remainder as one day (product question) |
| Lesson-by-lesson plans, versions, plan updates | compass-onboarding *lesson-by-lesson plans*; planUpdate, curriculum tests; useStore *updatePlan…* | Plan-update UI (covered by studio/insights e2e, not here) |
| Kid mode: picker, kid + parent PINs | compass-kid *Kid picker + PINs*, *Grown-up exit*; scenarios *Kid mode* | PIN brute-force throttling (none exists) |
| Kid mode lock (no parent screens by URL/deep link, no other kid's day/mission) | compass-kid *Kid lock* (regression), compass-records *Kids are never in the records* | Native deep links (web only here) |
| Missions: steps, timer, tricky, sparks, reflections | useStore *kid missions…*; compass-kid *Mission: steps, tricky…* (blank reflection = +10, regression); compass-cloud (tricky syncs) | Pomodoro end-of-timer speech |
| Days: past, upcoming, start early | useStore *working ahead*; compass-kid *Days: looking back*, *Days: start early* | |
| Worksheets + answer key hiding | compass-records *answer keys stay with the grown-ups* (per-version answers); worksheet tests; compass-kid *lesson card hides the answer key*, *Answer key for grown-ups* | |
| Compliance radar (notice, days, hours, testing, subjects, portfolio) | compass-records *compliance radar* (CO, TX, PA, AK; logic now in `src/lib/compliance.ts`); e2e compass-records | Only the hand-compiled state table is tested, not its legal accuracy |
| State law directory, ZIP lookup, standards coverage | compass-records *state law directory*, *standards coverage*; standards tests | |
| Hours & attendance | compass-records *hours & attendance*; useStore *records*; compass-records e2e *Hours* | |
| NOI, evaluator packet, expense report (escaping, totals) | compass-records *Notice of Intent*, *evaluator packet & expense report*; compass-records e2e *NOI: sign, mail, unsign*; scenarios *Records* | PDF rendering on native |
| Expenses, ESA award, portfolio | useStore *records*; scenarios *Records: expenses/portfolio* | Receipt upload to storage from the app (server side covered in compass.test.ts) |
| Settings (children, school days, PIN) | useStore *settings: children* (remove child clears help/moods/curriculum seats, regression); compass-kid *Removing a child…*; scenarios *Settings* | |
| Backups (export/import/reset) | useStore *backups* (rejects malformed files, regression); compass-kid *Backups* | Very old backup versions |
| Account + family (create, invite, join, leave) | compass.test.ts *creating a family*, *invites*, *leaving*; compass-cloud *First device*, *Second parent joins*, *Erase…sign back in* | Invite expiry after 7 days (can't age rows from the client) |
| Workspace sync RLS + versioning | compass.test.ts *workspace sync* (stale pushes, non-object workspaces rejected — regression, no direct writes, outsiders/anon), *the family row* (owner/creation date locked — regression) | Realtime channel authorization; 8 MB size limit |
| Merge (multi-device, offline) | compass-onboarding *multi-device merge* (finished work keeps its day when another device bumped it — regression); sync tests; compass-cloud *Concurrent offline edits merge*, *Removing a child reaches every device*; cloud.mjs | Three or more devices editing the same record at once |
| "Which family?" on a device that has one | compass-cloud *A device that already has its own family…* | "Upload this device's family" branch |
| Family media storage | compass.test.ts *family media* | |
| Notifications from this device (help, trips, plan updates) | compass-onboarding *notifications from this device*; notifications tests; scenarios *Notifications* | |

Bugs these tests found (all fixed, each with a regression test):

1. Kid mode could reach Settings, Account, onboarding, Studio, the marketplace and other parent screens by URL, and open another kid's day or mission without their PIN (`src/app/_layout.tsx` now guards those routes with `Stack.Protected`; the kid screens check whose session it is).
2. Removing a child left their open help request in the parent's queue forever (a nameless "needs help"), plus their check-ins and curriculum seats (`removeChild`).
3. Importing a malformed backup (`{"tasks":"x"}`, or not JSON) replaced everything and broke every screen, or showed a raw JSON error (`importData` now validates).
4. With no school days set, "Bump remaining → Only tasks from now on" crashed the Flight Deck.
5. A blank reflection showed "+15 Sparks" but awarded 10.
6. Work a kid finished offline while a parent bumped it on another device was filed under the bump's day (hours on a future date) after the merge (`mergeWorkspace`).
7. Server: family members could rewrite `families.created_by` / `created_at`, and `push_workspace`/`create_family` accepted non-object workspaces (migration `20261115000010_compass_fixes.sql`).

## Marketplace & payments

**Run:**

```bash
npx vitest run                                    # unit: marketplace.test.ts, pricing.test.ts, market.test.ts, payments.test.ts, library*.test.ts
node --env-file=.env.local ./node_modules/.bin/vitest run --config vitest.cloud.config.mts supabase/tests/market.test.ts   # server (local Supabase)
EXPO_PUBLIC_FREERANGE_LOCAL_ONLY=1 npx expo start --web --port 8093
BASE_URL=http://localhost:8093 node e2e/market-local.mjs && BASE_URL=http://localhost:8093 W=390 H=844 node e2e/market-local.mjs
npx expo start --web --port 8094
BASE_URL=http://localhost:8094 node e2e/market-cloud.mjs && BASE_URL=http://localhost:8094 W=390 H=844 node e2e/market-cloud.mjs
```

Server tests make their own users, families, creators, listings, and coupons per run. They use `docker exec … psql` (as in `moderation.test.ts`) for the service-role-only functions the payment webhook calls (`checkout_record`, `settle_order`) and to set up timing for the overlapping-checkout test. `market-cloud.mjs` rewrites checkout's return address to `http://localhost:8081` (the allowed dev origin), because the app runs on another port.

| Feature | Covered by | Known gaps |
| --- | --- | --- |
| Catalog loading, local | `market-local.mjs` *Browse* (Library catalog banner, all 48 curricula); `library.test.ts`, `libraryIntegrity.test.ts` (catalog matches lesson files) | Loading failure banner when the live catalog can't be reached isn't tested |
| Catalog loading, cloud | `market.test.ts` *catalog* (anon sees every Library listing with title, seller, lessons, version, license, grades; release lesson counts match); `market-cloud.mjs` *Live catalog* (no local banner, new creator listing and sale price appear) | 1000-listing page limit in `refreshMarketplace()` |
| Search, subject chips, filters, sort | `marketplace.test.ts` *search and filters*, *sorting* (multi-word, case, sale-aware price bands, used/new by seller kind, empty filters, ties, input not mutated); `market.test.ts` (unit, existing); `market-local.mjs` *Browse*, *Filters and sorting* (empty state + clear, filter count chip, ESA, rating, price) | Grade filter for a family with no kids |
| Matching ("Best match") | `marketplace.test.ts` *matching a family* (style share, kids at level, family-style bonus only for 2+ fitting kids, unknown grade labels); `market-local.mjs` ranking text | — |
| Free & open curricula: build & seed integrity | `libraryIntegrity.test.ts` (every DB column limit, subjects/styles known, unique keys/titles, loaders = content files, seed has every listing + release as upserts, seeded release JSON equals the app's lessons); `library.test.ts` (existing); `market.test.ts` *catalog* (live DB matches catalog.json, nobody but the seed can add or edit `open` listings) | The seed isn't re-applied by the tests: after `npm run library:gen`, load `supabase/seed.sql` or the catalog test fails (on purpose) |
| Free & open: attribution, licenses | `libraryIntegrity.test.ts` (license evidence recorded, only PD/CC0/CC BY/CC BY-SA, CC version present, credit names author, source title, URL, and Freerange; plan carries the same credit); `market-local.mjs` *Listing page* (license card, credit line, source link, "not affiliated") | — |
| Free & open: links well-formed | `libraryIntegrity.test.ts` *Library links* (https, real host, no whitespace or credentials, labelled, no duplicates per lesson) | Links aren't fetched (no network in tests), so dead links aren't caught |
| Listing page | `market-local.mjs` *Listing page* (outline expand/collapse, facts, no storefront for open curricula, report needs an account, unknown id); `market-cloud.mjs` (storefront link, sale note, bundle card) | — |
| Claim free | `market.test.ts` *claiming free curricula* (needs account + family, unknown id, idempotent, paid refused, purchases server-written and private); `market-local.mjs` *Claim* (no coupon/payment UI, recorded free, no expense) | — |
| Demo checkout (local) | `pricing.test.ts`, `marketplace.test.ts` *pricing edge cases* (the same `quote()` the demo checkout uses) | No UI path to a paid listing without an account (the Library is free and your own listings can't be bought), so the demo paid checkout itself isn't exercised end to end |
| create-checkout pricing | `market.test.ts` *checkout* (401/400s, bad funding, non-string ids/coupons, look-alike return URL, unknown listing, client-sent price ignored, already-owned not charged twice, paid plans locked); `market-cloud.mjs` (server price + coupon in UI); `payments.test.ts` *checkout return addresses* | Real Stripe session creation (needs `STRIPE_SECRET_KEY`) |
| Sales | `market.test.ts` *family sellers* (family seller's sale, 90% cap even via direct update, ending a sale); `coop_gifts.test.ts` (existing: seller-only, limits, survives republish); `marketplace.test.ts` (exact end time, rounding) | A family seller can set `sale_ends_at` more than a year out by writing the row directly (only their own listing) |
| Bundles | `market.test.ts` *bundles* (own active listings only, no duplicates/removed/others', price rule on edit, charges only what's missing, listing-bound coupon refused, unpublished items dropped, deleted bundle unbuyable); `marketplace.test.ts` (suspended items, totals split to the cent); `market-cloud.mjs` *Bundle skips what you have* | Setting a bundle to `removed` by update fails once one of its curricula is unpublished (the app deletes bundles instead) |
| Coupons incl. abuse | `market.test.ts` *coupons* (negative/0/>100%/bad code/too long/bad kind/0 uses/someone else's listing/duplicate; use count and owner can't be changed; wrong curriculum, wrong shop, inactive, unknown, expired; fixed > price → free, never negative; used up; **simultaneous checkouts** and **overlapping DB transactions** can't exceed max uses); `marketplace.test.ts` (client mirror of every rule); `market-cloud.mjs` (unknown, expired, applied, used up — messages shown) | A code entered on a $0 order still uses one of its uses (roadmap inbox) |
| stripe-webhook settlement | `payments.test.ts` (signature: valid, rolled secrets, changed payload, wrong secret, malformed, replay window; event → settlement mapping); `market.test.ts` *payment settlement* (service-role only; pending stays locked; paid unlocks once; late "expired" can't undo; expiry cancels and returns the coupon use once; whole bundle order settles; session that never started; pending gift claimable only after payment; live endpoint ignores unsigned/forged events) | Signed events can't reach the running function locally (no `STRIPE_WEBHOOK_SECRET` in the dev stack), so the HTTP path with a valid signature is covered by the unit tests only. Async payment events aren't handled (roadmap inbox) |
| Gifts (codes, family-targeted, revoke) | `market.test.ts` *gifts* (account + family, own email/family, unconnected family, recipient choice, note length, paid via send_gift refused, family-only claim, idempotent re-claim, already-owned stays ready, email gift claimable by code holder, giver-only take back, paid gifts not revocable, checkout gifts never ESA and no copy for the giver); `coop_gifts.test.ts` (existing); `marketplace.test.ts` *gift codes*; `market-local.mjs` *Gifts* (take back, dead code, bad link); `market-cloud.mjs` *Paid gift* (expense for giver only, waiting for recipient, claimed status) | Gift emails aren't sent yet (by design) |
| Creator storefronts, follows | `market.test.ts` *storefronts* (public profiles, private follows, no self/anon/spoofed follows, follower count); `creators.test.ts` (existing); `market-cloud.mjs` *storefront* (follow, "Creators you follow") | — |
| Badges, ESA (DB-enforced) | `creators.test.ts` (existing: can't self-grant on profile or listings, moderator approve/revoke, name change drops badge); `market.test.ts` (family can't list as `open`/`creator`) | — |
| Reviews: verified purchase | `market.test.ts` *reviews* (anon/outsider/other-family refused, field limits, one per family, verified derived, re-derived after buying); `market-local.mjs` *Review it*; `market-cloud.mjs` *Verified review* | Review written before buying stays unverified until edited (roadmap inbox) |
| Reviews: progress | `market.test.ts` (typed-in progress ignored, derived from the workspace's furthest kid, hidden when opted out); `marketplace.test.ts` (messy plan data); `market.test.ts` unit (existing) | — |
| Reviews: hide, rating, sorting | `moderation.test.ts` (existing auto-hide/restore); `market.test.ts` (rating follows edits/deletes, review can't be moved); `marketplace.test.ts` *reviews* (sort ties, verified tie-break); `market-local.mjs` (star filter chips, every sort, edit, delete) | — |
| Helpful votes | `market.test.ts` (one per person, server-counted, private, unvote, no anon, no voting as someone else, **no voting for your own review**); `market-cloud.mjs` (vote count in UI) | — |
| Selling used items | `market.test.ts` *family sellers* (every column check, own family only, edits keep the family, others can't edit, own listing unbuyable, removed listing hidden but purchase kept); `marketplace.test.ts` *selling* (`listingIssues` limits); `market-local.mjs` *Sell* (limits shown, initial-only name, edit, used filter, can't buy/review/gift own, remove) | Cloud sell form error display (covered by code review only) |
| Moderation of listings/reviews | `market.test.ts` *moderation* (Library listings reportable, long details trimmed, 3 reports suspend a listing: hidden, unclaimable, unquotable, ungiftable, plan locked, dropped from bundles, not bundle-able; takedown survives republish and unpublish+republish); `moderation.test.ts` (existing: queue, copyright, review auto-hide, seller can't undo); `market-cloud.mjs` (report a review) | — |
| Purchases → expenses | `market-cloud.mjs` (paid purchase = one expense with funding tag and amount after coupon; no duplicate after refresh; gift expense for giver only, none for recipient; bundle item expense); `market-local.mjs` (free claim adds none) | Expense dedupe across two devices (roadmap inbox) |

**Bugs found and fixed with these tests:**

- A coupon's last use could be taken by two checkouts at once (`checkout_record` checked `max_uses` and counted the use in separate steps). Fixed in `20261115000011_market_fixes.sql`; proven by `market.test.ts` *can't be used twice by two checkouts that overlap in the database* and *…buying at the same moment*.
- Reviewers could vote their own review helpful, and votes were accepted for reviews moderators had hidden. Fixed in the same migration (`can_vote_review()`).
- Checkout never showed why a coupon was refused: the error was cleared as soon as the price without the coupon loaded (`CheckoutSheet`). Proven by `market-cloud.mjs` *unknown / expired / used-up coupon refused*.
- The sell form let families publish listings the live marketplace rejects (over 2,000 lessons, 480 minutes, $10,000, long titles or descriptions), and a refused save left the form spinning with no message. Now `listingIssues()` checks the limits and the form shows the server's error. Proven by `marketplace.test.ts` *selling a used curriculum* and `market-local.mjs` *Sell*.

## Studio & Community

How to run: `npx vitest run` (unit), `node --env-file=.env.local ./node_modules/.bin/vitest run --config vitest.cloud.config.mts` (server, local Supabase),
`BASE_URL=http://localhost:8095 node e2e/studio_community-local.mjs` against `EXPO_PUBLIC_FREERANGE_LOCAL_ONLY=1 npx expo start --web --port 8095`, and
`BASE_URL=http://localhost:8096 node e2e/studio_community-cloud.mjs` against `npx expo start --web --port 8096`. Run each e2e file again with `W=390 H=844` for phone size.
The cloud e2e answers `fetch-page` from the unit-test fixtures (request interception), so every web-import parser runs in the real screens without the internet.

Unit = `src/lib/__tests__`, server = `supabase/tests`, e2e = `e2e`.

| Feature | Covered by | Known gaps |
| --- | --- | --- |
| Setup / creator profile | unit: —; server `studioCommunity` › creator profiles (public, one per account, 2–60 chars, http(s) website, no writing someone else's); e2e `studio_community-local` › Creator profile (1-letter name, bad website), `studio.mjs` › Creator onboarding, `studio_community-cloud` › Creator account | Profile name change dropping the verified badge is only covered in `creators.test.ts` |
| New from scratch | e2e `studio.mjs` › Create from scratch | — |
| Table-of-contents import | unit `studioImportEdge` › table of contents (unit words, markdown headings, sub-numbering, tabs, CRLF, dot leaders, label numbers, written ranges, pages-per-lesson split, last page, links), `studio.test.ts`; e2e `studio_community-local` › Book with chapters only, `studio.mjs` › Convert a book | OCR/Live Text tips are device-only |
| Spreadsheet import | unit `studioImportEdge` › spreadsheet import (TSV, blank unit cells, minutes 1–480, pages clean-up, labelled links, blank answers, level/theme columns, standards, header-less sheets, quoted CSV); e2e `studio_community-local` › Spreadsheet with versions, answers and standards, `studio.mjs` › Spreadsheet import | “30 min” in a Minutes cell is ignored rather than read as 30 |
| CSV export round trip | unit `studioImportEdge` › CSV export → import (semicolons/bars in one item, formulas, quotes, tabs, empty plan, file names), `planExport.test.ts`; e2e `insights.mjs` › Export / CSV imports back, `studio_community-local` › Export | A theme named “Easy”, “Hard” or “Student” collides with the level/main-lesson column names on re-import |
| Export PDF | unit `studioImportEdge` (teacher’s guide escapes all lesson text), `planExport.test.ts`; e2e `insights.mjs`, `studio_community-local` › Export | The printed PDF itself isn’t inspected on the web |
| Web import: generic page | unit `studioWebEdge` › generic course page (fixture `generic-course.html`: nav/aside/footer, social/mail/script links, see-also/references, dedupe, Dropbox links, title/author/license, 60×200 cap, `lessonHref`); e2e `studio_community-cloud` › a course page | — |
| Web import: Gutenberg | unit `studioWebEdge` › Project Gutenberg (fixture `gutenberg-book.html`), `studio.test.ts`; e2e `studio_community-cloud` › Project Gutenberg (book page → whole book) | — |
| Web import: archive.org scans | unit `studioWebEdge` › archive.org scans (fixture `archive-scan.json`, 1930 rule, offsets); e2e `studio_community-cloud` › an archive.org scan (record → pasted contents → page links) | — |
| Web import: YouTube | unit `studioWebEdge` › YouTube (hosts, list ids, private/deleted/repeats, even chunks, 100-video warning), `webImport.test.ts`; e2e `studio_community-cloud` › a YouTube playlist | Playlists past 100 videos need pasting (by design) |
| Web import: Pressbooks | unit `studioWebEdge` › Pressbooks (front/back matter, loose chapters, chunking, license statement, chapter page → book, failed follow-up), `webImport.test.ts`; e2e `studio_community-cloud` › Pressbooks | Per-chapter licenses are only warned about |
| Web import: LibreTexts | unit `studioWebEdge` › LibreTexts (broken outline, numeric order, mixed/unknown licenses, subdomain rule, empty outline fallback), `webImport.test.ts`; e2e `studio_community-cloud` › LibreTexts (two-step load) | — |
| Web import: Wikibooks / Wikiversity | unit `studioWebEdge` › Wikibooks, `webImport.test.ts`; e2e `studio_community-cloud` › Wikibooks (print version button) | — |
| Web import: JSON-LD | unit `studioWebEdge` › schema.org JSON-LD (fixture `jsonld-course.html`, short license names, authors, ItemList order, broken JSON); e2e `studio_community-cloud` › Publish a schema.org course | — |
| Web import: nested lists | unit `studioWebEdge` › nested lists (fixture `nested-outline.html`); e2e `studio_community-cloud` › nested lists | — |
| Web import: script-built warning | unit `studioWebEdge` › pages built by scripts (fixture `script-built.html`); e2e `studio_community-cloud` (warning + pasted outline) | — |
| Licenses & publish rules | unit `studioPublishRules` (every badge/written form, names/deeds, every origin × license, confirmation, lock, credit lines, missing pieces, NC price); server `studioCommunity` › license rules can’t be bypassed (mislabelled origin, ND, unknown/PD originals, empty plan, NC free, listing takeover, unpublish by others), `studio.test.ts`; e2e `studio_community-local` › Publish rules (ND blocked, NC free + confirm, “Not sure”), `studio_community-cloud` (locked license, server publish) | — |
| Publishing, versions, release notes | server `studioCommunity` › releases (public outline only, blank note not stored, note per release, cleared from draft, unpublished free listing, stats), `studio.test.ts`; e2e `studio.mjs`, `cloud.mjs` › Studio (cloud) | `cloud.mjs` needs port 8081 (checkout return origins), so it can’t run on 8096 |
| Answer keys | unit `studioPublishRules` (answers travel with questions); server `studioCommunity` (answers only via `package_content`); e2e `studio.mjs` › Answer key for grown-ups, `studio_community-local` (blank answers kept) | — |
| Easier/harder versions & themes | unit `studioPublishRules` › versions and themes, `versions.test.ts`; e2e `insights.mjs`, `studio_community-local` (spreadsheet versions in the editor) | — |
| Standards tagging | unit `communityLib` › standards tags, `standards.test.ts`; e2e `insights.mjs`, `studio_community-local` (label shown in the editor) | Only Common Core strands are recognized (by design) |
| Insights (privacy minimum, opt-out) | unit `communityLib` › Studio Insights privacy, `insights.test.ts`; server `studioCommunity` › insights, `insights.test.ts`; e2e `insights.mjs`, `studio_community-local` › Insights without an account | — |
| Co-op classes | unit `communityLib` › co-op classes, `coop.test.ts`; server `studioCommunity` › co-op classes (codes, teacher-only roster/settings, progress clamping, name stripping, full class, delete, ND/unconfirmed sources), `coop_gifts.test.ts`; e2e `coop_gifts.mjs` (local), `studio_community-cloud` › Co-op class with a typed code (lower case + dash, roster, remove) | A removed family can rejoin with the same code until the teacher makes a new one |
| fetch-page (address checks, pinning, rate limits) | unit `fetchPageEdge` (trailing dots, IP spellings, ports, pinning, chunked, charsets), `fetchNet.test.ts`; server `studioCommunity` › page fetch limits (21st request in a minute → 429, bad input not counted), `fetchLimits.test.ts`, `studio.test.ts`; e2e `studio_community-cloud` (429 and failure messages) | DNS rebinding and TLS are only covered by code review (needs a live resolver) |
| Family finder | unit `communityLib` › family finder; server `studioCommunity` › profiles and the family finder (private rows, bands only, hidden profiles, far ZIPs, anon), `cloud.test.ts`; e2e `scenarios.mjs` › Community (local), `studio_community-cloud` | Distance falls back to ZIP prefixes without ZCTA data |
| Connections & contact sharing | server `studioCommunity` › connections (send as yourself, pending only, no re-pointing a request, contacts after accept only, removal, declines), `cloud.test.ts`; e2e `studio_community-cloud` › declined request, connecting | — |
| Field trips / RSVP / carpool | server `studioCommunity` › field trips (host-only edits, server-set names, carpool names, full trip, moving an RSVP, past trips, cancel), `cloud.test.ts`; e2e `scenarios.mjs`, `cloud.mjs`, `studio_community-cloud` › A full field trip | — |
| Meetup safety tips | unit `communityLib` (content); e2e `scenarios.mjs`, `cloud.mjs` (shown before the first RSVP) | — |
| Co-ops (community) | server `studioCommunity` › co-ops (names from profiles, membership can’t move families), `cloud.test.ts`; e2e `scenarios.mjs`, `cloud.mjs` | — |
| Messages (connected-only, block, report, rate limits) | server `messages.test.ts`, `studioCommunity` › messages and verification (family/profile needed, bad ids); e2e `cloud.mjs` › Messages, `studio_community-cloud` (send, block, blocked side can’t write) | The 200-a-day limit isn’t exercised (only the per-minute one) |
| Kid mode never shows messages / community / Studio | e2e `studio_community-local` › Kid mode stays in kid mode (/community, /messages, /notifications, /studio, /coop), `studio_community-cloud` › Kid mode | Settings, account, moderation, listing, gift and creator pages have no kid-mode guard (outside this area) |
| Verified family badge | server `messages.test.ts`; e2e `cloud.mjs` › Moderation | — |
| Notifications | unit `communityLib` › notifications, `notifications.test.ts`; e2e `scenarios.mjs` › Notifications, `cloud.mjs` | — |

Bugs these tests found and fixed (migration `20261115000012_studio_community_fixes.sql` for the SQL ones):

- A package row labelled `original` whose content was a book conversion (or a no-derivatives adaptation) could be published or made into a co-op class: `origin_kind` now follows the content.
- The recipient of a connection request could re-point it at any other family and “accept”, getting their contact details and messaging them. Only the answer can change now.
- A family could move its RSVP onto a full or past trip, or rename itself on the RSVP list; co-op join requests and field trips took the family’s name from the client, and an organizer could move a membership to another family.
- A JSON-LD license named “CC BY-NC-SA 4.0” was read as plain CC BY (so non-commercial courses could be sold).
- Links to dropbox.com, box.com, netflix.com… were dropped as if they were x.com.
- CSV export split a single step/question/answer containing “;” or “|” into several on re-import.
- HTML entities were decoded twice (`&amp;lt;` became `<`) and emoji entities came out garbled; titles taken from `<h1>` kept their tags.
- A whole book on one page warned that sections were left out; a copyrighted Gutenberg book lost the “no license” warning.
- fetch-page accepted `localhost.` / `intranet.` (trailing dot) before the DNS check.
- Studio and co-op invite links opened in kid mode.
- Asking a family to connect again after they declined showed a raw database error.

### Studio & Community UX review (SC-xx)

Files: unit `src/lib/__tests__/studioCommunityUx.test.ts`; server `supabase/tests/studioCommunityUx.test.ts`
(migration `20261116000400_studio_community_ux.sql`); e2e `e2e/ux-studio_community.mjs` (local-only, in `test:e2e` at
both sizes) and `e2e/ux-studio_community-cloud.mjs` (accounts, in `test:e2e:cloud` at both sizes). Each e2e check is
labelled with its finding id.

| Finding | Covered by | Known gaps |
| --- | --- | --- |
| SC-04 publish confirms; no empty "Publish update"; release note only with changes | unit *SC-04* (`publishAction`, `hasUnpublishedChanges`, server `+00:00` times, `upsertPackage(p, false)`); e2e local *Publish*, cloud *SC-04* (also after reloading from the account) | — |
| SC-05 report / block a family from the finder and requests; "Decline and block"; "On Freerange since"; blocked-families list | server *SC-05* (report rules, moderator queue, hide/restore + notices, owner can't unhide, `my_blocks`, `member_since`); unit *SC-05*; e2e cloud *the finder*, *a request* | Moderators act on families in the existing queue (no separate profile view) |
| SC-06 Studio home: continue editing first, compact New, teach & sell below | e2e local *Creator-only Studio* (order, header button, no sales card before publishing) | — |
| SC-08 / SC-03 lesson sheet folded into sections, Save pinned; paste sheet asks before discarding | e2e local *Lessons tab* | Still a sheet, not a full-screen route on phones |
| SC-09 grade steppers, siblings switch, "Lessons per week" | e2e local *Details tab* | — |
| SC-10 Private pill; Use tab explains family setup | unit *SC-10*; e2e local *Creator-only Studio* | — |
| SC-11 dropped spreadsheet rows reported | unit *SC-11*; e2e local *Spreadsheet and web import* | Row numbers skip blank lines |
| SC-12 Gutenberg/archive.org mentioned, 📖, license named once, empty scan record | unit *SC-12*; e2e local (subtitle), cloud *SC-12* | — |
| SC-13 Copy link / Copy code on web | e2e local *Co-op class* (clipboard contents) | Native keeps the Share sheet |
| SC-14 class settings: switch + one Save, primary "New code", End in its own section | e2e local *Co-op class* | — |
| SC-15 field-trip start time and details, "Ages: all", no "TBD" | unit *SC-15*; server *SC-15*; e2e local *Preview field trip*, `studio_community-cloud` / `scenarios` (time required) | — |
| SC-16 connected families not repeated, count, Show more, Verified card first | unit *SC-16*; e2e cloud *the finder* | — |
| SC-18 / SC-19 thread ⋯ menu, long-press report, blocked banner | e2e cloud *messages* | Right-click on web isn't wired (long-press and the menu are) |
| SC-20 notifications: New/Earlier, no per-row Mark read, labelled dot | unit *SC-20*; e2e local *Notifications*, cloud *messages*, `scenarios` › Notifications | No swipe-to-read |
| SC-21 reorder arrows 44 pt | e2e local *Lessons tab* | — |
| SC-23–SC-29, SC-31–SC-33 copy and layout | e2e local (each labelled), cloud (SC-31, SC-32); unit *SC-23*, *SC-26*, *SC-28* | — |
| SC-30 moderation shows nothing until access is known | e2e local and cloud *Moderation* | — |

## Shared UI foundations (design review)

The cross-cutting fixes from the UI/UX review live in the shared components, so they are
tested once here rather than per screen. Files: unit `src/lib/__tests__/contrast.test.ts`,
`nav.test.ts`, `draft.test.ts`, `accountCopy.test.ts`; e2e `e2e/ux-foundation.mjs`
(local-only build, desktop and 390×844, part of `npm run test:e2e`).

| Feature | Covered by | Known gaps |
| --- | --- | --- |
| Text contrast ≥ 4.5:1 (Pill tones, ModeBadge, Chip, Button kinds, ink tokens, discard bar, state tier pills) in light and dark | unit `contrast` (every pair, both palettes; WCAG reference values) | Placeholders are deliberately lighter (≥ 2.5:1, below helper text) so empty fields don't look filled; screen-specific one-off colors aren't enumerated |
| Inputs named for screen readers (`Field` label → aria-label, hint → aria-describedby), "e.g." example placeholders in a lighter color | e2e `ux-foundation` › *Inputs are named* (family step, add-child sheet, Notice of Intent, hours) | The cloud sign-in form is only on the cloud build (same `Field`) |
| "Still needed" reason under the button row (`Actions`), Cancel stays visible | e2e `ux-foundation` › *"Still needed" stays on screen* (sell sheet: inside the viewport, not clipped, on its own line, Cancel on screen) | Other sheets use the same `Actions` but aren't measured one by one |
| Back from deep links (`HeaderBack`: history, else the parent route) | unit `nav` (every route family, query/hash/trailing slash, fallback); e2e `ux-foundation` › *Back from deep links* (listing, gift, bundle, storefront, studio page, studio, account, NOI, notifications: label, 44 px, lands on the parent; in-app push goes back normally) | Native header (iOS/Android) not exercised here |
| Roles, states and 44 px hit boxes (Chip checkbox/radio + aria-checked, Segmented tablist/tab + aria-selected, small buttons, tappable cards) | e2e `ux-foundation` › *Chips and tabs* (marketplace filters and tabs, "＋ Task", Today task cards) | Screen-specific pressables (mission cards, stars) are left to their screens |
| Delete asks first (`ConfirmButton`), unsaved-changes guard (`Sheet dirty`) | unit `draft` (draft comparison ignores key order/undefined, catches edits); e2e `ux-foundation` › *Delete a task asks first*, *Lesson sheet: discard and delete* (untouched closes, edits ask on ✕ and backdrop, keep editing, discard doesn't save, cancel keeps the lesson, Delete apart from Save) | No undo toast: deletes are confirmed instead |
| Device-only build never says "Sign in" (`AccountNote` / `needsAccount`) | unit `accountCopy`; e2e `ux-foundation` › *Local build never says "Sign in"* (Studio, classes, promotions, community, messages, marketplace, settings, storefront; no dead-end storefront link; preview connect says nothing was sent); `market-local` (report sheet), `scenarios` (preview community) | The cloud build's wording is only checked by the existing cloud suites |

## Marketplace design review (MKT-01…MKT-32)

The per-screen fixes from the Marketplace UI/UX review. Files: unit `src/lib/__tests__/marketView.test.ts`
(Filters counts, empty-state cause, sorts, labels, credit link, bundle savings vs today's prices, library groups,
followed creators, bundle cap, number-field errors, optional lesson numbers) plus updated `pricing.test.ts`;
server `supabase/tests/marketUx.test.ts` (migration `20261116000300_market_ux.sql`); e2e `e2e/ux-market.mjs`
(local-only build, part of `npm run test:e2e`) and `e2e/ux-market-cloud.mjs` (accounts, part of
`npm run test:e2e:cloud`), each at 1280×900 and 390×844. Every e2e check is labelled with its finding id.

| Finding | Covered by | Known gaps |
| --- | --- | --- |
| MKT-01 refused coupon stays until the code is edited, `role="alert"` | `ux-market-cloud` *Listing and checkout*; `market-cloud` (unknown/expired/used up) | — |
| MKT-02 deep links get "‹ Marketplace" | `ux-market` *Deep links*; `ux-foundation` | — |
| MKT-03 used curricula: photos (public `listing-photos` bucket, paths only), "Message the seller" without a Community connection, seller replies, block/report, no contact details, "Next: arrange pickup" | server `marketUx` (message_seller rules, replies, blocks both ways, reports, removed listings, photo paths/folders/limit, pickup area); `ux-market` *Sell sheet* (photo on device); `ux-market-cloud` *A family sells…*, *Buyer messages the seller*, *After getting it* | Native image picker; carousel swiping on touch devices |
| MKT-04 short Browse header, dismissible note (remembered), sort in one chip | `ux-market` *Browse header* (first result position on phones) | — |
| MKT-05 Filters: pinned full-width "Show N curricula", counts, dimmed dead ends, no Rating without reviews | unit *option counts*; `ux-market` *Filters* | — |
| MKT-06 empty state by cause (search / grades / filters), nearby subjects, no ranking line over 0 | unit *empty results say why*; `ux-market` *Empty results* | — |
| MKT-07 "Still needed" under the buttons, pinned sheet footers | `ux-market` *Sell sheet*; `ux-foundation` | — |
| MKT-08 two-step sell form, no preset grades, inline number errors, pickup area, shipping, optional lesson numbers (buyer sets them in Add to plan) | unit *small helpers*; server `marketUx`; `ux-market` *Sell sheet*; `market-local` *Sell* | — |
| MKT-09 free curricula claim in one tap, Add to plan footer pinned | `ux-market` *Free claim*; `market-local` *Claim* | — |
| MKT-10 "Every lesson links to the free text" finish, upload button fits its card | unit *lessons that already link*; `ux-market` *Free claim* | — |
| MKT-11 Copy link / Copy code (and `navigator.share`), recipient email with a mail link | `ux-market` *Gift codes* (clipboard read back) | `navigator.share` isn't available in headless Chrome |
| MKT-12 gift page shows what the gift is; claimed/invalid states have next steps | `ux-market` *Gift codes* | — |
| MKT-13 bundle savings against today's prices, under 5% not shown | unit *bundle savings*, `pricing`; `ux-market-cloud` | — |
| MKT-14 / MKT-31 "Track this expense as", renamed options, "?" explainer, ESA caption for non-vendors | `ux-market-cloud` *Listing and checkout*; `market-cloud` | — |
| MKT-15 dark-mode chip contrast | `ux-market` *Dark mode*; unit `contrast` | — |
| MKT-16 listing/bundle cards read as one sentence, stars are a radio group | unit *listing labels*; `ux-market` *Cards…*, *Reviews* | — |
| MKT-17 no report/storefront dead ends; signed-out "Sign in to report" | `ux-market` *Listing page*; `ux-market-cloud` *Signed out* | — |
| MKT-18 storefront bundles, Follow on the name row, what following does, "From creators you follow" in Browse, no repeated seller line | unit *creators you follow*; `ux-market-cloud` *Storefront* | — |
| MKT-19 two bundles above the results ("See all N"), sideways on phones | unit *bundles above the results*; `ux-market-cloud` *Bundles above the results* | — |
| MKT-20 license named once, credit link is a real link | unit *license card* (every Library credit line); `ux-market` *Listing page* | — |
| MKT-21 no "No reviews yet" on cards; rating sorts hidden until reviews exist | unit *sorts that need reviews*; `ux-market` *Browse header* | — |
| MKT-22 "📖 Free online text" for free & open classics | unit *listing labels*; `ux-market` | — |
| MKT-23 report at the bottom of the listing | `ux-market-cloud` *Listing and checkout* | — |
| MKT-24 review sort/filters from 5 reviews | `ux-market` *Reviews*; `market-local` *Review it* | — |
| MKT-25 "Used with" names the child (only the grade is published), pre-selected from the plan | `ux-market` *Reviews* | — |
| MKT-26 one set of teaching-style labels | `ux-market` *Sell sheet* | — |
| MKT-27 owned items in a bundle show "✓ Owned", actions inside the card | `ux-market-cloud` *Bundle with something owned* | — |
| MKT-28 sticky buy box on wide web, no duplicate title | `ux-market` *Listing page* | Header uses "Curriculum" (the back button already says "Marketplace") |
| MKT-29 three-line card titles, 3 columns only from 1400 px | `ux-market` *Browse header* (desktop) | — |
| MKT-30 family-style books suggest siblings, no "✓ time" echo | `ux-market` *Free claim* | — |
| MKT-32 My library grouped (Not started / Gifts / In your plan), own header | unit *My library groups*; `ux-market` *My library* | — |

Bug found while doing this: claiming a first gift from My library reset the Gifts panel (the library's
layout changed around it), so the "is in your library" message vanished. Fixed in `market.tsx`; proven by
`market-cloud.mjs` *Paid gift to another family*.
