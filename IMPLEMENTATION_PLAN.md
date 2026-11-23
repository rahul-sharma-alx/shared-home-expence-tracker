# RoomSplit: Next.js and Vercel Migration Plan

## 1. Project Purpose

RoomSplit is a two-roommate expense ledger and settlement tracker for shared-home costs.
It is for authenticated roommates and must not preload the legacy **Room 204 / RM204A**
sample room or its fictional users.

The migrated application must preserve the existing product behavior while replacing the
single `index.html` implementation with a maintainable Next.js App Router project suitable
for Vercel deployment.

## 2. Existing Application Behavior

The legacy `index.html` prototype provides:

- Demo and live Firebase modes (the migrated app intentionally removes the demo flow).
- Switching between fictional `you` and `friend` demo users.
- Room name, room code, monthly budget, and two roommate profiles.
- Expense CRUD with title, amount, date, category, payer, split rule, and note.
- Split rules:
  - `50-50`: shared equally.
  - `100-other`: all of the expense is owed by the person who did not pay.
  - `personal`: no settlement share is assigned.
- Owner-only expense editing and deletion in the UI and in the Firestore model.
- Net balance calculation, paid totals, assigned shares, and settlement adjustments.
- Monthly and all-time ledger filtering.
- Search, category, and payer filters.
- Recent expense and category summaries.
- Category doughnut and roommate payer charts.
- Fixed monthly templates for rent, Wi-Fi, and water.
- Filtered CSV export.
- UPI deep links, QR codes, and WhatsApp payment requests.
- Settlement history and settlement deletion.
- Email/password Firebase authentication.
- Real-time Firestore expense and settlement subscriptions.
- A room invite code, invite link, and join-room interaction.
- An accessible-neutral zinc visual style with a sticky header and underline navigation.

Preserve INR formatting, categories, settlement semantics, and `you` / `friend` perspective
labels, but do not load the prototype's fictional names, room, expenses, or settlements.

## 3. Target Stack

- Next.js App Router with React and TypeScript.
- Tailwind CSS.
- Chart.js through a React-compatible wrapper.
- QR code rendering in React.
- Lucide React icons.
- Firebase Authentication and the modular Firebase Web SDK.
- Firestore for live room, expense, and settlement data.
- Vercel serverless Route Handlers for future privileged or provider-backed AI features.
- Vitest or the existing test runner plus React Testing Library.
- ESLint and TypeScript for validation.

Do not copy the Firebase Compat SDK or the CDN scripts from `index.html`. The migration should
use npm dependencies and modular TypeScript imports.

## 4. Target Architecture

```text
src/
  app/
    layout.tsx
    page.tsx
    globals.css
    api/
      health/route.ts
  components/
    layout/
    overview/
    ledger/
    settlements/
    room/
    firebase/
    ui/
  features/
    expenses/
      types.ts
      calculations.ts
      firestore-repository.ts
      use-expenses.ts
    settlements/
      types.ts
      calculations.ts
      firestore-repository.ts
      use-settlements.ts
    room/
      types.ts
      calculations.ts
  lib/
    firebase/
      config.ts
      client.ts
      auth.ts
      firestore.ts
    ai/
      server.ts
  test/
```

Keep route files thin. React components should compose focused feature hooks and presentational
components. Firebase access, localStorage access, balance calculations, and UPI/WhatsApp URL
builders must not be mixed into page components.

## 5. Data Model

### Room

```ts
type RoomPerspective = "you" | "friend";

type RoomProfile = {
  code: string;
  name: string;
  budgetCap: number;
  youName: string;
  youPhone: string;
  youUpi: string;
  friendName: string;
  friendPhone: string;
  friendUpi: string;
};
```

### Expense

```ts
type ExpenseSplit = "50-50" | "100-other" | "personal";

type Expense = {
  id: string;
  title: string;
  amount: number;
  date: string;
  category: ExpenseCategoryId;
  paidBy: RoomPerspective;
  split: ExpenseSplit;
  note?: string;
  createdBy: RoomPerspective;
  createdByUid?: string;
  updatedAt?: string;
};
```

### Settlement

```ts
type Settlement = {
  id: string;
  from: RoomPerspective;
  amount: number;
  date: string;
  note?: string;
  createdBy: RoomPerspective;
  createdByUid?: string;
};
```

Firestore documents should live under:

```text
rooms/{roomCode}/expenses/{expenseId}
rooms/{roomCode}/settlements/{settlementId}
```

The room code/document ID remains the isolation boundary. Do not use broad collection queries.

## 6. Balance and Filtering Rules

Extract and test pure calculation functions before wiring UI state.

- Filter expenses by month prefix or include all months.
- Settlement records apply only to the selected period unless all-time mode is active.
- `50-50`: halve the expense for each share.
- `100-other`: assign the full amount to the person who did not pay.
- `personal`: assign the expense to the payer only.
- A `friend -> you` settlement reduces the friend-to-you net direction.
- A `you -> friend` settlement changes the opposite direction.
- Return total spend, payer totals, share totals, and signed net balance.

