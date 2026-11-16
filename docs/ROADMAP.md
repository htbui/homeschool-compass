# Freerange Roadmap

_Freerange: Homeschooling Outside The Box_. Domains: freerangehomeschooling.com, freerangehomeschool.app.

The working to-do list, by priority. New ideas go in **Ideas inbox** first, then get a priority.
Check a box when it ships, and add the commit next to it.

**Priorities:**
- **P0:** blocks a real launch.
- **P1:** next up.
- **P2:** soon.
- **P3:** later or nice to have.

_Last updated: 2026-11-11_

---

## P0: Launch blockers (most need a decision or an account from you)

- [ ] **Business email and DNS:** for now, Cloudflare Email Routing forwards admin@, support@, and hello@freerangehomeschooling.com to Gmail (free). Google Workspace waits until launch. Add SPF, DKIM, and DMARC records when sending from the domain.
- [ ] **Hosted backend:** create the production Supabase project, then share its URL and publishable key. Apply the migrations and deploy the edge functions (`create-checkout`, `stripe-webhook`, `fetch-page`).
- [ ] **Permanent test links:** host the web app with EAS Hosting (`eas deploy`), and share an Android build anyone can install plus iOS TestFlight. Needs an Expo login. For now there's a temporary Cloudflare link that only works while the dev machine is running.
- [ ] **Phone builds:** log in to Expo (`! npx eas-cli@latest login`) and run the first EAS builds. iOS also needs an Apple Developer account.
- [ ] **Payments:** add Stripe keys so buyers can pay for real. Today only demo payments work.
- [ ] **Creator payouts:** pay creators through Stripe Connect, with onboarding, a platform fee, and payouts. Sales are recorded, but creators aren't paid yet.
- [ ] **Apple and Google rules for digital sales:** decide how in-app purchases of digital curricula work on iOS and Android, for example web checkout only, in-app purchase, or reader-app rules.
- [ ] **Legal:**
  - Terms of service and a creator agreement covering rights and licensing warranties.
  - Copyright takedown process for listings. _The in-app claim and takedown flow is built (`ceceb9a`); still needs a written policy and a designated DMCA agent._
  - Privacy policy covering kids' data (COPPA).
  - **Trademark clearance for "Freerange"** with an attorney before filing. Nearby live marks: FREERANGE (Reg. 8209861, Class 41, preparedness education) and FREE RANGE KIDS (Reg. 7911708, Class 42, childrearing website). File as a distinctive mark, such as FREERANGE HOMESCHOOL with a logo.
- [ ] **Test on real devices:**
  - printing (AirPrint and Android print services)
  - opening lesson PDFs
  - photo uploads
  - offline sync

## P1: Next up

