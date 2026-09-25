import { collection, orderBy, query } from 'firebase/firestore';
import { m } from 'framer-motion';
import { useState } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../../api/call';
import { eventApi } from '../../api/event';
import { useSession } from '../../auth/session';
import { useActiveBracket, useDirectory } from '../../hooks/bracket';
import { db, useDoc, useQuery } from '../../hooks/firestore';
import { spring } from '../../motion/tokens';
import { Avatar } from '../../ui/Avatar';
import { Button, ErrorText, Panel } from '../../ui/primitives';
import { LiveOverlays } from '../live/LiveOverlays';

interface PickDoc {
  champion?: string;
  tables?: Record<string, string>;
}

/** PRD E10: pick table winners and the champion; live Pick'em leaderboard. */
export function PickemPage() {
  const uid = useSession((s) => s.user!.uid);
  const { bracketId, bracket, matches } = useActiveBracket();
  const directory = useDirectory();
  const mine = useDoc<PickDoc>(bracketId ? `picks/${bracketId}_${uid}` : null);
  const board = useQuery<{ displayName: string; avatarId: string; avatarColor: string; points: number; correct: number; champion: boolean }>(
    bracketId ? query(collection(db, `pickem/${bracketId}/entries`), orderBy('points', 'desc')) : null,
    `pickem-${bracketId}`,
  );
  const [draft, setDraft] = useState<PickDoc>({});
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  if (!bracket || bracket.status === 'draft') {
    return (
      <main className="felt-grain mx-auto max-w-3xl px-4 py-6">
        <Link to="/" className="text-ink-muted">← Home</Link>
        <Panel className="mt-4">Pick'em opens when the bracket is revealed.</Panel>
      </main>
    );
  }

  const saved = mine.data ?? {};
  const pick = (k: 'champion' | string, uidPicked: string) =>
    setDraft((d) => (k === 'champion' ? { ...d, champion: uidPicked } : { ...d, tables: { ...d.tables, [k]: uidPicked } }));
  const current = (matchId: string) => draft.tables?.[matchId] ?? saved.tables?.[matchId];
  const round1Started = Object.values(matches).some((mm) => mm.round === 1 && mm.gameIds.length > 0);
  const openMatches = Object.values(matches)
    .filter((mm) => (mm.status === 'waiting_for_players' || mm.status === 'ready') && mm.gameIds.length === 0 && mm.slots.every(Boolean))
    .sort((a, b) => a.round - b.round || a.table.localeCompare(b.table));

  async function save() {
    setError('');
    setMsg('');
    try {
      const res = await eventApi.submitPicks(bracketId!, draft);
      setDraft({});
      setMsg(res.rejected.length ? `Saved — ${res.rejected.length} pick(s) were already locked.` : 'Picks saved ✓');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save picks.');
    }
  }

  const Chip = ({ id, selected, onClick }: { id: string; selected: boolean; onClick?: () => void }) => (
    <button
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={selected}
      className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm ring-1 transition ${selected ? 'bg-gold text-felt-950 ring-gold' : 'bg-white/5 ring-white/15 hover:bg-white/10'} disabled:opacity-60`}
    >
      <Avatar avatarId={directory[id]?.avatarId ?? 'fox'} color={directory[id]?.avatarColor ?? 'teal'} size={24} label="" />
      {directory[id]?.displayName ?? 'Player'}
    </button>
  );

  return (
    <main className="felt-grain mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <LiveOverlays />
      <Link to="/" className="text-ink-muted hover:text-ink">← Home</Link>
      <h1 className="font-display text-4xl font-extrabold">Pick'em 🔮</h1>
      <p className="text-ink-muted">3 points for each correct table winner, 10 for the champion. Picks lock when a table's game starts.</p>

      <Panel className="space-y-3">
        <h2 className="font-display text-2xl font-extrabold">Your champion</h2>
        {round1Started ? (
          <p className="text-ink-muted">Locked{saved.champion ? `: ${directory[saved.champion]?.displayName ?? 'Player'}` : ' — no pick made'}.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {bracket.seeds.map((s) => (
              <Chip key={s.uid} id={s.uid} selected={(draft.champion ?? saved.champion) === s.uid} onClick={() => pick('champion', s.uid)} />
            ))}
          </div>
        )}
      </Panel>

      {openMatches.length > 0 && (
        <Panel className="space-y-4">
          <h2 className="font-display text-2xl font-extrabold">Who wins each table?</h2>
          {openMatches.map((mm) => (
            <div key={mm.id} className="space-y-2">
              <p className="text-sm font-semibold text-ink-muted">{mm.roundName} · Table {mm.physicalTable}</p>
              <div className="flex flex-wrap gap-2">
                {(mm.slots as string[]).map((s) => (
                  <Chip key={s} id={s} selected={current(mm.id) === s} onClick={() => pick(mm.id, s)} />
                ))}
              </div>
            </div>
          ))}
        </Panel>
      )}

      <div className="flex items-center gap-3">
        <Button disabled={!draft.champion && !Object.keys(draft.tables ?? {}).length} onClick={() => void save()}>Save picks</Button>
        {msg && <span className="text-card-green">{msg}</span>}
      </div>
      <ErrorText>{error}</ErrorText>

      <section className="space-y-2">
        <h2 className="font-display text-2xl font-extrabold">Pick'em leaderboard</h2>
        <ol className="space-y-2">
          {(board.data ?? []).map((e, i) => (
            <m.li key={e.id} layout transition={spring.soft} className={`flex items-center gap-3 rounded-2xl px-4 py-2 ring-1 ${e.id === uid ? 'bg-felt-800 ring-gold/60' : 'bg-felt-900/80 ring-white/10'}`}>
              <span className="font-display w-6 text-xl font-extrabold">{i + 1}</span>
              <Avatar avatarId={e.avatarId} color={e.avatarColor} size={28} label="" />
              <span className="flex-1 truncate font-semibold">{e.displayName}{e.champion ? ' 🔮' : ''}</span>
              <span className="text-xs text-ink-muted">{e.correct} correct</span>
              <span className="font-display w-10 text-right text-xl font-extrabold">{e.points}</span>
            </m.li>
          ))}
          {board.data?.length === 0 && <Panel>No picks yet — be the first!</Panel>}
        </ol>
      </section>
    </main>
  );
}
