import type { AccessLevel, Group, GroupFeature } from '../types';

export const FEATURES: GroupFeature[] = ['expenses', 'photoSaving', 'shoppingList', 'storage'];

/** The member's own setting, ignoring whether the group has the feature on. Admins: always edit. */
export function memberAccess(group: Pick<Group, 'members'>, uid: string, feature: GroupFeature): AccessLevel {
  const member = group.members[uid];
  if (!member) return 'none';
  if (member.role === 'admin') return 'edit';
  return member.access?.[feature] ?? 'edit';
}

/** What the member can actually do with a feature in this group right now. */
export function featureAccess(group: Pick<Group, 'members' | 'capabilities'>, uid: string, feature: GroupFeature): AccessLevel {
  return group.capabilities[feature] ? memberAccess(group, uid, feature) : 'none';
}

/**
 * Members who take part in the money side: only they get an expected share,
 * show up in settle-up, and can be picked as payer or debt party. Someone
 * added just to see the storage stays out of all of it.
 */
export function expenseMemberUids(group: Pick<Group, 'members'>): string[] {
  return Object.keys(group.members).filter((uid) => memberAccess(group, uid, 'expenses') !== 'none');
}

function equalSplit(count: number): number {
  return count === 0 ? 0 : Math.round((100 / count) * 100) / 100;
}

/** Equal expected shares across expense members, 0 for everyone else. */
export function evenShares(group: Pick<Group, 'members'>): Record<string, number> {
  const payers = new Set(expenseMemberUids(group));
  const pct = equalSplit(payers.size);
  return Object.fromEntries(Object.keys(group.members).map((uid) => [uid, payers.has(uid) ? pct : 0]));
}

/** The route to land on when the default (expenses) one isn't available. */
export function firstAvailableRoute(access: Record<GroupFeature, AccessLevel>): string {
  if (access.expenses !== 'none') return '/';
  if (access.storage !== 'none') return '/storage';
  if (access.shoppingList !== 'none') return '/shopping';
  if (access.photoSaving !== 'none') return '/documents';
  return '/reminders';
}
