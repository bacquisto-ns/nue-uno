import { compareEntries, nextUnoHour, startOfDayMs } from '@nue-uno/shared';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../admin.js';
import { clock } from '../clock.js';
import { getSeason } from '../season.js';
import { adaptiveCard, appUrl, postToTeams } from '../teams.js';

const fmtTime = (ms: number, timeZone: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(ms);

/** Weekday 09:00 digest (ADR-8): top 5, biggest climber-free MVP, Cup leader, today's Uno Hours. */
export async function teamsDigest(): Promise<string> {
  const season = await getSeason({ fresh: true });
  if (season.status !== 'qualifying') return 'skipped (not qualifying)';
  const [entries, cup] = await Promise.all([
    db.collection(`leaderboard/${season.id}/entries`).orderBy('score', 'desc').limit(20).get(),
    db.collection(`departmentCup/${season.id}/entries`).orderBy('cupScore', 'desc').limit(1).get(),
  ]);
  const top = entries.docs
    .map((d) => ({ uid: d.id, ...(d.data() as { displayName: string; score: number; winRate: number; avgPlace: number; rankedGames: number }), scoreReachedAtMs: d.get('scoreReachedAt')?.toMillis?.() ?? null }))
    .sort(compareEntries)
    .slice(0, 5);

  const now = clock.now();
  const dayStart = startOfDayMs(now, season.timezone);
  const today = season.unoHours
    .map((w) => nextUnoHour(dayStart, [w], season.timezone))
    .filter((s): s is NonNullable<typeof s> => !!s && s.startMs < dayStart + 86_400_000)
    .map((s) => `${fmtTime(s.startMs, season.timezone)}–${fmtTime(s.endMs, season.timezone)}`);

  const lines = [
    { text: '**Top 5**', bold: true },
    ...(top.length
      ? top.map((e, i) => ({ text: `${['🥇', '🥈', '🥉', '4.', '5.'][i]} ${e.displayName} — ${e.score} pts (${e.rankedGames} games)` }))
      : [{ text: 'No ranked games yet — be the first!', subtle: true }]),
    ...(cup.docs[0] ? [{ text: `🏢 Department Cup leader: **${cup.docs[0].get('department')}** (${cup.docs[0].get('cupScore')})` }] : []),
    ...(today.length ? [{ text: `⏰ Uno Hours today: ${today.join(' · ')}` }] : []),
  ];
  return postToTeams('digest', adaptiveCard('🃏 Nue Uno daily digest', lines, { title: 'Play now', url: appUrl() }));
}

/**
 * Every 5 minutes: when an Uno Hour starts, post to Teams and raise an in-app banner that lasts
 * until it ends. seasons/{id}/state/unoHour remembers the last slot announced.
 */
export async function unoHourAnnouncer(): Promise<string> {
  const season = await getSeason({ fresh: true });
  if (season.status !== 'qualifying') return 'skipped (not qualifying)';
  const now = clock.now();
  const slot = nextUnoHour(now, season.unoHours, season.timezone);
  if (!slot?.live || now - slot.startMs > 10 * 60_000) return 'no slot starting';

  const stateRef = db.doc(`seasons/${season.id}/state/unoHour`);
  const fresh = await db.runTransaction(async (tx) => {
    if ((await tx.get(stateRef)).get('startMs') === slot.startMs) return false;
    tx.set(stateRef, { startMs: slot.startMs, at: FieldValue.serverTimestamp() });
    tx.set(db.collection('announcements').doc(), {
      text: `🔥 Uno Hour is live until ${fmtTime(slot.endMs, season.timezone)} — jump into a ranked table!`,
      level: 'info',
      createdBy: 'system',
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(slot.endMs),
      active: true,
    });
    return true;
  });
  if (!fresh) return 'already announced';
  return postToTeams(
    'unoHour',
    adaptiveCard('🔥 Uno Hour is live!', [{ text: `Ranked tables are filling up until ${fmtTime(slot.endMs, season.timezone)}.` }], {
      title: 'Quick Match',
      url: appUrl(),
    }),
  );
}
