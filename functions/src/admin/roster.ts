import { ApproveUserInput, ImportRosterInput } from '@nue-uno/shared';
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
