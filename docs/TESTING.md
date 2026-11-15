# Testing Freerange

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