- [ ] **Studio: AI drafting with Claude, approved by a parent or creator.** _Waiting on an Anthropic API key (paid per use); parked until you're ready to pay for services._ Drafts lesson steps, worksheet questions, answer keys, and versions for younger and older kids. Every draft stays marked "draft" until a person approves it.
- [ ] **Studio: photo → table of contents in the app.** _Needs an on-device text-recognition module, so it waits for the first Expo development build._ Read the text on the device so there's no need to copy it with Live Text or Google Lens first.
- [ ] **Free & open curricula: keep converting.** Only works anyone may adapt and sell (public domain, CC0, CC BY, CC BY-SA), and only from sites whose terms allow it. Each is listed under its original author. Next candidates:
  - more NOAA, National Park Service, and USGS units
  - more public-domain classics, e.g. the Story of the English and Story of the Great Republic (Guerber), Our Little Cousin series, Burgess Seashore Book
  - more Wikijunior and Wikibooks books as they're completed

  **Decided, 2026-11-12:** non-commercial or restricted sources stay out of the Marketplace. Families can still build private plans from them in Studio. The list:
  - Khan Academy, Core Knowledge, EngageNY / Eureka Math, CK-12, IM v.360, and OER Project
  - Open Up Resources, whose site terms ban scraping, AI, and derivatives (we use IM's own site instead)
  - OpenStax, which is now non-commercial and bans AI use
  - Easy Peasy, Ambleside Online, Mater Amabilis, and Blossom and Root

  Revisit with a lawyer, or ask the publishers for permission.
- [ ] **Ask Illustrative Mathematics for permission to link** (you send the request). IM K–8 Math is CC BY 4.0 and IM's terms allow commercial adaptation. But IM's terms (§8.2) require organizations to ask in writing before linking to IM's sites, and every lesson links there. Ready-made plans are waiting (K–8, about 1,290 lessons); they ship once IM says yes.
- [ ] **Ask OpenSciEd for an agreement** (licensing@openscied.org). Its middle-school science is CC BY 4.0, but OpenSciEd's terms say its name can't be used with commercial distribution without an agreement. Plans for grades 6–8 (269 lessons) are ready.
- [ ] **Studio: should creators be able to list free adaptations of non-commercial (NC) sources?** Today they can. To match the decision above, it may be safer to make those plans private-only.
- [ ] **Accurate distances:** load the Census ZIP-area (ZCTA) data. This needs your OK to download it; today distances use a ZIP-prefix fallback.

## P2: Soon

- [ ] **Real identity checks for meetups:** plug in a vendor (e.g. Stripe Identity) at `record_vendor_verification()`. Needs your account. Until then, moderators verify families by hand.
- [ ] **Push notifications** (needs a dev build and Expo account); in-app notifications are built.
- [ ] **Gift emails:** send gift codes by email once there's an email provider. Today the giver shares the code or link.
- [ ] **Check the state subject lists** in `src/lib/standards.ts` (28 states, a simplified summary) against each state's statute.
- [ ] **Tune limits:** web import allows 20 fetches a minute and 300 a day; messages allow 10 a minute and 200 a day.
- [ ] **Ask NASA / Oak National Academy / MVP:**
  - **NASA:** its 2026 policy bars attributing AI-assisted output to NASA. Two NASA units (46 lessons) are held.
  - **Oak National Academy:** its site signals no AI input. Use its API with a key, and ask about naming Oak.
  - **MVP:** the license notes conflict for Secondary Math II and III, which are held.

## P3: Later or nice to have

- _(empty)_

## Ideas inbox

_New ideas land here, then get a priority._

- **Resources tab: explore options near you.** A new tab where families browse what's available to them, filtered by their state and ZIP:
  - **Federal:** e.g. free educational programs from national agencies, plus the national parks Junior Ranger and Every Kid Outdoors passes.
  - **State:** the homeschool law summary and notice-of-intent office, ESA, voucher and tax-credit programs, state homeschool associations, and access to public-school classes, sports or testing where the state allows it.
  - **Local:** library programs and cards, museums and nature centers with homeschool days, and parks and rec classes.
  - **Enrichment programs and co-ops:** homeschool enrichment days, hybrid schools, classes, and co-ops, including Freerange co-ops that are open to new families.
  - Each entry shows its cost, ages, schedule, link and when it was last checked. Families can save entries, add them to their plan or calendar, and suggest new ones, which moderators review.
  - Open questions: where the data comes from (hand-curated per state to start, then family submissions), how to keep links fresh, and paid placement (probably never, to keep trust).
  - **Brainstorm, 2026-11-16:** two halves.
    - **Programs & benefits:** hand-collected, per state. Each entry says who qualifies, the deadline and the next step, with "Remind me" before application windows.
    - **Find & join:** local programs. "Add to plan" turns one into a weekly rhythm block with a subject (e.g. PE). Attendance logs hours toward records and the compliance check, and fees go to Expenses (ESA-eligible).
    - Sources: families share programs they attend; organizers list their own (with verification); open Freerange co-ops; OpenStreetMap places to seed the map.
    - **Decided, 2026-11-16:**
      - **Who lists:** organizers (coaches, nature centers, co-op leaders, tutors) list programs with verification. Families can also create their own entries and share them.
      - **Hours count only after attendance is confirmed.** Either the family confirms (honor system) or the organizer marks attendance, and the record notes which one. Calendar entries alone never log hours.
      - **Split hours:** a family can split one program's time across subjects (e.g. nature club = 50% science, 50% PE). Organizers can suggest a split.
      - **Sign-up:** both modes, set per listing. Either link to the organizer's own sign-up, or sign up (and pay, if it costs money) inside Freerange through the Marketplace checkout and payout system.
      - **Launch states, done thoroughly: Colorado, Texas, Florida and Arizona.** Benefits, public-school access, state passes, a seeded local map and outreach to organizers.
- [ ] **Resources tab: the other 46 states plus DC, after launch.** Same depth as the launch states, rolled out in batches. Order by homeschool population and funding programs, e.g. North Carolina, Georgia, Ohio, Utah, Tennessee and Pennsylvania first. Until a state is done, show federal programs, the state law summary already in the app, and family- or organizer-added programs.
- **Roles at sign-up, and easy switching between them.** At sign-up, people pick one or more roles: **parent/family**, **curriculum creator**, **event organizer**, or all of them. The choice can change later in Settings.
  - **Each role gets its own home and tabs:**
    - Family: Today, Compass, Marketplace and Community.
    - Creator: Studio, sales and payouts.
    - Organizer: programs, sign-ups, attendance and rosters.
  - Someone with several roles **switches with one tap** (e.g. a role switcher in the header or profile menu, like switching accounts). The app remembers the last role used on each device.
  - **One account and one identity,** with the right public face per role: the family profile stays private, while the creator storefront and organizer page are public. Verification carries across where it applies.
  - **Onboarding fits the roles picked:** a family sets up kids and their state, a creator sets up a storefront, and an organizer sets up a program page. People who skip a role don't see its setup.
  - **Kid mode stays separate:** switching roles never opens kid mode, and leaving kid mode still needs the parent PIN.
  - **Today:** everyone is a family, and creator tools live in Studio. This makes creators and organizers first-class, and it's needed before organizers can list programs in the Resources tab.
- **Verification at sign-up, by role (strictest for event organizers).** Build on what exists: email confirmation, moderator-verified families, creators' `verified` flag, and the `record_vendor_verification()` hook. Show badges that say exactly what was checked, e.g. "ID verified", "Background check on file", "Insured". Never a vague "trusted".
  - **Everyone:** confirmed email, plus an optional phone check. SMS costs money, so it waits for a provider.
  - **Families (for meetups):** moderator review today, with an ID check through a vendor later (already on the roadmap).
  - **Creators who sell:** Stripe Connect onboarding verifies identity and bank details for payouts, at no extra cost, so "Verified seller" comes from that.
  - **Event organizers,** in tiers. Listings show the highest tier reached:
    1. **Basic (required to list):** confirmed email, a real name or organization name, a phone number, a public meeting place or service area, and agreeing to an organizer code of conduct and a child-safety policy. Early listings get a moderator review.
    2. **Identity verified:** a government ID and selfie check through a vendor (e.g. Stripe Identity, about $1.50 per check, or Persona or Veriff). Required to take sign-ups or payments inside Freerange. Stripe Connect covers this for paid programs.
    3. **Organization verified:** for nature centers, libraries, leagues and businesses. An email at the organization's own domain, an EIN or state registration lookup, or a listing on the organization's own site that links back.
    4. **Child-safety credentials (optional badges):** upload proof of a background check, SafeSport or similar training, CPR/first aid, or liability insurance, each with an expiry date. Moderators check it, and it's re-requested on expiry. Running background checks in the app (e.g. Checkr, roughly $30 or more each) can come later, paid by the organizer or as a premium option.
  - **Ongoing trust:** reviews from families who attended, a report button on every listing and organizer page, and automatic re-review after reports. Repeat no-shows or complaints pause listings.
  - **Privacy:** ID images stay with the vendor; Freerange stores only the result, the vendor's reference and the date. Explain in the privacy policy.
  - **Needs from you:** a vendor account and budget for ID checks (and background checks, if offered), plus legal review of the child-safety policy and code of conduct.
- **Keeping information fresh: a regular review workflow.** Curated content goes stale: state laws and rules (`src/lib/standards.ts`, notice-of-intent details), the programs and benefits list, co-op and program listings, and Library sources and licenses.
  - **Every entry records** its source link, when it was last checked, who checked it, and a review interval (e.g. laws yearly and before each school year, benefit deadlines each season, local programs every few months).
  - **A scheduled job** (e.g. a weekly Supabase cron or GitHub Action):
    - flags entries due for review
    - checks source links for dead pages or changed content (page hash or last-modified date)
    - checks Library sources for license changes
    - watches state legislature and agency pages during session
  - **A review queue** for moderators or admins shows what changed: the old text, the new source text, and a suggested update for a person to approve. AI-assisted drafting waits for the API key. Approved changes publish as a content update without an app release.
  - **Community signals feed the queue:** "Is this still right?" or "Still happening?" prompts to families who use an entry, and reports of wrong info. Stale programs are hidden automatically after no confirmations for a set time.
  - **Families affected by a change hear about it**, e.g. "Colorado changed its notice-of-intent deadline", with a dated changelog.
- **Design review, round 1:** the shared fixes and small P1s from the design review (https://claude.ai/artifact/8qLz8ns8mJDs2wsRaxBbDK), then rounds 2 and 3.
- **From the Compass and Studio test suites:**
  - Throttle repeated wrong kid and parent PINs; there's no limit today.
  - A family removed from a co-op can rejoin with the old code until the teacher makes a new one.
  - Spreadsheet import should read "30 min" as 30, and themes named "Easy", "Hard", or "Student" clash with column names.
  - When a curriculum is past its target end date, the pace shows every remaining lesson due in one day.
- **Marketplace (from the test suite):**
  - Handle Stripe's `checkout.session.async_payment_succeeded` / `_failed` before turning on delayed payment methods (bank debits); today such an order would stay pending.
  - A coupon typed in on an order that's already free (a free listing, or a bundle you already own most of) still uses up one of its uses.
  - Reviews written before a purchase keep "not verified" until the family edits the review; re-derive the badge when the purchase lands.
  - Purchases sync with the workspace and are also pulled from the server; check that a second device can't record a duplicate expense if it refreshes purchases before the workspace sync arrives.

---

## Done

- [x] Compass app: onboarding, daily flight deck, rhythm, kid mode, state rules, records (`458eeb2` and earlier)
- [x] Kid mode: browse past and future days, printable worksheets (`4dfdad5`)
- [x] Curriculum Marketplace: browse, sort, review, buy, add to plan (`cca14ee`)
- [x] Accounts, real-time multi-device sync, live marketplace and community on Supabase (`a2a9be7`)
- [x] Kids can start lessons early; printer setup in Settings (`1d0eac2`)
- [x] Progress tracked separately for each kid; lesson links and PDFs with an Open button (`13d2e3f`)
- [x] Studio:
  - create from scratch
  - convert a book you own (private)
  - import a spreadsheet
  - adapt a free online curriculum, keeping its license
  - publish to the Marketplace
  - lesson-by-lesson plans in kids' days (`ed43348`)
- [x] Studio plan updates: creators add a "What's new" note when they publish; families see "Update available", preview new, changed, and removed lessons, and update or skip. Each kid keeps their place. A family's own Studio edits flow into its plan the same way (`001b6a3`)
- [x] Answer keys and parent-only notes: answers line up with worksheet questions, print on a separate grown-ups' page, and never show in kid mode (`c9ccf18`)
- [x] Marketplace moderation: report listings and reviews (including copyright claims), auto-hide after 3 reports, moderator queue, takedowns sellers can't undo (`ceceb9a`)
- [x] Freerange Library: 14 free, openly licensed curricula (1,146 lessons) converted into lesson plans; fictional sample catalog removed (`7ed6856`)
- [x] Free & open curricula listed under their original authors: 35 curricula and 2,887 lessons. Studio now imports Project Gutenberg books and archive.org scans, and explains script-built sites (`b71338a`)
- [x] Creator verification badge, ESA vendor listings, and creator storefronts with followers (`6383ffe`)
- [x] Studio insights for creators (anonymous, 5-family minimum), easier and harder versions plus themes, state standards and subject coverage, PDF and CSV export (`4782965`)
- [x] Web import of YouTube playlists, Pressbooks, LibreTexts, Wikibooks, and JSON-LD or nested-list outlines; fetch rate limits and address pinning; reviews show progress (`f1f953d`)
- [x] Family messaging (connected families only, block, report, limits), the verified-family badge, meetup safety tips, and in-app notifications (`75ef599`)
- [x] Co-op classes, gifts, bundles, sales, and coupons, priced on the server (`aebc714`)
- [x] Free & open curricula: 48 curricula, 3,374 lessons, adding NOAA, NPS, USGS, the Library of Congress, MVP Math I, and Wikijunior (`b065d6e`)
- [x] Design review: 95 findings, 13 of them P1, with screenshots and a suggested order (https://claude.ai/artifact/8qLz8ns8mJDs2wsRaxBbDK)
- [x] Test suite for every area: 533 unit, 191 server, and 16 browser suites at phone and desktop sizes; 92% statement coverage, mapped in docs/TESTING.md. It found and fixed 25 bugs, including kid mode reaching parent screens, connection-request hijacking, coupon overuse, and NC licenses read as CC BY (`91ef5c3`, `69eee3a`, and the Compass suite)
