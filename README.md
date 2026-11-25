# RoomSplit

RoomSplit is a two-roommate shared-home expense tracker built with Next.js, TypeScript, Firebase Authentication, and Cloud Firestore.

Firebase sign-in is required. New accounts start without a room or ledger entries and can create rooms or join them using invite links. The app does not preload sample expenses or profiles.

## Local development

1. In the Firebase project `shared-room-expence-tracker`, register a Web app if one is not already registered.
2. Enable **Email/Password**, **Google**, and **Phone** under Firebase Authentication -> Sign-in method. Phone sign-in also requires authorized domains and SMS region policy.
3. Create a Cloud Firestore database.
4. Copy `.env.example` to `.env.local` and fill in the Firebase Web app configuration values.
5. Add `localhost` and your deployed host to Firebase Authentication's authorized domains.
6. Publish the prototype rules with `npx firebase-tools deploy --only firestore:rules --project shared-room-expence-tracker`, or paste [`firestore.rules`](./firestore.rules) into the Firestore Rules editor.
7. Start the app:

   ```bash
   npm install
   npm run dev
   ```

Firebase Web configuration is public client configuration. Do not put Firebase Admin credentials or provider secrets in `NEXT_PUBLIC_*` variables.

## Rooms and ownership

- Each account has a private profile and can belong to multiple rooms. The room selector switches the active ledger without changing the signed-in user.
- A room creator can share an invite link with one roommate. A room has at most two members and its own budget, expenses, and payment history.
- Expense and payment records are scoped to `rooms/{roomId}`. A roommate records a payment they personally made; both members see the payment and updated balance.
- The ledger opens on the current calendar month, so each new month starts with a zero monthly total. Past expenses remain available through month selection and All time.
- Expense forms support voice drafts in compatible browsers, pre-filling the title, amount, and recognized category for review before saving. Speech processing depends on the browser and may happen online.
- Firestore rules require room membership and enforce that only the record creator can edit or delete their expense or payment.
- The client does not provide a switch to act as the other roommate. Contact details remain managed by each individual account.
- Room profiles, expenses, and payments are stored in Firestore; no demo data is stored in the browser.
- Review the prototype Firestore rules against your production requirements before broadly sharing the app.

Email/password, Google, and SMS phone sign-in are available in live mode. Phone sign-in uses Firebase reCAPTCHA and SMS service; delivery may be subject to Firebase quotas and billing. Room sharing and Firestore writes require the configured Firebase project and published rules.
