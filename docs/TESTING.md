# Testing

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
