import { beforeEach, describe, expect, it } from 'vitest';
import { adminAuth, db } from '../src/admin.js';
import { adminRouter } from '../src/event/adminRouter.js';
import { call, makePlayer, makeUser, reasonOf, resetEmulators } from './helpers.js';

beforeEach(resetEmulators);

const update = (ctx: Parameters<typeof call>[0], payload: Record<string, unknown>) => adminRouter(call(ctx, { action: 'adminUpdateUser', payload }));

describe('adminUpdateUser', () => {
  it('disables (blocks sign-in, drops the claim, revokes tokens) and re-enables, with an audit trail', async () => {
    const boss = await makeUser('boss', 'boss@nuesynergy.com', { active: true, admin: true });
    const ana = await makePlayer('Ana');
    expect(await reasonOf(update(ana, { uid: 'ana', status: 'disabled', reason: 'test' }))).toBe('NOT_ADMIN');

    expect(await update(boss, { uid: 'ana', status: 'disabled', reason: 'Impersonating a coworker' })).toEqual({ ok: true });
    const off = await adminAuth.getUser('ana');
    expect(off.disabled).toBe(true);
    expect(off.customClaims?.active).toBeUndefined();
    expect(off.tokensValidAfterTime).toBeTruthy();
    expect((await db.doc('users/ana').get()).get('status')).toBe('disabled');
    const log = await db.collection('auditLog').where('action', '==', 'adminUpdateUser').get();
    expect(log.docs[0]!.data()).toMatchObject({ target: 'users/ana', reason: 'Impersonating a coworker', after: { status: 'disabled' } });

    await update(boss, { uid: 'ana', status: 'active', reason: 'Verified in person' });
    const on = await adminAuth.getUser('ana');
    expect(on.disabled).toBe(false);
    expect(on.customClaims?.active).toBe(true);
    expect((await db.doc('users/ana').get()).get('status')).toBe('active');
  });

  it('renames with a unique name, fixes department/attendance, and refuses self-disable', async () => {
    const boss = await makeUser('boss', 'boss@nuesynergy.com', { active: true, admin: true });
    await makePlayer('Ana');
    await makePlayer('Ben');
    expect(await reasonOf(update(boss, { uid: 'ana', displayName: 'Ben', reason: 'rename' }))).toBe('NAME_TAKEN');
    await update(boss, { uid: 'ana', displayName: 'Anastasia', department: 'Finance', attendingEvent: 'no', reason: 'fix typo' });
    expect((await db.doc('users/ana').get()).data()).toMatchObject({ displayName: 'Anastasia', department: 'Finance', attendingEvent: 'no' });
    expect((await db.doc('displayNames/anastasia').get()).get('uid')).toBe('ana');
    expect((await db.doc('displayNames/ana').get()).exists).toBe(false);

    expect(await reasonOf(update(boss, { uid: 'boss', status: 'disabled', reason: 'oops' }))).toBe('BAD_REQUEST');
    expect(await reasonOf(update(boss, { uid: 'ana', reason: 'nothing' }))).toBe('BAD_REQUEST');
    expect(await reasonOf(update(boss, { uid: 'ana', status: 'disabled' }))).toBe('BAD_REQUEST'); // reason required
  });
});
