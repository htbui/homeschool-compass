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

- _(empty)_

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
