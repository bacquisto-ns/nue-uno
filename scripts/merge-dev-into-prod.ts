/**
 * One-off: copy pool-play games played on the DEV site into PROD so everyone's data is combined.
 * Dev and prod have separate accounts, so players are matched by work email. Only games whose
 * players ALL have a prod account are copied; the rest are listed and picked up on the next run
 * (re-run after the remaining players sign up on prod). Copies are idempotent: each lands at
 * results/dev-<devGameId>, so re-running never duplicates a game.
 *
 *   npm run merge:dev -- [--apply]            # dry run by default (reads dev + prod)
 *
 * Uses Application Default Credentials. Each copied result is re-scored with prod's scoring, marked
 * ranked, and written with `mergedFromDev: true`; prod's onResultWritten trigger then rebuilds each
 * player's leaderboard, All games entry, Passport and stats.
 */
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { DEFAULT_SEASON_SETTINGS, groupKey, placementPoints, type Scoring } from '@nue-uno/shared';

const apply = process.argv.includes('--apply');
const devApp = initializeApp({ projectId: 'nue-uno-dev' }, 'dev');
const prodApp = initializeApp({ projectId: 'nue-uno-prod' }, 'prod');
const dev = getFirestore(devApp);
const prod = getFirestore(prodApp);

// ---- prod season + scoring ------------------------------------------------------------------
const config = (await prod.doc('config/app').get()).data() ?? {};
const seasonId: string = config.currentSeasonId ?? 'connections-2026';
const season = (await prod.doc(`seasons/${seasonId}`).get()).data();
if (!season?.qualifierStart) throw new Error(`prod seasons/${seasonId} has no qualifierStart`);
const sinceMs: number = season.qualifierStart.toMillis();
const scoring: Scoring = {
  ...DEFAULT_SEASON_SETTINGS.scoring,
  ...season.scoring,
  pointsByTableSize: { ...DEFAULT_SEASON_SETTINGS.scoring.pointsByTableSize, ...season.scoring?.pointsByTableSize },
};

// ---- email -> uid maps ----------------------------------------------------------------------
const byEmail = async (db: FirebaseFirestore.Firestore) => {
  const snap = await db.collection('users').get();
  const map = new Map<string, { uid: string; name: string }>();
  for (const d of snap.docs) {
    const email = String(d.get('email') ?? '').toLowerCase();
    if (email) map.set(email, { uid: d.id, name: d.get('displayName') ?? email });
  }
  return map;
};
const devUsers = await byEmail(dev);
const prodUsers = await byEmail(prod);
const devUidToEmail = new Map([...devUsers].map(([email, u]) => [u.uid, email]));
const toProd = (devUid: string): string | null => {
  const email = devUidToEmail.get(devUid);
  return (email && prodUsers.get(email)?.uid) || null;
};
const nameOf = (devUid: string) => devUsers.get(devUidToEmail.get(devUid) ?? '')?.name ?? devUid;

// ---- dev results to copy --------------------------------------------------------------------
type Placement = { uid: string; place: number; points: number; counts: boolean; stats?: { wild4Victims?: Record<string, number> } } & Record<string, unknown>;
const results = await dev.collection('results').get();
const candidates = results.docs.filter((d) => {
  const r = d.data();
  return !r.voided && !r.bracketId && (r.finishedAt?.toMillis?.() ?? 0) >= sinceMs;
});

let copied = 0;
let skippedExisting = 0;
const waiting = new Map<string, number>(); // missing player -> games blocked on them
const rows: string[] = [];

for (const d of candidates) {
  const r = d.data();
  const destRef = prod.doc(`results/dev-${d.id}`);
  const players: string[] = r.playerUids ?? [];
  const missing = players.filter((u) => !toProd(u));
  if (missing.length) {
    for (const u of missing) waiting.set(nameOf(u), (waiting.get(nameOf(u)) ?? 0) + 1);
    rows.push(`  SKIP  ${d.id}  ${r.tableSize}p  waiting on: ${missing.map(nameOf).join(', ')}`);
    continue;
  }
  if ((await destRef.get()).exists) {
    skippedExisting++;
    continue;
  }
  const placements = (r.placements as Placement[]).map((p) => {
    const victims = p.stats?.wild4Victims;
    return {
      ...p,
      uid: toProd(p.uid)!,
      points: placementPoints(r.tableSize, p.place, scoring),
      counts: true,
      ...(p.stats
        ? { stats: { ...p.stats, wild4Victims: Object.fromEntries(Object.entries(victims ?? {}).flatMap(([u, n]) => (toProd(u) ? [[toProd(u)!, n]] : []))) } }
        : {}),
    };
  });
  const prodUids = players.map((u) => toProd(u)!);
  rows.push(`  COPY  ${d.id}  ${r.tableSize}p  ${(r.finishedAt as Timestamp).toDate().toISOString()}  ${players.map(nameOf).join(', ')}`);
  if (apply) {
    await destRef.set({
      ...r,
      seasonId,
      mode: 'ranked',
      placements,
      playerUids: prodUids,
      groupKey: groupKey(prodUids),
      voided: false,
      mergedFromDev: true,
      devGameId: d.id,
      mergedAt: FieldValue.serverTimestamp(),
    });
  }
  copied++;
}

console.log(`Prod season ${seasonId}; dev games since ${new Date(sinceMs).toISOString()}: ${candidates.length}`);
console.log(rows.join('\n') || '  (none)');
console.log(`\n${apply ? 'Copied' : 'Would copy'}: ${copied}; already in prod: ${skippedExisting}; blocked on missing prod accounts: ${candidates.length - copied - skippedExisting}`);
if (waiting.size) {
  console.log('\nThese dev players still need a prod account (same work email):');
  for (const [name, n] of waiting) console.log(`  ${name}  (${n} game${n === 1 ? '' : 's'} waiting)`);
}
if (!apply) console.log('\nDry run only. Re-run with --apply to write to prod.');