The calculations must not read the DOM or browser storage. Preserve Indian currency formatting
and the `< 1 INR` all-settled threshold.

## 7. State and Repository Strategy

### Initial and live state

- Do not seed sample room, profile, expense, or settlement data.
- Require Firebase Authentication before accessing room data.
- New accounts without a room enter an empty create-or-join flow.
- Do not read or persist the legacy `roomsplit_state_v2` demo state.
- Keep expense and settlement state scoped to the signed-in user's room.

### Firebase live mode

- Read public Firebase Web configuration from `NEXT_PUBLIC_FIREBASE_*` variables.
- Initialize Firebase once on the browser.
- Observe Authentication state.
- Subscribe only to the active room's expense and settlement subcollections.
- Unsubscribe when the user, room, or component changes.
- Set `createdByUid` for live-created records.
- Keep owner checks in both the UI and Firestore rules.
- Use loading, empty, error, and stale-subscription states.

Authentication UI is in-app. Do not collect or persist credentials in localStorage.

## 8. Route and Component Plan

Create the initial route at `src/app/page.tsx`.

Use an application shell with:

- Brand and room identity.
- Live status and signed-in profile controls.
- Signed-in profile controls; do not allow switching identity to another roommate.
- Invite and UPI action.
- Firebase or authentication action.
- Add Expense action.
- Underline navigation for Overview, Ledger, Settlements, and Security & Plan.
- Month selector.
- A responsive KPI summary hidden from the Security & Plan view.

Split the existing views into components:

- `OverviewView`
- `LedgerView`
- `SettlementView`
- `SecurityView`
- `ExpenseModal`
- `RoomSettingsModal`
- `SettlementModal`
- `FirebaseAuthModal`

Modals should use accessible dialog semantics, focus management, Escape-to-close, and a
single close control. All user-entered text must be rendered as React text or escaped safely;
do not interpolate it into `innerHTML`.

## 9. Feature Checklist

### Phase 1: Project Foundation

- [ ] Scaffold Next.js App Router with TypeScript under `src/`.
- [ ] Configure Tailwind CSS and global neutral/zinc styles.
- [ ] Add Firebase modular SDK, Chart.js React integration, QR, and Lucide dependencies.
- [ ] Add scripts for dev, lint, type-check, test, and production build.
- [ ] Add `.env.example` and ignore `.env*` files except a safe example.
- [ ] Configure metadata, viewport, and a small RoomSplit favicon/icon.

### Phase 2: Domain and Tests

- [ ] Extract categories and room, expense, and settlement types.
- [ ] Extract INR formatting and CSV helpers.
- [ ] Extract balance, split, category, and payer calculations.
- [ ] Extract UPI URI and WhatsApp URL builders.
- [ ] Add tests for `50-50`, `100-other`, personal, settlement, and all-time behavior.
- [ ] Add tests for filtered CSV and fixed monthly bill data.

### Phase 3: Live Room State

- [ ] Create an empty, typed initial state with no sample records.
- [ ] Load room, expense, and settlement data only for authenticated members.
- [ ] Route new accounts with no room to the create-or-join flow.
- [ ] Implement fixed monthly bill deduplication per month/category.

### Phase 4: Layout and Overview

- [ ] Build the root layout and responsive application shell.
- [ ] Build net balance, payment comparison, spend, and budget KPI cards.
- [ ] Build recent entries and category breakdown.
- [ ] Build reactive category and payer charts.
- [ ] Preserve 80% warning and 100% over-cap states.

### Phase 5: Ledger

- [ ] Build the ledger table and search/category/payer/month filters.
- [ ] Build add and edit expense forms.
- [ ] Restrict controls to the entry owner.
- [ ] Add fixed monthly bill templates.
- [ ] Export only the currently filtered ledger as CSV.

### Phase 6: Settlements and UPI

- [ ] Build settlement history.
- [ ] Build the settle-up modal.
- [ ] Generate UPI deep links and QR codes.
- [ ] Generate WhatsApp requests with a safely encoded phone and message.
- [ ] Add and delete settlement records in Firebase rooms.

### Phase 7: Room, Invite, and Profiles

- [x] Build room name and budget settings.
- [x] Build each user's profile and UPI details.
- [x] Build room code and invite-link copy controls.
- [x] Support `#join=<inviteToken>` invite links for a two-member room.
- [x] Validate membership before allowing live-room writes.

### Phase 8: Firebase

- [x] Initialize Firebase from public environment variables.
- [x] Implement Google sign-in.
- [x] Implement auth and room subscriptions.
- [x] Create and update Firestore expense and settlement records.
- [x] Attach `createdByUid` to live-created records.
- [ ] Deploy only room/member-reviewed Firestore rules.
- [x] Unsubscribe from old rooms and auth observers safely.

### Phase 9: Security and Server Boundary

