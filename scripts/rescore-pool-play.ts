/**
 * Re-score pool-play games that were recorded as casual (no points) so every game counts for the
 * bracket ranking. Converts mode 'casual' -> 'ranked', recomputes placement points with the
 * season's scoring table and marks every placement as counting. Writing results re-fires the
 * onResultWritten trigger, which rebuilds each player's leaderboard / Passport / All games entry.
 *
 *   npm run rescore:poolplay -- <firebase-project-id>            # dry run: counts + resulting top 10
 *   npm run rescore:poolplay -- <firebase-project-id> --apply    # write the changes
 *
 * Only results in the current season, finished at/after the qualifier window opened, that are not
 * voided and not bracket games. Uses Application Default Credentials. Safe to re-run.
 */
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type DocumentData } from 'firebase-admin/firestore';
import { DEFAULT_SEASON_SETTINGS, placementPoints, type Scoring } from '@nue-uno/shared';

const project = process.argv[2];
const apply = process.argv.includes('--apply');
if (!project || project.startsWith('--')) throw new Error('usage: rescore:poolplay <firebase-project-id> [--apply]');

initializeApp({ projectId: project });
const db = getFirestore();

const config = (await db.doc('config/app').get()).data() ?? {};
const seasonId: string = config.currentSeasonId ?? 'connections-2026';
const season = (await db.doc(`seasons/${seasonId}`).get()).data();
if (!season?.qualifierStart) throw new Error(`seasons/${seasonId} has no qualifierStart`);

const scoring: Scoring = {
  ...DEFAULT_SEASON_SETTINGS.scoring,
  ...season.scoring,
  pointsByTableSize: { ...DEFAULT_SEASON_SETTINGS.scoring.pointsByTableSize, ...season.scoring?.pointsByTableSize },
};

const snap = await db.collection('results').where('seasonId', '==', seasonId).get();
const since = season.qualifierStart.toMillis() as number;

type Placement = { uid: string; place: number; points: number; counts: boolean } & DocumentData;
const toFix = snap.docs.filter((d) => {
  const r = d.data();
  return r.mode === 'casual' && !r.voided && !r.bracketId && (r.finishedAt?.toMillis?.() ?? 0) >= since;
});

// Project each player's total points (all counting ranked games, best N) for the dry-run preview.
const pointsByPlayer = new Map<string, number[]>();
const add = (uid: string, pts: number) => pointsByPlayer.set(uid, [...(pointsByPlayer.get(uid) ?? []), pts]);
const newPlacements = new Map<string, Placement[]>();
for (const d of snap.docs) {
  const r = d.data();
  if (r.voided || r.bracketId) continue;
  const fixing = toFix.includes(d);
  const placements: Placement[] = (r.placements as Placement[]).map((p) =>
    fixing ? { ...p, points: placementPoints(r.tableSize, p.place, scoring), counts: true } : p,
  );
  if (fixing) newPlacements.set(d.id, placements);
  if (fixing || r.mode === 'ranked') for (const p of placements) if (p.counts) add(p.uid, p.points);
}
const top = [...pointsByPlayer.entries()]
  .map(([uid, pts]) => ({ uid, games: pts.length, score: [...pts].sort((a, b) => b - a).slice(0, scoring.bestN).reduce((a, b) => a + b, 0) }))
  .sort((a, b) => b.score - a.score)
  .slice(0, 10);
const affectedPlayers = new Set(toFix.flatMap((d) => (d.data().playerUids as string[]) ?? []));

console.log(`Project ${project}, season ${seasonId}`);
console.log(`Results in season: ${snap.size}; casual pool-play games to re-score: ${toFix.length}; players affected: ${affectedPlayers.size}`);
console.log('Projected top 10 after re-score (uid, games, score):');
for (const t of top) console.log(`  ${t.uid}  games=${t.games}  score=${t.score}`);

if (!apply) {
  console.log('\nDry run only. Re-run with --apply to write the changes.');
} else {
  let n = 0;
  for (const d of toFix) {
    await d.ref.update({ mode: 'ranked', placements: newPlacements.get(d.id), rescoredAt: FieldValue.serverTimestamp() });
    if (++n % 25 === 0) console.log(`  ${n}/${toFix.length}`);
  }
  console.log(`\nRe-scored ${n} games. Derived data recomputes as the onResultWritten triggers run.`);
}
