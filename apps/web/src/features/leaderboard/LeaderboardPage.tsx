import { collection, limit, orderBy, query } from 'firebase/firestore';
import { AnimatePresence, m } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useSession } from '../../auth/session';
import { db, useQuery } from '../../hooks/firestore';
import { useSeason } from '../../hooks/season';
import { useEffectsMode } from '../../motion/effectsMode';
import { spring } from '../../motion/tokens';
import { Avatar } from '../../ui/Avatar';
import { Panel } from '../../ui/primitives';
import { LiveOverlays } from '../live/LiveOverlays';
import { buildStandings, myQualifier, rankDeltas, type EntryDoc, type Standing } from './standings';

interface CupDoc {
  department: string;
  cupScore: number;
  participants: number;
  memberCount: number;
  topScores: { uid: string; score: number }[];
}

/** Keep the previous ranks across snapshots (derived-state pattern — no refs during render). */
function useRankMovement(standings: Standing[]) {
  const key = standings.map((s) => `${s.id}:${s.rank}`).join(',');
  const [state, setState] = useState<{ key: string; ranks: Record<string, number>; deltas: Record<string, number> }>({
    key: '',
    ranks: {},
    deltas: {},
  });
  if (state.key !== key) {
    setState({
      key,
      ranks: Object.fromEntries(standings.map((s) => [s.id, s.rank])),
      deltas: state.key ? rankDeltas(state.ranks, standings) : {},
    });
  }
  return state.deltas;
}

export function LeaderboardPage() {
  const uid = useSession((s) => s.user!.uid);
  const season = useSeason();
  const full = useEffectsMode() === 'full';
  const [tab, setTab] = useState<'players' | 'cup'>('players');

  const entries = useQuery<Omit<EntryDoc, 'id'>>(
    query(collection(db, `leaderboard/${season.id}/entries`), orderBy('score', 'desc'), limit(200)),
    `lb-${season.id}`,
  );
  const cup = useQuery<CupDoc>(
    query(collection(db, `departmentCup/${season.id}/entries`), orderBy('cupScore', 'desc'), limit(30)),
    `cup-${season.id}`,
  );
  const standings = useMemo(() => buildStandings((entries.data ?? []) as EntryDoc[]), [entries.data]);
  const deltas = useRankMovement(standings);
  const mine = myQualifier(standings, uid, season.bracketSize);
  const lastSeeded = standings.filter((s) => s.seed !== null && s.seed <= season.bracketSize).at(-1)?.rank;

  return (
    <main className="felt-grain mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <LiveOverlays />
      <Link to="/" className="text-ink-muted hover:text-ink">← Lobby</Link>
      <h1 className="font-display text-4xl font-extrabold">Leaderboard</h1>

      <Panel className="grid gap-4 sm:grid-cols-4">
        <Stat label="Your score" value={mine.score} hint={`best ${mine.counted}/${mine.bestN} games`} />
        <Stat label="Ranked games" value={mine.gamesPlayed} hint={mine.eligible ? 'Eligible ✓' : `${Math.max(0, mine.minGames - mine.gamesPlayed)} more to qualify`} />
        <Stat label="Projected seed" value={mine.seed ?? '—'} hint={mine.seed === null ? 'eligible + attending only' : mine.inBracket ? `in the Top ${season.bracketSize} 🎉` : `Top ${season.bracketSize} makes the bracket`} />
        <Stat label="To the cut line" value={mine.inBracket ? '✓' : mine.pointsNeeded || '—'} hint={mine.inBracket ? "you're in" : 'points needed'} />
      </Panel>

      <div role="tablist" className="flex gap-1 self-start rounded-xl bg-white/5 p-1">
        {(['players', 'cup'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 font-semibold ${tab === t ? 'bg-gold text-felt-950' : ''}`}>
            {t === 'players' ? 'Players' : '🏢 Department Cup'}
          </button>
        ))}
      </div>

      {tab === 'players' ? (
        entries.data === undefined ? (
          <p className="text-ink-muted">Loading…</p>
        ) : standings.length === 0 ? (
          <Panel>No ranked games yet — be the first on the board!</Panel>
        ) : (
          <ol className="space-y-2" aria-label="Qualifier standings">
            {standings.map((s) => (
              <Row key={s.id} s={s} me={s.id === uid} delta={deltas[s.id]} cutAfter={s.rank === lastSeeded} bracketSize={season.bracketSize} full={full} />
            ))}
          </ol>
        )
      ) : (
        <ol className="space-y-2" aria-label="Department Cup">
          {(cup.data ?? []).map((d, i) => (
            <m.li layout={full} key={d.id} transition={spring.soft}
              className="flex items-center gap-4 rounded-2xl bg-felt-900/80 px-4 py-3 ring-1 ring-white/10">
              <span className="font-display w-8 text-2xl font-extrabold">{i === 0 ? '👑' : i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{d.department}</p>
                <p className="text-xs text-ink-muted">{d.participants}/{d.memberCount} active players · top 3 + participation bonus</p>
              </div>
              <span className="font-display text-2xl font-extrabold">{d.cupScore}</span>
            </m.li>
          ))}
          {cup.data?.length === 0 && <Panel>The Cup starts when departments play ranked games.</Panel>}
        </ol>
      )}
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="font-display text-3xl font-extrabold">{value}</p>
      <p className="text-xs text-ink-muted">{hint}</p>
    </div>
  );
}

function Row({ s, me, delta, cutAfter, bracketSize, full }: { s: Standing; me: boolean; delta?: number; cutAfter: boolean; bracketSize: number; full: boolean }) {
  return (
    <>
      <m.li
        layout={full}
        transition={spring.soft}
        className={`relative flex items-center gap-3 overflow-hidden rounded-2xl px-4 py-3 ring-1 ${me ? 'sticky bottom-2 z-10 bg-felt-800 ring-gold/70' : 'bg-felt-900/80 ring-white/10'}`}
      >
        {s.rank === 1 && full && (
          <m.span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-gold/20 to-transparent"
            initial={{ x: '-100%' }} animate={{ x: '100%' }} transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 4 }} />
        )}
        <span className="font-display w-8 text-2xl font-extrabold">{s.rank === 1 ? '👑' : s.rank}</span>
        <Avatar avatarId={s.avatarId} color={s.avatarColor} size={36} label="" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {s.displayName}{me ? ' (you)' : ''} {s.winStreak >= 3 && <span title={`${s.winStreak} wins in a row`}>🔥</span>}
          </p>
          <p className="truncate text-xs text-ink-muted">
            {[s.department, `${s.rankedGames} games`, `${s.wins} wins`, s.eligible ? null : 'not yet eligible', s.attendingEvent !== 'yes' ? 'remote' : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <AnimatePresence>
          {delta ? (
            <m.span key={`${delta}`} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ opacity: 0 }}
              className={`rounded-full px-2 py-0.5 text-xs font-bold ${delta > 0 ? 'bg-success' : 'bg-alert'} text-white`}>
              {delta > 0 ? `▲${delta}` : `▼${-delta}`}
            </m.span>
          ) : null}
        </AnimatePresence>
        <span className="font-display w-12 text-right text-2xl font-extrabold">{s.score}</span>
      </m.li>
      {cutAfter && (
        <li aria-label={`Top ${bracketSize} cut line`} className="flex items-center gap-2 py-1 text-xs font-bold uppercase tracking-widest text-gold">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-gold shadow-[0_0_8px_#f5c542]" />
          Top {bracketSize} · bracket line
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-gold shadow-[0_0_8px_#f5c542]" />
        </li>
      )}
    </>
  );
}