- [ ] Verify users and room membership before AI requests.
- [ ] Keep provider credentials exclusively in server environment variables.
- [ ] Validate route-handler request schemas.
- [ ] Add route-handler rate limits or authenticated quota checks.
- [ ] Never import server secrets or `process.env` provider keys in client modules.
- [ ] Add only an opt-in AI UI after the core migration is complete.

### Phase 10: Quality and Deployment

- [ ] Add dialog and form accessibility coverage.
- [ ] Add loading, empty, permission, and error feedback.
- [ ] Run lint, type-check, tests, and a Next.js production build.
- [ ] Smoke-test the login and empty-room flows in desktop and mobile browsers.
- [ ] Verify month filtering, balance calculations, CSV, QR, and UPI flows.
- [ ] Configure Vercel environment variables.
- [ ] Deploy and verify the production route.
- [ ] Verify Firebase live mode only with an actual configured project.

## 10. Firebase Environment Variables

Use public Firebase Web configuration variables:

```text
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

Server-only variables for future features, for example:

```text
AI_PROVIDER_API_KEY
AI_PROVIDER_MODEL
```

Do not prefix provider keys with `NEXT_PUBLIC_` and never commit `.env.local`.

Firebase Web configuration is public configuration, not a secret. Live security is enforced
through Authentication and Firestore rules.

## 11. Room Membership and Firestore Security

Each account can own or join multiple rooms. A per-user index supports the room selector while
the room document remains the data-isolation boundary:

```text
users/{uid}/rooms/{roomId}
  roomId
  roomName
  role
rooms/{roomId}
  members/{uid}
  expenses/{expenseId}
  settlements/{settlementId}
```

The user-room index is readable only by its owner. Room creation, joining, and index updates must
be validated atomically with the corresponding room and member documents. Existing accounts with a
legacy `users/{uid}.roomId` are migrated into the index on first use. The room remains limited to
two members.

Require an authenticated member for room reads and writes. Expense and payment creation must
attribute the signed-in user as creator and payer. Updates and deletes are restricted to each
record's creator. The app subscribes only to the selected room's ledger.

The checked-in rules are a prototype and must be reviewed and validated against the deployed
Firebase project before broad production use.

## 12. Vercel Deployment

1. Create or select a Vercel project connected to this repository.
2. Set Framework Preset to Next.js.
3. Use the normal Next.js build; do not configure a custom static export.
4. Add public Firebase variables in Vercel for Preview and Production environments.
5. Add server-only AI variables only if the AI route is implemented.
6. Deploy a preview from a feature branch and verify the login and empty-room flows.
7. Promote to Production after smoke tests pass.
8. Confirm authorized production domains in Firebase Authentication.
9. Add those domains to Firestore/app configuration if Firebase live mode is enabled.
10. Do not report live Firebase success until credentials and rules are verified in an actual
    deployment.

Recommended validation commands:

```powershell
npm run lint
npm run type-check
npm run test
npm run build
```

## 13. Implementation Batches

1. Scaffold and tooling.
2. Types, calculations, CSV, UPI, and domain tests.
3. Empty initial state, authentication, and application shell.
4. Overview, budget, and charts.
5. Ledger, fixed bills, and owner-only CRUD.
6. Settlements, QR, UPI, and WhatsApp.
7. Room profiles, invite links, and joining.
8. Firebase Auth and Firestore repositories.
9. Room membership and security rules.
10. Optional server-only AI route.
11. Accessibility, browser verification, and Vercel deployment.

Complete each batch only after its focused lint/type/test/build validation passes.

## 14. Acceptance Criteria

- [ ] The app runs as a Next.js App Router project.
- [ ] No fictional room, profile, expense, or settlement data is preloaded.
- [ ] A new authenticated user without a room sees an empty create-or-join flow.
- [ ] `you` / `friend` perspective mapping preserves owner-only behavior.
- [ ] Monthly and all-time balance calculations match the existing app.
- [ ] Expense CRUD is available only to authenticated room members.
- [ ] An account can create and join multiple two-person rooms and switch between their ledgers.
- [ ] A roommate can record a payment they made; both members see the payment and updated balance.
- [ ] Fixed monthly bills are deduplicated.
- [ ] Filtered CSV export matches the ledger filter.
- [ ] UPI links, QR codes, and WhatsApp links are correctly encoded.
- [ ] Firebase live mode is configured only with environment variables.
- [ ] Provider AI keys remain server-only.
- [ ] Firestore access is isolated by room and membership.
- [ ] The production build completes on Vercel.
- [ ] Firebase live mode is verified only when real credentials are available.


________________________________________
1. User can add more then 2 roommates in the room. (Currently only 2 roommates are allowed)
2. User can add more then 1 room in the app. (Currently only 1 room is allowed)
3. Each room should have its own ledger and settlement history and isolated data.
4. At home page, show the message like "You have to pay {{amount}} to {{friendName}} and {{friendName}} has to pay {{amount}} to you" based on the net balance of the room.
