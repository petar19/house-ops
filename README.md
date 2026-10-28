# HouseOps

A household management app — started as shared expense tracking, now covers receipt/bill archiving with OCR too, with more household automation planned. Built with Svelte 5 + Vite, Firebase (Auth + Firestore) as the backend, deployed to GitHub Pages. Paired with a [WhatsApp bot](../expense-tracker-bot) that bridges chats into the app.

## Groups and capabilities

A **group** is a named container with a checklist of enabled capabilities — not every group needs every feature:

- **Expenses**: members, percentage-based expected shares, a linked WhatsApp chat for logging `name, amount` messages as expenses, stats, and settle-up ("who owes whom"). Settle-up also folds in direct **debts** — an "X owes Y" balance added from the Settle up tab or via `@name, amount` in the linked chat (see the bot repo) — which stay active regardless of date range until marked settled.
- **Photo saving**: a linked WhatsApp chat whose photos get saved to a folder on the machine running the bot — e.g. a family "bills" chat, or a "Trip" group with no expense tracking at all. An OCR toggle (Gemini-powered, run by a separate script — see the bot repo) sorts photos into vendor-named folders and extracts vendor/date/amount/category into the app's **Documents** tab.
- **Shopping list**: a flat per-group list of items, each optionally set to recur every N days (a plain manual number for now, no usage-based learning) — see the **Reminders** section below for how a due item nudges the group.
- **Storage**: where things are kept — pantry, chest freezer, garage shelves, drawers. Each unit is a template (e.g. 3 layers × 4 boxes, or 5 shelves × left/middle/right) that the 2D view is generated from; tap a cell to see, add, adjust (exact amount or a rough "plenty/some/low/empty"), edit, move or delete its items. Item names autocomplete from a built-in catalog (`src/lib/storage/systemCatalog.ts`, English + Croatian) plus everything the group has used before, filtered to the unit's categories so the freezer doesn't suggest screws. Every add/move/edit/removal goes into an append-only history (`storageEvents`, create-only in the rules), shown per item.

A group's Settings tab (site-admin only for anything touching the bot's filesystem) is where all of this is configured — pick a WhatsApp chat, a folder, toggle OCR, customize its extraction instruction. The active group is picked from the switcher in the nav; which tabs show up depends on that group's enabled capabilities.

Site-wide settings (who's allowed to sign in, running a one-off WhatsApp-export migration) live in the admin panel — the gear icon next to the language picker, admin accounts only.

## Reminders

Not tied to a group's capability checklist, since a personal reminder isn't tied to a group at all — the **Reminders** tab is always visible and covers two kinds, from the app or from WhatsApp itself (`?reminder(WHEN[, REPEAT]) text` — see the bot repo for the syntax):

- **Personal** (`reminders/{id}`): a one-off or recurring nudge DMed to you (or someone else in a household group, if you set one for them) over WhatsApp.
- **Group** (`groups/{groupId}/reminders/{id}`): shared, visible/manageable by any member, delivered to that group's linked WhatsApp chat. Deliberately a *separate* collection from personal reminders rather than one flat collection with a `groupId` field — Firestore can only verify a list query (which is what the Reminders tab runs) is safe when the security rule's checks come from the query/path itself, and a group-membership check needs the group id from the document's path for that to work. Getting this wrong the first time meant every reminder was invisible in its own list until the moment it fired, then appeared to vanish again — see the bot repo's README for the full story.

Once you're on WhatsApp, you can also react to a reminder (an ack — doesn't change its schedule) or reply **`postpone N`** to push it out N days. The **Shopping list** capability builds directly on this: a recurring item schedules its own reminder rather than the bot needing to know anything about shopping lists specifically.

## Setup

```bash
npm install
npm run dev
```

Firebase config lives directly in `src/lib/firebase.ts` (the API key is public by design for Firebase web apps — access control is entirely in `firestore.rules`, not in hiding that config).

- `npm run check` — svelte-check + TypeScript
- `npm run test` — vitest
- `npm run build` — production build, deployed automatically to GitHub Pages on push to `master` via GitHub Actions

## Firestore rules

`firestore.rules` is the actual security boundary — deploy after any change:

```bash
firebase deploy --only firestore:rules --project expense-tracker-5acdb
```
