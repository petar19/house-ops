export type GroupFeature = 'expenses' | 'photoSaving' | 'shoppingList' | 'storage';

// none: tab hidden and data unreadable; view: read-only; edit: full use.
export type AccessLevel = 'none' | 'view' | 'edit';

export interface GroupMember {
  role: 'admin' | 'member';
  expectedPct: number;
  displayName: string;
  email: string;
  // Set by a group admin per feature; a missing entry means 'edit', so
  // members from before this existed keep full access. Admins always have
  // full access regardless. Enforced in firestore.rules, not just the UI.
  access?: Partial<Record<GroupFeature, AccessLevel>>;
}

// groups/{groupId}/notificationPrefs/{uid} — kept out of the shared `members`
// map so the security rule can cleanly scope "you may only touch your own
// preference" without needing to diff one nested key inside a shared field.
export interface NotificationPref {
  uid: string;
  enabled: boolean;
}

// Cheap booleans purely deciding which tabs/sections show for this group —
// the actual config for an enabled capability lives in its own collection
// (whatsappIntegrations, photoSavingConfig below), same pattern either way,
// so permission rules stay simple and per-collection instead of needing
// field-level rules on this one document.
export type GroupCapabilities = Record<GroupFeature, boolean>;

export interface Group {
  id: string;
  name: string;
  members: Record<string, GroupMember>;
  memberUids: string[];
  capabilities: GroupCapabilities;
}

export interface Subitem {
  name: string;
  price: number;
  count?: number;
}

export interface ExpenseLocation {
  lat: number;
  lng: number;
  label?: string;
}

export interface Expense {
  id: string;
  name: string;
  description?: string;
  price: number;
  itemCount?: number;
  paidBy: string;
  categories: string[];
  date: string; // ISO date (yyyy-MM-dd)
  location: ExpenseLocation | null;
  subitems: Subitem[];
  createdBy: string;
  createdAt: number;
  source: 'manual' | 'migrated' | 'whatsapp-bot';
}

export interface Category {
  id: string;
  name: string;
  keywords: string[];
  color?: string;
}

export interface KnownName {
  name: string; // normalized key (doc id)
  displayName: string;
  count: number;
  lastUsed: number;
}

export interface NameAlias {
  id: string;
  names: string[];
  canonicalName: string;
}

// whatsappIntegrations/{groupId} — doc id is the app group's own id, written
// by the admin panel and read live by the bot (no restart needed to pick up
// a change). Managed by that group's admin, not a site admin.
export interface WhatsAppIntegration {
  whatsappGroupJid: string | null;
  senderMap: Record<string, string>;
  announcementTemplate?: string;
}

// whatsappGroups/{jid} — every WhatsApp group the bot account can currently
// see, published by the bot on each connect so an admin can pick one from a
// dropdown instead of needing a jid from a CLI tool.
export interface DiscoveredWhatsAppGroup {
  jid: string;
  subject: string;
  lastSeenAt: number;
}

// whatsappIntegrations/{groupId}/unmappedSenders/{jid} — a WhatsApp sender
// the bot has seen in this group's linked chat but hasn't been mapped to an
// app member yet; written by the bot, resolved (and deleted) from the panel.
export interface UnmappedWhatsAppSender {
  jid: string;
  pushName: string;
  lastSeenAt: number;
}

// botStatus/whatsapp — a heartbeat the bot refreshes every few minutes so the
// panel can show it as online/offline without needing to reach the process.
export interface BotStatus {
  connected: boolean;
  lastSeenAt: number;
}

// photoSavingConfig/{groupId} — doc id is the app group's own id, same
// pattern as WhatsAppIntegration above. Config for a group's "Photo saving"
// capability: which WhatsApp chat's photos get saved to which local folder,
// and whether the OCR watcher should sort them. Site-admin only (unlike
// WhatsAppIntegration): it exposes a raw filesystem path on the bot's
// machine, which a plain group admin isn't necessarily trusted with.
export interface PhotoSavingConfig {
  whatsappGroupJid: string | null;
  folderPath: string;
  ocrEnabled: boolean;
  ocrInstruction?: string;
}

// groups/{groupId}/documents/{id} — a summary of one OCR'd receipt/bill,
// written by the OCR watcher (Admin SDK, bypasses rules). Includes the full
// OCR text — cheap to store (Firestore bills per-write, not per-byte) and
// cheap to show (the Documents tab only ever fetches these on demand).
export interface DocumentRecord {
  id: string;
  vendor: string;
  date: string | null;
  amount: number | null;
  category: string | null;
  fullText: string;
  sourceFile: string;
  processedAt: string;
  // The products on the bill, read on request for Storage → Import (see
  // ReceiptItemRequest) — absent until someone imports from this bill.
  lineItems?: ReceiptLineItem[];
}

