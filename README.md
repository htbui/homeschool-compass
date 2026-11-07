# Kinship — Homeschool Compass

A multi-child homeschool operating system for **web, iOS, and Android** from one codebase (Expo + React Native + react-native-web). It implements Phase 1 of [`homeschool_app_master_plan.md`](./homeschool_app_master_plan.md) and the core of Phase 2.

## Run it

```bash
npm install
npm run web        # browser at http://localhost:8081
npm run ios        # iOS simulator (needs Xcode) or scan the QR code with Expo Go
npm run android    # Android emulator (needs Android Studio) or Expo Go
```

On the welcome screen, **Explore with a demo family** loads "The Miller Crew" from the blueprint: Leo (5), Maya (9, kid PIN `1111`), and Noah (13). The parent PIN is `1234`.

### Cloud: accounts, sync, live marketplace & community

Kinship works fully offline on one device. Connect it to the Kinship service ([Supabase](https://supabase.com)) for:

- **Accounts and multi-device sync.** Every device keeps a full local copy and syncs in real time. Edits made on two devices at once, even offline, are merged per record and per field (`src/lib/sync.ts`). Kid mode stays per device. Portfolio photos and receipts upload to private family storage.
- **A second parent.** Account & sync → *Create invite code*. The other parent signs up and enters the code.
- **The live marketplace.** Shared listings, reviews ("verified purchase" is derived on the server), helpful votes, and server-side purchases. Free listings are claimed through an RPC. Paid ones go through the `create-checkout` Edge Function (Stripe Checkout), and the `stripe-webhook` function marks them paid.
- **The live community.** Opt-in family profiles and a family finder that shows **distance bands only** (ZIP codes stay server-side). Connection requests share contact details only after both sides accept. Co-ops have organizer-approved membership and rotating duties. Field trips have RSVPs, capacity limits and carpool matching.

Every table has row-level security; `supabase/tests/cloud.test.ts` checks the rules as real users.

**Local development** (needs Docker and the [Supabase CLI](https://supabase.com/docs/guides/cli)):

```bash
npm run db:start          # local stack on ports 5542x; prints the URL and publishable key
cp .env.example .env.local   # fill in EXPO_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY
cp supabase/functions/.env.example supabase/functions/.env   # PAYMENTS_MODE=demo: paid checkout completes instantly, flagged demo
npm run db:reset          # migrations + sample catalog (supabase/seed.sql, from src/lib/marketSample.ts)
npm run web
```

**Production:**
1. Create a Supabase project and run `supabase link` then `supabase db push`. Production gets no seed data, so the live catalog starts empty until sellers list.
2. Deploy the checkout functions with `supabase functions deploy create-checkout stripe-webhook`.
3. Set the function secrets with `supabase secrets set STRIPE_SECRET_KEY=… STRIPE_WEBHOOK_SECRET=… CHECKOUT_RETURN_ORIGINS=https://your.site,kinship://`.
4. Point a Stripe webhook (`checkout.session.completed`, `checkout.session.expired`) at `/functions/v1/stripe-webhook`.
5. Put the project URL and publishable key in your EAS environment variables.
6. For accurate distances, load ZIP centroids with `node scripts/load-zcta.mjs` (see the script header).

### Builds for the app stores

Cloud builds use [EAS](https://docs.expo.dev/eas/), so you don't need Xcode or Android Studio locally:

```bash
npx eas-cli@latest build --profile preview --platform all   # installable test builds
npx eas-cli@latest build --profile production --platform all
npx expo export --platform web                              # static web build in dist/
```

## Tests

```bash
npm test               # unit tests: domain engines, marketplace, sync merge (vitest)
npm run typecheck
npm run lint
npm run test:cloud     # row-level security + server rules against the local Supabase stack
npm run test:e2e       # local-only browser tests, every screen and form at desktop + phone size
                       # (needs `npm run web:local` on :8082, plus local Chrome or CHROME_PATH)
npm run test:e2e:cloud # two devices syncing, live marketplace, two families in the community
                       # (needs `npm run db:start` and `npm run web` on :8081)
```

## What's built (mapped to the plan)

| Plan module | Status | Where |
| --- | --- | --- |
| **1. Onboarding & Style Matcher** | ✅ ZIP → state lookup, child profiles (learning differences, passions, solo tolerance, PIN), 15-question quiz scored on 5 dimensions, philosophy breakdown with "typical day", values/interests, curriculum suggestions, and a recommended rhythm that staggers parent 1-on-1 time | `src/app/onboarding`, `src/lib/quiz.ts`, `src/lib/recommend.ts` |
| **2. Compliance & Benefits ("Compass")** | ✅ 50-state + DC legal radar (tier, ages, notice, days/hours, testing, portfolio, funding, Tim Tebow access); NOI generator with e-signature, PDF export, and proof-of-mailing checklist; auto + manual hours split into core/non-core; attendance days; portfolio vault with snap-and-upload and standards tags; one-click evaluator packet; ESA/tax expense tracker with receipts and report | `src/lib/states.ts`, `src/lib/documents.ts`, `src/app/records`, `src/app/(parent)/compliance.tsx` |
| **3. Curriculum** | ✅ Pacing engine that re-spreads missed lessons instead of building a backlog, presets for popular curricula, turnkey/modular/custom models, tasks that advance lesson counts, **Unit Study Generator** with tiered activities by age | `src/lib/pacing.ts`, `src/lib/unitStudy.ts`, `src/app/(parent)/learn.tsx` |
| **Curriculum Marketplace** | ✅ Browse publisher curricula and used books from families; search, filter (kids' grades, subject, price, format, teaching style, rating, ESA vendors, new/used) and sort (best match for your family, rating, reviews, price, newest); rating breakdown and sortable reviews with verified-purchase badges; checkout tagged ESA / tax / out-of-pocket that lands in the expense tracker; **Add to plan** creates the paced curriculum plus rhythm blocks (staggering parent 1-on-1s); write reviews; list your own curricula for sale. Runs on a clearly labelled sample catalog until the live service is connected | `src/lib/market.ts`, `src/app/(parent)/market.tsx`, `src/app/listing/[id].tsx`, `src/components/market` |
| **4. Schedule & Orchestration** | ✅ Weekly rhythm builder, per-child timeline, **parent-conflict detection + auto-stagger**, **Gentle Bump** to the next school day or a Flex day, one-off tasks | `src/lib/schedule.ts`, `src/app/(parent)/today.tsx`, `schedule.tsx` |
| **5. Daily Student Flow** | ✅ Avatar/PIN login, mood meter, visual day map, activity cards with steps, stopwatch / 25-minute focus timer, photo evidence, **"I need help" → parent help queue** with a "while you wait" suggestion, self-assessment and reflection, Sparks, day-complete celebration, **non-reader mode** (big icons + text-to-speech for ages ≤ 6), parent-PIN-locked exit, **browse past days and work ahead on upcoming ones** (starting early moves the mission to today so hours count correctly) | `src/app/kid` |
| **6. Community** | ✅ With an account: opt-in profiles, family finder by distance band (ZIP codes never leave the server), connection requests that reveal contact details only after acceptance, co-ops with organizer approval and rotating duties, field trips with RSVPs, capacity and carpool matching. Signed out: a sample preview. Used-curriculum swaps are in the Marketplace | `src/app/(parent)/community.tsx`, `src/lib/community.ts` |
| Print | ✅ First print on a device asks a grown-up to set up printing (also in Settings → Printing): on iOS pick an AirPrint printer once and print straight to it (falls back to the dialog if it's unreachable); Android and web use the system print dialog. Paper size (Letter/A4) and a test page. 🖨️ on any task (kid activity card, parent task sheet) prints a worksheet with steps, lesson number, and a subject-shaped work area (graph paper, handwriting lines, drawing box); **Print day** prints a packet with a checklist cover | `src/lib/worksheet.ts`, `src/hooks/usePrint.ts` |
| Offline-first + sync | ✅ All data is saved on the device (AsyncStorage) and works without a network connection. Signed in, it syncs in real time across devices with a three-way merge. Invite a second parent; JSON backups still available | `src/store/useStore.ts`, `src/services/sync.ts`, `src/lib/sync.ts`, `supabase/` |
| Child safety (COPPA) | ✅ Kids can't reach parent areas or community features without the parent PIN; children have no messaging | `src/app/kid`, `(parent)/_layout.tsx` |

### Not built yet (needs a backend or decisions from §7 of the plan)

- **Messaging and ID verification in the community.** Connected families exchange the contact details they chose to share. In-app messaging and stronger identity checks than a confirmed email depend on the verification decision (§7.2).
- **Seller payouts.** Checkout charges buyers, but paying out to family and publisher sellers needs Stripe Connect onboarding.
- **Two-way Google/Apple Calendar sync** needs OAuth and a server.
- **Phase 3 AI.** The portfolio narrative summarizer is still to come. The unit study generator uses offline templates behind an interface an AI service can replace.
- **App Store payment rules.** Note Apple's rules: digital content used inside the iOS app generally has to be sold through in-app purchase, while physical books and services can use a regular card checkout. This affects the monetization decision (§7.3).
- **State law data** is a hand-compiled baseline marked "verify with official sources". It should be replaced with a maintained feed before launch.

## Architecture

```
src/
  app/             Expo Router screens (file-based routes)
    onboarding/    welcome → family → kids → quiz → results
    (parent)/      tabs: Today (Flight Deck), Rhythm, Curriculum, Compass, Community
    records/       NOI, hours, portfolio, expenses
    kid/           picker → daily adventure → activity card
  lib/             pure TypeScript domain engines (unit-tested, no RN imports)
  store/           Zustand store persisted to AsyncStorage; demo seed
  services/        platform adapters (.web.ts variants): photos, PDF export, speech
  ui/              design system (theme tokens, light/dark, components)
  components/      shared feature components
e2e/               puppeteer browser tests
```

The plan's target stack (Postgres, Redis help queue, S3 evidence storage, Auth0 parent/child profiles) maps onto this structure:

- `lib/` is the business logic to share with, or port to, the services.
- `services/media` is where uploads would switch to encrypted S3.
- `useStore` actions are where API calls would go.
