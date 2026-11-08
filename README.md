# HouseOps

A household management app — started as shared expense tracking, now covers receipt/bill archiving with OCR too, with more household automation planned. Built with Svelte 5 + Vite, Firebase (Auth + Firestore) as the backend, deployed to GitHub Pages. Paired with a [WhatsApp bot](../expense-tracker-bot) that bridges chats into the app.

## Groups and capabilities

A **group** is a named container with a checklist of enabled capabilities — not every group needs every feature:

- **Expenses**: members, percentage-based expected shares, a period picker with money out / in / net for it, an optional link from an expense to the scanned bill it was paid with (opens the receipt and its products), a linked WhatsApp chat for logging `name, amount` messages as expenses, stats, and settle-up ("who owes whom"). Settle-up also folds in direct **debts** — an "X owes Y" balance added from the Settle up tab or via `@name, amount` in the linked chat (see the bot repo) — which stay active regardless of date range until marked settled.
- **Photo saving**: a linked WhatsApp chat whose photos get saved to a folder on the machine running the bot — e.g. a family "bills" chat, or a "Trip" group with no expense tracking at all. An OCR toggle (Gemini-powered, run by a separate script — see the bot repo) sorts photos into vendor-named folders and extracts vendor/date/amount/category into the app's **Documents** tab.
- **Shopping list**: several named lists per group (`shoppingLists`; the first is made automatically). Items are ticked off in the shop and stay struck through until cleared. A product can be set to repeat every N days (`shoppingRestock/{productKey}`, from a list item's ⋯ or the product's page): ticking it off starts a group reminder that, when due, has the bot put it back on its list and say so in the group chat — see **Reminders** below. Anything running low or empty in Storage can be pulled onto a list with one tap, or used to start a new list.
- **Storage**: where things are kept — pantry, chest freezer, garage shelves, drawers. Each unit is a template (e.g. 3 layers × 4 boxes, or 5 shelves × left/middle/right) that the 2D view is generated from; tap a cell to see, add, adjust (exact amount or a rough "plenty/some/low/empty"), edit, move or delete its items. Item names autocomplete from a built-in catalog (`src/lib/storage/systemCatalog.ts`, English + Croatian) plus everything the group has used before, filtered to the unit's categories so the freezer doesn't suggest screws. Every add/move/edit/removal goes into an append-only history (`storageEvents`, create-only in the rules), shown per item. Units marked as **containers** (a box, bag, toolbox — any kind, with a custom emoji icon) can be put into a cell of another unit and nest to any depth; moving one moves everything in it, and places read as full paths ("Garage › Shelf 2 › Left › Red toolbox › Top tray"). **Import** (Storage → 📥 Import) adds a whole shopping trip at once into an *Unsorted* container: typed or pasted as a list (rows with autocomplete; Enter moves on; pasting several lines splits them), or read off a scanned bill you pick from the Documents list (the OCR watcher in the bot repo extracts its products on request — see `receiptItemRequests`). From Unsorted, items are moved as usual, or put back where they were last put away after a preview. Moving an item onto the same thing counted the same way adds to it instead of making a second entry. **Products and prices**: a built-in list of ~460 products (English + Croatian names, aliases such as "piletina prsa" / "pileći file" for Chicken breast, and a unit to compare prices by) lives in `src/lib/storage/systemCatalog.ts`; the Products tab shows every product the group uses, whether in storage or not, and lets it edit names/aliases/categories (saved as the group's own version), hide built-in ones, and merge duplicates. Imports and adds can carry a price (plus shop, brand, pack size — read by Gemini from bills and pasted receipts), recorded as `purchases` filed under the product, so each product page shows its price history per kg / l / piece across shops. A typed list may start with a header line (`i, q, u, p, s, b`) to set its own column order. **Rooms** sit at the top: a room has no grid, it just holds storage units (any kind — furniture too, not only containers) and loose things like the vacuum, so paths start with the room name without it being typed into every name. The Storage page groups by room, with a *No room* section (the default) for anything not yet assigned. Every unit and cell has a **Share** link (`#/storage/<unit>?group=<group>[&cell=…]`, which switches to that group on open) with a printable QR label and, on Android Chrome, a button to write it onto an NFC sticker.

Taking something out because it ran out is **Used up** (logged apart from a plain delete, and offers to put it on the shopping list); the product still remembers where it lives, so the next import offers to put it back there. Items can carry an **expiry date**: the Storage page and home page list what to use soon, and **expiry alerts** (Settings, per group: on/off, which WhatsApp chat — the expenses chat or another — the time of day and any number of "N days before") are posted by the bot (`storageAlerts/{groupId}`). Names can be **dragged** between cells of a unit (press and hold first on a phone). A room can have a **floor plan** — a rows × columns grid where its furniture and boxes are placed and sized by tapping. Import can also read a **photo** (a paper receipt, or the shopping itself on the table): it's shrunk on the phone, read by Gemini in the bot like a pasted receipt, and deleted once read. Stats shows spending by shop and product category from the recorded purchases.

The app opens on a **home page**: this month's money in/out, the shopping lists, things to use soon, what's waiting in Unsorted, and reminders coming up — each only for features the group uses and the member can see. Expenses moved to `#/expenses`.

**Per-member access**: a group admin can set each member's access to each feature in Settings → Access — *Can edit*, *View only*, or *None* (tab hidden). Typical use: someone who doesn't live here gets *View only* on Storage and *None* on everything else. A member with no Expenses access is out of the money side entirely — no expected share (shares re-split evenly among the rest), not in settle-up, not offered as payer or debt party. Admins always have full access. It's enforced in `firestore.rules` (`canView`/`canEdit`), not just by hiding tabs; the WhatsApp bot (Admin SDK) isn't restricted by it.

A group's Settings tab (site-admin only for anything touching the bot's filesystem) is where all of this is configured — pick a WhatsApp chat, a folder, toggle OCR, customize its extraction instruction. The active group is picked from the switcher in the nav; which tabs show up depends on that group's enabled capabilities.

