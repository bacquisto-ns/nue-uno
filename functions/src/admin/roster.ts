import { AdminUpdateUserInput, ApproveUserInput, ImportRosterInput } from '@nue-uno/shared';
import { FieldValue } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { adminAuth, db } from '../admin.js';
import { fail } from '../errors.js';
import { parse, requireAdmin } from '../guards.js';

type Req = Pick<CallableRequest<unknown>, 'auth' | 'data'>;

function audit(actorUid: string, action: string, target: string, after: unknown, reason?: string) {
  return db.collection('auditLog').add({
    actorUid,
    action,
    target,
    after,
    reason: reason ?? null,
    at: FieldValue.serverTimestamp(),
  });
}

async function activate(uid: string): Promise<void> {
  const user = await adminAuth.getUser(uid);
  await adminAuth.setCustomUserClaims(uid, { ...user.customClaims, active: true });
  await db.doc(`users/${uid}`).set({ status: 'active' }, { merge: true });
}

/**
 * Upsert the HR roster (PRD A3). Pending users whose email is now on the roster are activated.
 * The roster itself is never committed to git.
 */
export async function importRosterHandler(req: Req): Promise<{ ok: true; imported: number; activated: number }> {
  const { uid: actor } = requireAdmin(req);
  const { rows, replace } = parse(ImportRosterInput, req.data);

  if (replace) {
    const existing = await db.collection('roster').listDocuments();
    for (let i = 0; i < existing.length; i += 400) {
      const batch = db.batch();
      existing.slice(i, i + 400).forEach((d) => batch.delete(d));
      await batch.commit();
    }
  }
  for (let i = 0; i < rows.length; i += 400) {
    const batch = db.batch();
    for (const row of rows.slice(i, i + 400)) {
      batch.set(db.doc(`roster/${row.email}`), {
        name: row.name,
        department: row.department,
        office: row.office ?? null,
        importedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }

  const emails = new Set(rows.map((r) => r.email));
  const pending = await db.collection('users').where('status', '==', 'pending').get();
  const toActivate = pending.docs.filter((d) => emails.has(String(d.get('email'))));
  for (const d of toActivate) await activate(d.id);

  await audit(actor, 'importRoster', 'roster', { rows: rows.length, replace: !!replace, activated: toActivate.length });
  return { ok: true, imported: rows.length, activated: toActivate.length };
}

export async function approveUserHandler(req: Req): Promise<{ ok: true }> {
  const { uid: actor } = requireAdmin(req);
  const { uid } = parse(ApproveUserInput, req.data);
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) throw fail('not-found', 'BAD_REQUEST', 'No such user.');
  if (snap.get('status') === 'disabled') {
    throw fail('failed-precondition', 'DISABLED', 'Re-enable the account before approving it.');
  }
  await activate(uid);
  await audit(actor, 'approveUser', `users/${uid}`, { status: 'active' });
  return { ok: true };
}

/**
 * Moderation (api.md `adminUpdateUser`). Disabling blocks sign-in, removes the `active` claim and
 * revokes refresh tokens, so the person is signed out everywhere within the hour (sooner on their
 * next token refresh). Re-enabling restores sign-in and the `active` claim. Renames keep the
 * displayNames index unique. This is the main mitigation for password accounts (ADR-3).
 */
export async function adminUpdateUserHandler(req: Req): Promise<{ ok: true }> {
  const { uid: actor } = requireAdmin(req);
  const input = parse(AdminUpdateUserInput, req.data);
  const { uid, reason } = input;
  if (input.status === 'disabled' && uid === actor) {
    throw fail('failed-precondition', 'BAD_REQUEST', "You can't disable your own account.");
  }
  const userRef = db.doc(`users/${uid}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw fail('not-found', 'BAD_REQUEST', 'No such user.');
    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (input.displayName !== undefined) {
      const key = input.displayName.toLowerCase();
      const nameRef = db.doc(`displayNames/${key}`);
      const taken = await tx.get(nameRef);
      if (taken.exists && taken.get('uid') !== uid) {
        throw fail('failed-precondition', 'NAME_TAKEN', 'That display name is taken.');
      }
      const oldKey = String(snap.get('displayName') ?? '').toLowerCase();
      if (oldKey && oldKey !== key) tx.delete(db.doc(`displayNames/${oldKey}`));
      tx.set(nameRef, { uid });
      patch.displayName = input.displayName;
    }
    if (input.department !== undefined) patch.department = input.department;
    if (input.attendingEvent !== undefined) patch.attendingEvent = input.attendingEvent;
    if (input.status !== undefined) patch.status = input.status;
    tx.set(userRef, patch, { merge: true });
  });

  if (input.status) {
    const user = await adminAuth.getUser(uid);
    const claims = { ...user.customClaims };
    if (input.status === 'disabled') {
      delete claims.active;
      await adminAuth.updateUser(uid, { disabled: true });
      await adminAuth.setCustomUserClaims(uid, claims);
      await adminAuth.revokeRefreshTokens(uid);
    } else {
      await adminAuth.updateUser(uid, { disabled: false });
      await adminAuth.setCustomUserClaims(uid, { ...claims, active: true });
    }
  }

  const { uid: _uid, reason: _reason, ...after } = input;
  await audit(actor, 'adminUpdateUser', `users/${uid}`, after, reason);
  return { ok: true };
}
