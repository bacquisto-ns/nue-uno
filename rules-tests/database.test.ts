import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { get, ref, remove, serverTimestamp, set } from 'firebase/database';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { createEnv, personas } from './env.js';

let env: RulesTestEnvironment;

const as = (uid: keyof typeof personas) => env.authenticatedContext(uid, personas[uid]).database();

beforeAll(async () => {
  env = await createEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearDatabase();
});

describe('presence (/status)', () => {
  it('players write only their own node, with a valid shape', async () => {
    const db = as('player');
    await assertSucceeds(
      set(ref(db, 'status/player'), { state: 'online', activity: 'lobby', at: serverTimestamp() }),
    );
    await assertSucceeds(get(ref(db, 'status/player')));
    await assertFails(set(ref(db, 'status/other'), { state: 'online', at: serverTimestamp() }));
    await assertFails(set(ref(db, 'status/player'), { state: 'hacking', at: serverTimestamp() }));
    await assertFails(
      set(ref(db, 'status/player'), { state: 'online', at: serverTimestamp(), extra: 1 }),
    );
  });

  it('pending users and outsiders are shut out', async () => {
    await assertFails(set(ref(as('pending'), 'status/pending'), { state: 'online', at: serverTimestamp() }));
    await assertFails(get(ref(as('outsider'), 'status')));
    await assertFails(get(ref(env.unauthenticatedContext().database(), 'status')));
  });
});

describe('emotes (/emotes/{gameId}/{uid})', () => {
  it('allows known emotes, rejects unknown values and other users', async () => {
    const db = as('player');
    await assertSucceeds(set(ref(db, 'emotes/g1/player'), { e: 'gg', at: serverTimestamp() }));
    await assertFails(set(ref(db, 'emotes/g1/player2'), { e: 'gg', at: serverTimestamp() }));
    await assertFails(set(ref(as('other'), 'emotes/g1/other'), { e: 'rude', at: serverTimestamp() }));
  });

  it('rate-limits to one emote every 3 seconds', async () => {
    const db = as('player');
    await assertSucceeds(set(ref(db, 'emotes/g1/player'), { e: 'gg', at: serverTimestamp() }));
    await assertFails(set(ref(db, 'emotes/g1/player'), { e: 'lol', at: serverTimestamp() }));
    await assertFails(remove(ref(db, 'emotes/g1/player')));
  });

  it('rejects timestamps from the future', async () => {
    await assertFails(
      set(ref(as('player'), 'emotes/g1/player'), { e: 'gg', at: Date.now() + 60_000 }),
    );
  });
});

describe('reactions (/reactions/{targetId}/{uid})', () => {
  it('allows known reactions and rate-limits to one per second', async () => {
    const db = as('player');
    await assertSucceeds(set(ref(db, 'reactions/R1-A/player'), { r: 'fire', at: serverTimestamp() }));
    await assertFails(set(ref(db, 'reactions/R1-A/player'), { r: 'clap', at: serverTimestamp() }));
    await assertFails(set(ref(db, 'reactions/R1-A/player'), { r: 'nope', at: Date.now() + 5000 }));
    await assertSucceeds(get(ref(as('other'), 'reactions/R1-A')));
  });
});

describe('everything else', () => {
  it('is closed', async () => {
    await assertFails(set(ref(as('admin'), 'games/g1'), { hacked: true }));
    await assertFails(get(ref(as('admin'), '/')));
  });
});
