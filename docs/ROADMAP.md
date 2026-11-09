# Kinship Roadmap

The working to-do list, by priority. New ideas go in **Ideas inbox** first, then get a priority.
Check a box when it ships, and add the commit next to it.

**Priorities:**
- **P0:** blocks a real launch.
- **P1:** next up.
- **P2:** soon.
- **P3:** later or nice to have.

_Last updated: 2026-11-09_

---

## P0: Launch blockers (most need a decision or an account from you)

- [ ] **Hosted backend:** create the production Supabase project, then share its URL and publishable key. Apply the migrations and deploy the edge functions (`create-checkout`, `stripe-webhook`, `fetch-page`).
- [ ] **Phone builds:** log in to Expo (`! npx eas-cli@latest login`) and run the first EAS builds. iOS also needs an Apple Developer account.
- [ ] **Payments:** add Stripe keys so buyers can pay for real. Today only demo payments work.
- [ ] **Creator payouts:** pay creators through Stripe Connect, with onboarding, a platform fee, and payouts. Sales are recorded, but creators aren't paid yet.
- [ ] **Apple and Google rules for digital sales:** decide how in-app purchases of digital curricula work on iOS and Android, for example web checkout only, in-app purchase, or reader-app rules.
- [ ] **Legal:**
  - Terms of service and a creator agreement covering rights and licensing warranties.
  - Copyright takedown process for listings.
  - Privacy policy covering kids' data (COPPA).
- [ ] **Test on real devices:**
  - printing (AirPrint and Android print services)
  - opening lesson PDFs
  - photo uploads
  - offline sync

## P1: Next up

- [ ] **Studio: send updates to families.** When a creator publishes a new version, families who already have it see "Update available". The update keeps each kid's progress, and the family can preview what changed before accepting it.
- [ ] **Studio: edit a family's own conversion after it's in the plan,** and push the changes into the plan, keeping progress.
- [ ] **Studio: AI drafting with Claude, approved by a parent or creator.** Drafts lesson steps, worksheet questions, answer keys, and versions for younger and older kids. Every draft stays marked "draft" until a person approves it.
- [ ] **Studio: answer keys and parent-only notes.** Hidden from kid mode, printed on a separate answer sheet.
- [ ] **Studio: photo → table of contents in the app.** Read the text on the device so there's no need to copy it with Live Text or Google Lens first.
- [ ] **Studio: better web import** for sites that build their pages with scripts:
  - video playlists
  - large open textbook sites
  - each site's own outline format
- [ ] **Marketplace: moderation.** Report a listing or review, an admin review queue, and takedowns.
- [ ] **Marketplace: creator verification badge,** plus onboarding as an ESA vendor.
- [ ] **Community:** messaging between families, and identity verification for meetups.
- [ ] **Accurate distances:** load the Census ZIP-area (ZCTA) data. This needs your OK to download it; today distances use a ZIP-prefix fallback.

## P2: Soon

- [ ] **Studio analytics for creators.** Anonymous signals: where kids struggle ("Lesson 14 takes twice as long as planned", "marked tricky"), drop-off points, and completion rates.
- [ ] **Studio co-op mode:** a teacher shares a class plan with 5–30 families, and each family paces it on its own.
- [ ] **Studio: versions by age and theme.** One plan with easier and harder versions per lesson, plus interest themes (for example, dinosaurs or space).
- [ ] **Studio: tag lessons to state standards,** and flag required subjects that are missing.
- [ ] **Reviews that show progress:** "Finished 120/120 lessons" next to a review.
- [ ] **`fetch-page` hardening:** per-user rate limits, and pinning the looked-up address so a site can't switch to an internal address between the safety check and the fetch.
- [ ] **Notifications:** help requests, co-op events, and curriculum updates.

## P3: Later or nice to have

- [ ] Bundles, discounts, and coupon codes for creators.
- [ ] Gift a curriculum to another family.
- [ ] Creator storefront pages with followers.
- [ ] Export a Studio plan as PDF or CSV.

## Ideas inbox

_New ideas land here, then get a priority._

- _(empty)_

---

## Done

- [x] Kinship Compass app: onboarding, daily flight deck, rhythm, kid mode, state rules, records (`458eeb2` and earlier)
- [x] Kid mode: browse past and future days, printable worksheets (`4dfdad5`)
- [x] Curriculum Marketplace: browse, sort, review, buy, add to plan (`cca14ee`)
- [x] Accounts, real-time multi-device sync, live marketplace and community on Supabase (`a2a9be7`)
- [x] Kids can start lessons early; printer setup in Settings (`1d0eac2`)
- [x] Progress tracked separately for each kid; lesson links and PDFs with an Open button (`13d2e3f`)
- [x] Kinship Studio:
  - create from scratch
  - convert a book you own (private)
  - import a spreadsheet
  - adapt a free online curriculum, keeping its license
  - publish to the Marketplace
  - lesson-by-lesson plans in kids' days (`ed43348`)
