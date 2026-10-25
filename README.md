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

### Builds for the app stores

Cloud builds use [EAS](https://docs.expo.dev/eas/), so you don't need Xcode or Android Studio locally:

```bash
npx eas-cli@latest build --profile preview --platform all   # installable test builds
npx eas-cli@latest build --profile production --platform all
npx expo export --platform web                              # static web build in dist/
```

## Tests

```bash
npm test            # unit tests for the domain engines (vitest)
npm run typecheck
npm run lint
npm run test:e2e    # browser tests: every screen and form at desktop + phone size
                    # (needs `npm run web` running, plus local Chrome or CHROME_PATH)
```

## What's built (mapped to the plan)

| Plan module | Status | Where |
| --- | --- | --- |
| **1. Onboarding & Style Matcher** | ✅ ZIP → state lookup, child profiles (learning differences, passions, solo tolerance, PIN), 15-question quiz scored on 5 dimensions, philosophy breakdown with "typical day", values/interests, curriculum suggestions, and a recommended rhythm that staggers parent 1-on-1 time | `src/app/onboarding`, `src/lib/quiz.ts`, `src/lib/recommend.ts` |
| **2. Compliance & Benefits ("Compass")** | ✅ 50-state + DC legal radar (tier, ages, notice, days/hours, testing, portfolio, funding, Tim Tebow access); NOI generator with e-signature, PDF export, and proof-of-mailing checklist; auto + manual hours split into core/non-core; attendance days; portfolio vault with snap-and-upload and standards tags; one-click evaluator packet; ESA/tax expense tracker with receipts and report | `src/lib/states.ts`, `src/lib/documents.ts`, `src/app/records`, `src/app/(parent)/compliance.tsx` |
| **3. Curriculum** | ✅ Pacing engine that re-spreads missed lessons instead of building a backlog, presets for popular curricula, turnkey/modular/custom models, tasks that advance lesson counts, **Unit Study Generator** with tiered activities by age | `src/lib/pacing.ts`, `src/lib/unitStudy.ts`, `src/app/(parent)/learn.tsx` |
| **4. Schedule & Orchestration** | ✅ Weekly rhythm builder, per-child timeline, **parent-conflict detection + auto-stagger**, **Gentle Bump** to the next school day or a Flex day, one-off tasks | `src/lib/schedule.ts`, `src/app/(parent)/today.tsx`, `schedule.tsx` |
| **5. Daily Student Flow** | ✅ Avatar/PIN login, mood meter, visual day map, activity cards with steps, stopwatch / 25-minute focus timer, photo evidence, **"I need help" → parent help queue** with a "while you wait" suggestion, self-assessment and reflection, Sparks, day-complete celebration, **non-reader mode** (big icons + text-to-speech for ages ≤ 6), parent-PIN-locked exit | `src/app/kid` |
| **6. Community** | 🧪 Preview UI with sample data: family finder (distance bands only, never addresses), co-ops with rotating duties, field trips with RSVP and carpool, curriculum swap | `src/app/(parent)/community.tsx`, `src/lib/community.ts` |
| Offline-first | ✅ All data is saved on the device (AsyncStorage). Everything works without a network connection. JSON backup export/import in Settings | `src/store/useStore.ts` |
| Child safety (COPPA) | ✅ Kids can't reach parent areas or community features without the parent PIN; children have no messaging | `src/app/kid`, `(parent)/_layout.tsx` |

### Not built yet (needs a backend or decisions from §7 of the plan)

- **Accounts, cloud sync, and multi-device.** Today each device has its own data; use backup export/import to move it. The store is the seam for an API client.
- **Live community.** Real family matching, messaging, ID verification, and payments depend on the open decision about verification standards (§7.2).
- **Two-way Google/Apple Calendar sync** needs OAuth and a server.
- **Phase 3 AI.** The portfolio narrative summarizer is still to come. The unit study generator uses offline templates behind an interface an AI service can replace.
- **Marketplace with buyer protection.** Not built; it depends on the monetization decision (§7.3).
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