Site-wide settings (who's allowed to sign in, running a one-off WhatsApp-export migration) live in the admin panel — the gear icon next to the language picker, admin accounts only.

## Reminders

Not tied to a group's capability checklist, since a personal reminder isn't tied to a group at all — the **Reminders** tab is always visible and covers two kinds, from the app or from WhatsApp itself (`?reminder(WHEN[, REPEAT]) text` — see the bot repo for the syntax):

- **Personal** (`reminders/{id}`): a one-off or recurring nudge DMed to you (or someone else in a household group, if you set one for them) over WhatsApp.
- **Group** (`groups/{groupId}/reminders/{id}`): shared, visible/manageable by any member, delivered to that group's linked WhatsApp chat. Deliberately a *separate* collection from personal reminders rather than one flat collection with a `groupId` field — Firestore can only verify a list query (which is what the Reminders tab runs) is safe when the security rule's checks come from the query/path itself, and a group-membership check needs the group id from the document's path for that to work. Getting this wrong the first time meant every reminder was invisible in its own list until the moment it fired, then appeared to vanish again — see the bot repo's README for the full story.

Once you're on WhatsApp, you can also react to a reminder (an ack — doesn't change its schedule) or reply **`postpone N`** to push it out N days. The **Shopping list** capability builds directly on this: a recurring item schedules its own reminder rather than the bot needing to know anything about shopping lists specifically.

## Installing on a phone

It's an installable web app (`public/manifest.webmanifest`, icons in `public/`): in Chrome on Android use *Install app* / *Add to Home screen*, on iPhone Safari's *Share → Add to Home Screen*. `public/sw.js` is the service worker: it keeps the app's own files on the phone, so it opens without a connection — the page is always fetched fresh when online, built files (hashed names) come from the cache. Firestore data isn't cached across restarts (persistent cache caused stale live updates before, see `src/lib/firebase.ts`), but an open app keeps showing what it loaded and queues changes until it's back online.

## Expiry suggestions

`src/lib/storage/shelfLife.ts` gives each built-in food product a food type (poultry, cheese, bread, frozen…) with typical days at room temperature, in the fridge and in the freezer. Each storage unit has a climate (set in its editor; a chest defaults to freezer, a container takes after where it sits). Import rows and the add form suggest a date for where the product usually goes; dates someone keeps or types are saved per product in `groups/{id}/shelfLife`, and those win next time. Products nothing knows about can be sent to Gemini in one go (*Ask AI* on Import → `shelfLifeRequests`, answered by the OCR watcher) — the answer is saved the same way, so each product is asked about once. Moving an item into a freezer restarts its clock at the freezer time; taking it out shortens it to the fridge/room time.

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
