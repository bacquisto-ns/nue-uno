import { beforeEach, describe, expect, it } from 'vitest';
import { adminAuth, db } from '../src/admin.js';
import { requireAdmin, requirePlayer } from '../src/guards.js';
import { saveProfileHandler } from '../src/profile.js';

const PROJECT = 'demo-nue-uno';

async function clearEmulators() {
  const fsHost = process.env.FIRESTORE_EMULATOR_HOST;
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!fsHost || !authHost) throw new Error('Run via `npm test` (firebase emulators:exec)');
  await fetch(`http://${fsHost}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  await fetch(`http://${authHost}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

async function makeUser(uid: string, email: string, claims: Record<string, unknown> = {}) {
  await adminAuth.createUser({ uid, email, emailVerified: true });
  if (Object.keys(claims).length) await adminAuth.setCustomUserClaims(uid, claims);
  return {
    auth: {
      uid,
      token: { email, email_verified: true, ...claims } as never,
      rawToken: '',
    },
  };
}

const profile = (displayName: string, extra: Record<string, unknown> = {}) => ({
  displayName,
  avatarId: 'fox',
  attendingEvent: 'yes',
  ...extra,
});

beforeEach(clearEmulators);

describe('saveProfile', () => {
  it('activates immediately when the roster is not required', async () => {
    const ctx = await makeUser('u1', 'priya@nuesynergy.com');
    const res = await saveProfileHandler({ ...ctx, data: profile('Priya') });
    expect(res).toEqual({ ok: true, status: 'active' });
    const user = (await db.doc('users/u1').get()).data()!;
    expect(user).toMatchObject({
      email: 'priya@nuesynergy.com',
      displayName: 'Priya',
      status: 'active',
      settings: { effects: 'full', sound: false },
    });
    expect((await adminAuth.getUser('u1')).customClaims).toMatchObject({ active: true });
  });

  it('records the finished tutorial and stamps the Passport (and keeps it on later saves)', async () => {
    const ctx = await makeUser('ut', 'tia@nuesynergy.com');
    await saveProfileHandler({ ...ctx, data: profile('Tia') });
    expect((await db.doc('users/ut').get()).get('tutorialDone')).toBe(false);
    await saveProfileHandler({ ...ctx, data: profile('Tia', { tutorialDone: true }) });
    await saveProfileHandler({ ...ctx, data: profile('Tia', { tutorialDone: null }) });
    expect((await db.doc('users/ut').get()).get('tutorialDone')).toBe(true);
    expect((await db.doc('passport/ut').get()).get('milestones')).toEqual(['tutorial']);
  });

  it('accepts null optional fields (the callable SDK sends undefined as null)', async () => {
    const ctx = await makeUser('un', 'nell@nuesynergy.com');
    const res = await saveProfileHandler({
      ...ctx,
      data: profile('Nell', { department: null, avatarColor: null, signatureCard: null }),
    });
    expect(res.status).toBe('active');
    expect((await db.doc('users/un').get()).get('avatarColor')).toBe('teal');
  });

  it('keeps off-roster users pending when the roster is required', async () => {
    await db.doc('config/app').set({ rosterRequired: true });
    const ctx = await makeUser('u2', 'info@nuesynergy.com');
    expect(await saveProfileHandler({ ...ctx, data: profile('Shared Box') })).toMatchObject({
      status: 'pending',
    });
    expect((await adminAuth.getUser('u2')).customClaims?.active).toBeUndefined();
  });

  it('activates roster members and takes their department from the roster', async () => {
    await db.doc('config/app').set({ rosterRequired: true });
    await db.doc('roster/dana@nuesynergy.com').set({ name: 'Dana', department: 'Finance' });
    const ctx = await makeUser('u3', 'Dana@NueSynergy.com');
    expect(await saveProfileHandler({ ...ctx, data: profile('Dana') })).toMatchObject({
      status: 'active',
    });
    expect((await db.doc('users/u3').get()).get('department')).toBe('Finance');
  });

  it('enforces unique display names case-insensitively and frees old names', async () => {
    const a = await makeUser('ua', 'a@nuesynergy.com');
    const b = await makeUser('ub', 'b@nuesynergy.com');
    await saveProfileHandler({ ...a, data: profile('Lee') });
    await expect(saveProfileHandler({ ...b, data: profile('LEE') })).rejects.toMatchObject({
      code: 'failed-precondition',
      details: { reason: 'NAME_TAKEN' },
    });
    await saveProfileHandler({ ...a, data: profile('Lee Two') });
    await expect(saveProfileHandler({ ...b, data: profile('lee') })).resolves.toMatchObject({
      ok: true,
    });
  });

  it('rejects outsiders, bad input and disabled accounts; accepts unverified company emails', async () => {
    const outsider = await makeUser('ux', 'x@gmail.com');
    await expect(saveProfileHandler({ ...outsider, data: profile('X') })).rejects.toMatchObject({
      details: { reason: 'NOT_EMPLOYEE' },
    });
    // Password accounts aren't email-verified; the company domain is the lock (ADR-3).
    await makeUser('uv', 'v@nuesynergy.com');
    await expect(
      saveProfileHandler({
        auth: { uid: 'uv', token: { email: 'v@nuesynergy.com', email_verified: false } as never, rawToken: '' },
        data: profile('Vee'),
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(saveProfileHandler({ auth: undefined, data: profile('Nobody') })).rejects.toMatchObject({
      code: 'unauthenticated',
    });

    const ok = await makeUser('uo', 'o@nuesynergy.com');
    await expect(saveProfileHandler({ ...ok, data: profile('') })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await db.doc('users/uo').set({ status: 'disabled' });
    await expect(saveProfileHandler({ ...ok, data: profile('Olive') })).rejects.toMatchObject({
      details: { reason: 'DISABLED' },
    });
  });
});

describe('guards', () => {
  const req = (token: Record<string, unknown>) => ({
    auth: { uid: 'g', token: { email: 'g@nuesynergy.com', email_verified: true, ...token } as never, rawToken: '' },
    data: {},
  });

  it('requirePlayer needs the active claim; requireAdmin needs admin', () => {
    expect(() => requirePlayer(req({}))).toThrow(/approval/);
    expect(requirePlayer(req({ active: true })).uid).toBe('g');
    expect(() => requireAdmin(req({ active: true }))).toThrow(/Admins only/);
    expect(requireAdmin(req({ active: true, admin: true })).email).toBe('g@nuesynergy.com');
  });
});
