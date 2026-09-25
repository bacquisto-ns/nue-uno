import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { createEnv, personas } from './env.js';

let env: RulesTestEnvironment;

const as = (uid: keyof typeof personas) => env.authenticatedContext(uid, personas[uid]).firestore();

beforeAll(async () => {
  env = await createEnv();
});
afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'config/app'), { currentSeasonId: 's1' });
    await setDoc(doc(db, 'users/player'), { displayName: 'Player' });
    await setDoc(doc(db, 'users/pending'), { displayName: 'Pending', status: 'pending' });
    await setDoc(doc(db, 'roster/player@nuesynergy.com'), { name: 'Player' });
    await setDoc(doc(db, 'auditLog/a1'), { action: 'x' });
    await setDoc(doc(db, 'seasons/s1'), { name: 'Connections 2026' });
    await setDoc(doc(db, 'leaderboard/s1/entries/player'), { score: 10 });
    await setDoc(doc(db, 'games/g1'), { status: 'in_progress' });
    await setDoc(doc(db, 'games/g1/events/000001'), { type: 'card_played' });
    await setDoc(doc(db, 'games/g1/hands/player'), { cards: [] });
    await setDoc(doc(db, 'games/g1/hands/other'), { cards: [] });
    await setDoc(doc(db, 'games/g1/private/state'), { drawPile: [] });
    await setDoc(doc(db, 'inbox/player/items/i1'), { type: 'match_ready' });
    await setDoc(doc(db, 'tv/state'), { scene: 'bracket' });
  });
});

describe('public-to-players data', () => {
  const paths = [
    'seasons/s1',
    'leaderboard/s1/entries/player',
    'games/g1',
    'games/g1/events/000001',
    'tv/state',
    'users/player',
  ];

  it('active players can read it', async () => {
    for (const p of paths) await assertSucceeds(getDoc(doc(as('player'), p)));
  });

  it('an unverified company account (password sign-in, ADR-3) can once active', async () => {
    for (const p of paths) await assertSucceeds(getDoc(doc(as('unverified'), p)));
  });

  it('pending, outsider and look-alike domains cannot', async () => {
    for (const who of ['pending', 'outsider', 'lookalike'] as const) {
      for (const p of paths.filter((x) => x !== 'users/pending')) {
        await assertFails(getDoc(doc(as(who), p)));
      }
    }
  });

  it('signed-out users cannot read anything', async () => {
    const anon = env.unauthenticatedContext().firestore();
    for (const p of [...paths, 'config/app']) await assertFails(getDoc(doc(anon, p)));
  });
});

describe('pending users', () => {
  it('can read config and their own user doc only', async () => {
    const db = as('pending');
    await assertSucceeds(getDoc(doc(db, 'config/app')));
    await assertSucceeds(getDoc(doc(db, 'users/pending')));
    await assertFails(getDoc(doc(db, 'users/player')));
  });
});

describe('hidden information', () => {
  it('a player reads only their own hand', async () => {
    await assertSucceeds(getDoc(doc(as('player'), 'games/g1/hands/player')));
    await assertFails(getDoc(doc(as('player'), 'games/g1/hands/other')));
  });

  it('nobody reads private game state — not even admins', async () => {
    await assertFails(getDoc(doc(as('player'), 'games/g1/private/state')));
    await assertFails(getDoc(doc(as('admin'), 'games/g1/private/state')));
  });

  it('inboxes are owner-only', async () => {
    await assertSucceeds(getDoc(doc(as('player'), 'inbox/player/items/i1')));
    await assertFails(getDoc(doc(as('other'), 'inbox/player/items/i1')));
  });
});

describe('admin-only data', () => {
  it('roster and audit log are admin-only', async () => {
    await assertSucceeds(getDoc(doc(as('admin'), 'roster/player@nuesynergy.com')));
    await assertSucceeds(getDoc(doc(as('admin'), 'auditLog/a1')));
    await assertFails(getDoc(doc(as('player'), 'roster/player@nuesynergy.com')));
    await assertFails(getDoc(doc(as('player'), 'auditLog/a1')));
  });
});

describe('client writes', () => {
  it('are denied everywhere, even for admins', async () => {
    for (const who of ['player', 'admin'] as const) {
      const db = as(who);
      await assertFails(setDoc(doc(db, 'games/g2'), { status: 'lobby' }));
      await assertFails(updateDoc(doc(db, 'games/g1'), { status: 'finished' }));
      await assertFails(setDoc(doc(db, 'games/g1/hands/player'), { cards: ['W4'] }));
      await assertFails(updateDoc(doc(db, 'users/player'), { displayName: 'Hacker' }));
      await assertFails(setDoc(doc(db, 'leaderboard/s1/entries/player'), { score: 9999 }));
      await assertFails(deleteDoc(doc(db, 'games/g1/events/000001')));
    }
  });
});
