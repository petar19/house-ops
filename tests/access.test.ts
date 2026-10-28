import { describe, expect, it } from 'vitest';
import {
  evenShares,
  expenseMemberUids,
  featureAccess,
  firstAvailableRoute,
  memberAccess,
} from '../src/lib/utils/access';
import type { Group, GroupMember } from '../src/lib/types';

const member = (over: Partial<GroupMember> = {}): GroupMember => ({
  role: 'member',
  expectedPct: 0,
  displayName: 'x',
  email: 'x@x',
  ...over,
});

const group = (members: Record<string, GroupMember>, caps: Partial<Group['capabilities']> = {}): Group => ({
  id: 'g',
  name: 'Home',
  members,
  memberUids: Object.keys(members),
  capabilities: { expenses: true, photoSaving: false, shoppingList: true, storage: true, ...caps },
});

describe('group access', () => {
  const g = group({
    me: member({ role: 'admin', access: { storage: 'none' } }),
    partner: member(),
    brother: member({ access: { expenses: 'none', shoppingList: 'none', storage: 'view' } }),
  });

  it('gives members from before access levels full use', () => {
    expect(memberAccess(g, 'partner', 'expenses')).toBe('edit');
    expect(memberAccess(g, 'partner', 'storage')).toBe('edit');
  });

  it('applies what an admin set for a member', () => {
    expect(memberAccess(g, 'brother', 'storage')).toBe('view');
    expect(memberAccess(g, 'brother', 'expenses')).toBe('none');
  });

  it('always lets admins do everything, whatever their own entry says', () => {
    expect(memberAccess(g, 'me', 'storage')).toBe('edit');
  });

  it('treats non-members and switched-off features as no access', () => {
    expect(memberAccess(g, 'stranger', 'storage')).toBe('none');
    expect(featureAccess(g, 'partner', 'photoSaving')).toBe('none');
    expect(featureAccess(g, 'partner', 'storage')).toBe('edit');
  });

  it('keeps people without expense access out of the split', () => {
    expect(expenseMemberUids(g).sort()).toEqual(['me', 'partner']);
    expect(evenShares(g)).toEqual({ me: 50, partner: 50, brother: 0 });
  });

  it('splits evenly with rounding and copes with nobody in expenses', () => {
    const three = group({ a: member(), b: member(), c: member() });
    expect(evenShares(three)).toEqual({ a: 33.33, b: 33.33, c: 33.33 });
    const none = group({ a: member({ access: { expenses: 'none' } }) });
    expect(evenShares(none)).toEqual({ a: 0 });
  });

  it('sends someone without expenses to the first tab they can use', () => {
    expect(firstAvailableRoute({ expenses: 'none', photoSaving: 'none', shoppingList: 'none', storage: 'view' })).toBe('/storage');
    expect(firstAvailableRoute({ expenses: 'view', photoSaving: 'none', shoppingList: 'none', storage: 'none' })).toBe('/');
    expect(firstAvailableRoute({ expenses: 'none', photoSaving: 'none', shoppingList: 'none', storage: 'none' })).toBe('/reminders');
  });
});