export interface ReceiptLineItem {
  raw: string; // as printed, e.g. "ZDR.JOG 1,5% 1L"
  name: string; // cleaned up by Gemini, reusing the group's own item names
  quantity: number | null;
  unit: string | null;
}

// groups/{groupId}/receiptTextRequests/{id} — a receipt pasted as text
// (e.g. a shop's digital receipt) for Storage → Import; the OCR watcher reads
// its products with Gemini into `items` and sets status 'done' or 'error'.
export interface ReceiptTextRequest {
  status: 'pending' | 'done' | 'error';
  requestedBy: string;
  requestedAt: number;
  text: string;
  items?: ReceiptLineItem[];
  error?: string;
}

// groups/{groupId}/receiptItemRequests/{documentId} — the app asks for a
// bill's products ('pending'); the OCR watcher (bot repo, receiptItems.ts)
// reads them off its stored text into the document's lineItems and marks
// this 'done' or 'error'. importedAt is set once they've been added to
// Unsorted, so the bill list can say so.
export interface ReceiptItemRequest {
  status: 'pending' | 'done' | 'error';
  requestedBy: string;
  requestedAt: number;
  count?: number;
  error?: string;
  importedAt?: number | null;
}

// groups/{groupId}/documentVendors/{vendorSlug} — one doc per vendor
// "folder", same aggregate pattern as KnownName above, so the Documents tab
// can list vendors cheaply without loading every document up front.
export interface DocumentVendor {
  displayName: string;
  count: number;
  lastDocumentAt: string;
}

// groups/{groupId}/debts/{id} — a direct "X owes Y" obligation, separate from
// the paid-vs-expected-share math expenses already do. creditorUid is owed
// the money, debtorUid owes it. Stays "active" (affects settle-up balances)
// until settled=true, regardless of date — it's a standing balance, not a
// per-period line item, so settle-up includes every unsettled debt no matter
// which date range is picked, on top of expenses within that range.
// whatsappMessageId lets the bot dedupe/revoke the same way expenses do.
export interface Debt {
  id: string;
  creditorUid: string;
  debtorUid: string;
  amount: number;
  description?: string;
  date: string; // ISO yyyy-MM-dd, display only — not used to filter into settle-up
  settled: boolean;
  createdBy: string;
  createdAt: number;
  source: 'manual' | 'whatsapp-bot';
  whatsappMessageId?: string | null;
}

// reminders/{id} — PERSONAL reminders only (a DM to targetUid's own linked
// WhatsApp account, resolved from any group's senderMap that happens to
// mention them — see the bot's findWhatsAppJidForUid; no separate "link your
// WhatsApp" step). Group-scoped reminders instead live at
// groups/{groupId}/reminders — kept out of this collection specifically so
// their group-membership check in firestore.rules can use the group id from
// the document's PATH rather than a field on it (a flat collection with a
// `groupId` field turned out to make every list query here come back
// permission-denied — Firestore can only prove a list query safe when any
// get() calls in the rule resolve from the path/query itself).
export interface Reminder {
  id: string;
  ownerUid: string;
  scope: 'personal' | 'group';
  groupId?: string; // set on group-scoped reminders even though it's also implied by their subcollection path — keeps the bot's collectionGroup-query handling simple
  targetUid?: string; // personal only; defaults to ownerUid when unset
  text: string;
  scheduleType: 'once' | 'recurring';
  nextTriggerAt: string; // ISO datetime, local time (no timezone conversion — see bot's reminderScheduler.ts)
  // Calendar-based repeat (periodUnit/periodAmount, set by the app's own
  // picker) and fixed-duration repeat (periodSeconds, set by the WhatsApp
  // `?reminder(WHEN, REPEAT)` freeflow syntax, e.g. "7d") are mutually
  // exclusive ways to express a recurring schedule.
  periodUnit?: 'day' | 'week' | 'month';
  periodAmount?: number;
  periodSeconds?: number;
  // Fires still to go (counting the one currently pending) for a reminder
  // created with ?reminder(WHEN, FREQ, TIMES); unset means it repeats forever.
  timesRemaining?: number;
  status: 'active' | 'paused' | 'done';
  createdAt: number;
  lastSentAt?: number | null;
  lastMessageId?: string | null;
  // Set when someone reacts to the WhatsApp reminder message — purely an
  // informational ack for now, doesn't change the schedule (see the bot's
  // recordReminderAck in whatsappBot.ts).
  lastAck?: string | null;
  lastAckAt?: number | null;
  source: 'app' | 'whatsapp-bot';
}

// groups/{groupId}/shoppingItems/{id} — the "nabava" capability's flat list.
// restockIntervalDays is the deliberately dumb version of "how often does
// this run out" (a fixed number the user sets by hand) rather than anything
// learned from purchase history — reminderId links to the /reminders doc
// that pings the group chat when it's due, so marking an item bought (which
// resets lastBoughtAt and the linked reminder's nextTriggerAt) is the one
// place that needs to know about both collections.
export interface ShoppingItem {
  id: string;
  name: string;
  active: boolean;
  restockIntervalDays: number | null;
  lastBoughtAt: string | null; // ISO yyyy-MM-dd
  addedAt: number;
  reminderId: string | null;
  source: 'manual';
}

