# Helm / June Family Finance

Working multi-user family finance web app built from the original single-file prototype.

## What it includes

- Secure Supabase auth for two family members
- Shared household data with invite code join flow
- Persistent database storage with row-level security
- CRUD for income, expenses, recurring bills, categories, savings goals, subscriptions, cash trackers, net worth accounts, debts, and sinking funds
- Auto-recalculating dashboard totals and category breakdowns
- Weekly totals, monthly totals, date filters, notes, and CSV export
- Paid/unpaid bills, upcoming bills, overspending alerts, who-entered-it tracking
- Receipt photo upload with Supabase Storage
- Mobile-responsive layout and installable PWA support
- Ready for Vercel deployment

## Stack

- Next.js App Router
- Supabase Auth + Postgres + Storage
- TypeScript
- Vanilla CSS tuned from the original warm dashboard prototype

## Local setup

1. Create a Supabase project.
2. In Supabase SQL Editor, run [supabase/schema.sql](/C:/Users/ladyb/Documents/Codex/2026-04-17-files-mentioned-by-the-user-family-2/supabase/schema.sql).
3. Copy `.env.example` to `.env.local`.
4. Fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

5. Install dependencies:

```bash
npm install
```

6. Start the app:

```bash
npm run dev
```

## Vercel deploy

1. Push this folder to GitHub.
2. Import the repo into Vercel.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel project settings.
4. Deploy.

## Household flow

1. User one signs up and creates the `Helm / June Family` household.
2. The app generates an invite code.
3. User two signs up and joins with that invite code.
4. Both users now share the same live dashboard and records.

## Notes

- The app assumes the Supabase Storage bucket created by `schema.sql` is available for receipt uploads.
- The PWA manifest and service worker are intentionally lightweight so Vercel deployment stays simple.
- If you want stricter ownership rules later, the current RLS design is a good base for promoting owner-only edits on selected tables.
