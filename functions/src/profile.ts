import { DEFAULT_DEPARTMENTS, SaveProfileInput } from '@nue-uno/shared';
import { FieldValue } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { adminAuth, db } from './admin.js';
import { fail } from './errors.js';
import { parse, requireEmployee } from './guards.js';

type Status = 'pending' | 'active' | 'disabled';

/**
 * Create or update the caller's profile (api.md §2). On first save, the HR roster decides whether
 * the account is activated immediately or waits for admin approval (architecture ADR-3).
 * Display names are unique case-insensitively via reservations in displayNames/{lowercaseName}.
 */
export async function saveProfileHandler(
  req: Pick<CallableRequest<unknown>, 'auth' | 'data'>,
): Promise<{ ok: true; status: Status }> {
  const { uid, email } = requireEmployee(req);
  const input = parse(SaveProfileInput, req.data);
  const nameKey = input.displayName.toLowerCase();

  const status = await db.runTransaction(async (tx) => {
    const userRef = db.doc(`users/${uid}`);
    const nameRef = db.doc(`displayNames/${nameKey}`);
    const [userSnap, nameSnap, rosterSnap, configSnap] = await Promise.all([
      tx.get(userRef),
      tx.get(nameRef),
      tx.get(db.doc(`roster/${email}`)),
      tx.get(db.doc('config/app')),
    ]);

    const existing = userSnap.data();
    const roster = rosterSnap.data();
    const config = configSnap.data() ?? {};

    if (existing?.status === 'disabled') {
      throw fail('permission-denied', 'DISABLED', 'This account has been disabled.');
    }
    if (nameSnap.exists && nameSnap.get('uid') !== uid) {
      throw fail('failed-precondition', 'NAME_TAKEN', 'That display name is taken — try another.');
    }

    const rosterRequired = config.rosterRequired === true;
    const next: Status =
      existing?.status === 'active' || roster || !rosterRequired ? 'active' : 'pending';

    const departments: readonly string[] = config.departments ?? DEFAULT_DEPARTMENTS;
    const department =
      input.department && (departments.includes(input.department) || roster?.department === input.department)
        ? input.department
        : (roster?.department ?? existing?.department ?? null);

    const oldKey: string | undefined = existing?.displayName?.toLowerCase();
    if (oldKey && oldKey !== nameKey) tx.delete(db.doc(`displayNames/${oldKey}`));
    tx.set(nameRef, { uid });

    tx.set(
      userRef,
      {
        email,
        status: next,
        displayName: input.displayName,
        avatarId: input.avatarId,
        avatarColor: input.avatarColor ?? existing?.avatarColor ?? 'teal',
        department,
        attendingEvent: input.attendingEvent,
        signatureCard: input.signatureCard ?? existing?.signatureCard ?? null,
        settings: {
          effects: 'full',
          sound: false,
          haptics: true,
          emotesMuted: false,
          ...existing?.settings,
          ...input.settings,
        },
        isAdmin: req.auth?.token.admin === true,
        activeGameId: existing?.activeGameId ?? null,
        tutorialDone: input.tutorialDone ?? existing?.tutorialDone ?? false,
        updatedAt: FieldValue.serverTimestamp(),
        lastSeenAt: FieldValue.serverTimestamp(),
        ...(existing ? {} : { createdAt: FieldValue.serverTimestamp(), firstGameAt: null }),
      },
      { merge: true },
    );
    return next;
  });

  // The tutorial stamp shows up right away; later Passport recomputes keep it (user.tutorialDone).
  if (input.tutorialDone) {
    await db.doc(`passport/${uid}`).set({ milestones: FieldValue.arrayUnion('tutorial') }, { merge: true });
  }

  if (status === 'active' && req.auth?.token.active !== true) {
    const user = await adminAuth.getUser(uid);
    await adminAuth.setCustomUserClaims(uid, { ...user.customClaims, active: true });
  }
  return { ok: true, status };
}