// ── Storage capability ────────────────────────────────────────────────────
// A unit (pantry shelving, chest freezer, garage drawers…) is a fixed tree:
// unit → level (shelf / layer / drawer / spot) → cell (a rows×cols grid
// inside each level). The template numbers are all there is to its shape —
// the 2D view is generated from them, nothing is modelled by hand. Cell ids
// are "level.row.col", 1-based, so they stay stable while the unit only
// grows; shrinking it is refused while items still sit in a removed cell.
// 'room' is the top of the tree: no grid, it just holds other units (shelves,
// a freezer, boxes) plus loose things (the vacuum on the floor). It has the
// single cell 1.1.1, so units/items "in the room" sit there, and every
// path below it starts with the room's name without anyone typing it.
export type StorageUnitKind = 'shelving' | 'chest' | 'drawers' | 'custom' | 'room';

// groups/{groupId}/storageUnits/{id}
export interface StorageUnit {
  id: string;
  name: string;
  kind: StorageUnitKind;
  levels: number;
  rows: number;
  cols: number;
  // Storage category ids (system ids from storageCatalog.ts, or a doc id
  // from storageCategories) — drive which catalog items autocomplete offers.
  categories: string[];
  levelNames: Record<string, string>; // key: level number as a string
  cellNames: Record<string, string>; // key: cell id
  icon?: string | null; // emoji; falls back to the kind's icon
  // A container (box, bag, tackle box…) that can be put into a cell of
  // another unit; everything in it travels along when it's moved.
  movable?: boolean;
  // Where a movable unit currently sits. Null/absent = loose (top-level),
  // which is also what every fixed unit (freezer, shelves) always is.
  parent?: StoragePlacement | null;
  // The group's one "Unsorted" container, where imported items land until
  // they're put away (created on first import).
  inbox?: boolean;
  createdAt: number;
  createdBy: string;
}

export interface StoragePlacement {
  unitId: string;
  cellId: string;
  cells?: string[] | null; // when it takes up several cells (see StorageItem.cells)
  span?: StorageSpan | null; // older placements only
}

export type StorageLevel = 'plenty' | 'some' | 'low' | 'empty';

// How many levels/rows/cols an item takes up, counted from its cellId (the
// top, back, left corner) — a tall freezer item is { levels: 2, rows: 1,
// cols: 1 }. Cells aren't exclusive: smaller items can share any covered cell.
export interface StorageSpan {
  levels: number;
  rows: number;
  cols: number;
}

// groups/{groupId}/storageItems/{id} — one entry per thing per cell. The
// same thing in two places is two entries; search shows both.
export interface StorageItem {
  id: string;
  unitId: string;
  cellId: string; // the item's anchor cell (the first of `cells`)
  // Exactly which cells it takes up, when more than one — any shape, e.g. both
  // depths of a shelf, or an L. Older entries used `span` (a box from the
  // anchor) instead; both are read, new writes use `cells`.
  cells?: string[] | null;
  span?: StorageSpan | null;
  name: string;
  nameKey: string; // normalizeText(name) — also the group catalog doc id
  // Exact ("3 pcs", "500 g") or vague ("some") — switchable per item.
  qtyMode: 'count' | 'level';
  amount: number | null;
  unit: string | null;
  level: StorageLevel | null;
  expiry: string | null; // ISO yyyy-MM-dd
  note: string;
  addedAt: number;
  addedBy: string;
  updatedAt: number;
  updatedBy: string;
}

// groups/{groupId}/storageCatalog/{nameKey} — every name this group has
// used, same aggregate idea as KnownName. Overrides the built-in system
// catalog entry with the same key (so a group's own categories/unit win).
export interface StorageCatalogEntry {
  id: string;
  name: string;
  categories: string[];
  unit: string | null;
  count: number;
  lastUsed: number;
  unitIds: string[]; // storage units it has been put in — ranks it higher there
  // Where it was last put away (never Unsorted) — the "usually goes" hint.
  lastPlace?: StoragePlacement | null;
}

// groups/{groupId}/storageCategories/{id} — a group's own categories on top
// of the built-in ones.
export interface StorageCategory {
  id: string;
  name: string;
}

// groups/{groupId}/storageEvents/{id} — append-only history (rules allow
// create only). Place labels are copied in as they were at the time, so the
// log still reads right after a cell is renamed or a unit deleted.
export interface StorageEvent {
  id: string;
  at: number;
  by: string;
  action: 'add' | 'remove' | 'move' | 'edit';
  itemId: string;
  itemName: string;
  unitId: string;
  cellId: string;
  place: string;
  toUnitId?: string;
  toCellId?: string;
  toPlace?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
}
