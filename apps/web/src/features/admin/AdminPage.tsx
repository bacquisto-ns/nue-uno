import { collection, limit, orderBy, query, where, type Timestamp } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../../api/call';
import { eventApi, type SeasonStatus, type TvScene } from '../../api/event';
import { useActiveBracket, useDirectory, type MatchView } from '../../hooks/bracket';
import { db, useDoc, useQuery } from '../../hooks/firestore';
import { Avatar } from '../../ui/Avatar';
import { Button, ErrorText, Panel } from '../../ui/primitives';
import { LiveOverlays } from '../live/LiveOverlays';

interface LiveGameRow {
  status: string;
  mode: string;
  bracketId?: string | null;
  matchId?: string | null;
  physicalTable?: number | null;
  seats: { uid: string; displayName: string }[];
  turnUid?: string | null;
  paused?: boolean;
  updatedAt?: Timestamp;
}

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

/** Run an admin action with a shared busy/error/ok state. */
function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  async function run(key: string, fn: () => Promise<unknown>, success = 'Done ✓') {
    setBusy(key);
    setError('');
    setOk('');
    try {
      await fn();
      setOk(success);
    } catch (err) {
      setError(err instanceof ApiError ? (err.hint ?? err.message) : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }
  return { busy, error, ok, run };
}

/** /admin — Mission Control + bracket builder + live controls (PRD AD1–AD9). */
export function AdminPage() {
  const now = useNow(5000);
  const { busy, error, ok, run } = useAction();
  const { bracketId, bracket, matches, season, paused } = useActiveBracket();
  const directory = useDirectory();
  const seasonDoc = useDoc<{ status?: SeasonStatus; bracketSize?: number; qualifierStart?: Timestamp; qualifierEnd?: Timestamp }>(`seasons/${season.id}`);
  const tv = useDoc<{ scene?: TvScene; autoCycle?: boolean }>('tv/state');
  const games = useQuery<LiveGameRow>(query(collection(db, 'games'), where('status', '==', 'in_progress'), limit(50)), 'admin-live-games');
  const banners = useQuery<{ text: string; level: string; active: boolean; expiresAt?: Timestamp }>(
    query(collection(db, 'announcements'), where('active', '==', true), orderBy('createdAt', 'desc'), limit(10)),
    'admin-announcements',
  );

  const [size, setSize] = useState(16);
  const [msg, setMsg] = useState({ text: '', level: 'info' as 'info' | 'urgent', minutes: 10 });
  const [reason, setReason] = useState('');
  const [override, setOverride] = useState<Record<string, string[]>>({});

  const sortedMatches = Object.values(matches).sort((a, b) => a.round - b.round || a.table.localeCompare(b.table));
  const name = (uid: string | null) => (uid ? (directory[uid]?.displayName ?? 'Player') : 'TBD');

  return (
    <main className="felt-grain mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-5 px-4 py-6">
      <LiveOverlays />
      <div className="flex items-center gap-4">
        <Link to="/" className="text-ink-muted hover:text-ink">← Home</Link>
        <h1 className="font-display text-4xl font-extrabold">Mission Control</h1>
        <Link to="/tv" target="_blank" className="ml-auto text-gold underline">Open TV ↗</Link>
        <Link to="/admin/signs" className="text-gold underline">Table signs 🖨️</Link>
      </div>
      {(error || ok) && (
        <div role="status" className={`rounded-xl px-4 py-2 text-sm ${error ? 'bg-card-red/20 text-red-100' : 'bg-card-green/20'}`}>{error || ok}</div>
      )}

      {/* Live tables */}
      <Panel className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-2xl font-extrabold">Live tables ({games.data?.length ?? 0})</h2>
          <div className="ml-auto flex gap-2">
            {paused ? (
              <Button disabled={!!busy} onClick={() => void run('resume', eventApi.resumeAll, 'Resumed ▶')}>▶ Resume all</Button>
            ) : (
              <Button variant="ghost" disabled={!!busy} onClick={() => void run('pause', eventApi.pauseAll, 'Paused ⏸')}>⏸ Pause all</Button>
            )}
          </div>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(games.data ?? []).map((g) => {
            const idle = g.updatedAt ? Math.round((now - g.updatedAt.toMillis()) / 1000) : 0;
            const alert = !g.paused && idle > 90;
            return (
              <li key={g.id} className={`rounded-xl p-3 ring-1 ${alert ? 'bg-card-red/15 ring-card-red' : 'bg-white/5 ring-white/10'}`}>
                <p className="font-semibold">
                  {g.bracketId ? `Table ${g.physicalTable} · ${g.matchId}` : `${g.mode} game`} {g.paused && '⏸'}
                </p>
                <p className="truncate text-xs text-ink-muted">{g.seats.map((s) => s.displayName).join(' · ')}</p>
                <p className={`text-xs ${alert ? 'font-bold text-red-200' : 'text-ink-muted'}`}>
                  Turn: {g.seats.find((s) => s.uid === g.turnUid)?.displayName ?? '—'} · last move {idle}s ago{alert ? ' ⚠ stuck?' : ''}
                </p>
                <Link to={`/t/${g.id}`} className="text-xs text-gold underline">Watch</Link>
              </li>
            );
          })}
          {games.data?.length === 0 && <li className="text-ink-muted">No games in progress.</li>}
        </ul>
      </Panel>

      {/* Bracket */}
      <Panel className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-2xl font-extrabold">Bracket</h2>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs uppercase">{bracket?.status ?? 'none'}</span>
          {(!bracket || bracket.status === 'draft') && (
            <div className="ml-auto flex items-center gap-2">
              <label className="text-sm">Size <input type="number" min={3} max={64} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-16 rounded-lg bg-felt-950/70 px-2 py-1 ring-1 ring-white/15" /></label>
              <Button variant="ghost" disabled={!!busy} onClick={() => void run('gen', () => eventApi.generateBracket(size), 'Draft generated ✓')}>
                {bracket ? 'Regenerate draft' : 'Generate draft'}
              </Button>
              {bracket && bracketId && (
                <Button disabled={!!busy} onClick={() => void run('lock', () => eventApi.lockBracket(bracketId), 'Bracket locked 🔒')}>Lock bracket</Button>
              )}
            </div>
          )}
        </div>

        {bracket?.status === 'draft' && bracketId && (
          <div className="space-y-2">
            <p className="text-sm text-ink-muted">Swap seeds for no-shows before locking. Only eligible, attending players were seeded.</p>
            <ol className="grid gap-2 sm:grid-cols-2">
              {bracket.seeds.map((s) => (
                <li key={s.seed} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
                  <span className="font-display w-8 text-lg font-extrabold">#{s.seed}</span>
                  <select
                    value={s.uid}
                    onChange={(e) => void run('seed', () => eventApi.editBracketSeeds(bracketId, [{ seed: s.seed, uid: e.target.value }]), 'Seed updated ✓')}
                    className="flex-1 rounded-lg bg-felt-950/70 px-2 py-1 ring-1 ring-white/15"
                  >
                    {Object.entries(directory).map(([uid, p]) => (
                      <option key={uid} value={uid}>{p.displayName}</option>
                    ))}
                  </select>
                  <span className="text-xs text-ink-muted">{s.score} pts</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {bracket && bracket.status !== 'draft' && bracketId && (
          <>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required for restart / override)" className="w-full rounded-lg bg-felt-950/70 px-3 py-2 text-sm ring-1 ring-white/15" />
            <ul className="space-y-2">
              {sortedMatches.map((mt: MatchView) => (
                <li key={mt.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                  <span className="w-44 font-semibold">{mt.roundName} · T{mt.physicalTable} ({mt.id})</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{mt.status}</span>
                  <span className="flex-1 truncate text-sm text-ink-muted">
                    {mt.slots.map((u) => `${name(u)}${u && mt.checkedIn.includes(u) ? '✓' : ''}`).join(' · ')}
                  </span>
                  {mt.status === 'ready' && (
                    <Button variant="ghost" className="py-1 text-sm" disabled={!!busy} onClick={() => void run(mt.id, () => eventApi.startMatch(bracketId, mt.id, true), 'Started ▶')}>Force start</Button>
                  )}
                  {mt.status === 'in_progress' && (
                    <Button variant="ghost" className="py-1 text-sm" disabled={!!busy || reason.trim().length < 3} onClick={() => void run(mt.id, () => eventApi.restartMatchGame(bracketId, mt.id, reason), 'Restarted ↻')}>Restart</Button>
                  )}
                  {mt.status !== 'waiting_for_players' && mt.status !== 'complete' && (
                    <span className="flex items-center gap-1 text-xs">
                      {mt.slots.map((_, i) => (
                        <select key={i} aria-label={`Place ${i + 1}`} value={override[mt.id]?.[i] ?? ''} onChange={(e) => setOverride((o) => { const cur = [...(o[mt.id] ?? [])]; cur[i] = e.target.value; return { ...o, [mt.id]: cur }; })} className="rounded bg-felt-950/70 px-1 py-0.5 ring-1 ring-white/15">
                          <option value="">#{i + 1}</option>
                          {mt.slots.filter(Boolean).map((u) => (<option key={u!} value={u!}>{name(u)}</option>))}
                        </select>
                      ))}
                      <Button variant="ghost" className="py-1 text-xs" disabled={!!busy || reason.trim().length < 3 || (override[mt.id]?.filter(Boolean).length ?? 0) !== mt.slots.length}
                        onClick={() => void run(mt.id, () => eventApi.overrideMatchResult(bracketId, mt.id, override[mt.id]!, reason), 'Result overridden ✓')}>Override</Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Broadcast */}
        <Panel className="space-y-3">
          <h2 className="font-display text-2xl font-extrabold">Broadcast</h2>
          <input value={msg.text} onChange={(e) => setMsg({ ...msg, text: e.target.value })} placeholder="Round 2 starts in 5 minutes" className="w-full rounded-lg bg-felt-950/70 px-3 py-2 ring-1 ring-white/15" />
          <div className="flex items-center gap-2">
            <select value={msg.level} onChange={(e) => setMsg({ ...msg, level: e.target.value as 'info' | 'urgent' })} className="rounded-lg bg-felt-950/70 px-2 py-1 ring-1 ring-white/15">
              <option value="info">Info</option>
              <option value="urgent">Urgent</option>
            </select>
            <label className="text-sm">for <input type="number" min={1} max={600} value={msg.minutes} onChange={(e) => setMsg({ ...msg, minutes: Number(e.target.value) })} className="w-16 rounded-lg bg-felt-950/70 px-2 py-1 ring-1 ring-white/15" /> min</label>
            <Button className="ml-auto" disabled={!!busy || msg.text.trim().length < 2} onClick={() => void run('bc', () => eventApi.broadcast(msg.text, msg.level, msg.minutes), 'Broadcast sent 📣')}>Send</Button>
          </div>
          <ul className="space-y-1 text-sm">
            {(banners.data ?? []).map((b) => (
              <li key={b.id} className="flex items-center gap-2">
                <span className="flex-1 truncate">{b.level === 'urgent' ? '🚨' : '📣'} {b.text}</span>
                <button className="text-gold underline" onClick={() => void run('clr', () => eventApi.clearBroadcast(b.id), 'Cleared')}>Clear</button>
              </li>
            ))}
          </ul>
        </Panel>

        {/* TV director + season */}
        <Panel className="space-y-3">
          <h2 className="font-display text-2xl font-extrabold">TV director</h2>
          <div className="flex flex-wrap gap-2">
            {(['bracket', 'pickem', 'cup', 'champion'] as TvScene[]).map((s) => (
              <Button key={s} variant={tv.data?.scene === s ? 'primary' : 'ghost'} className="py-1 text-sm capitalize" onClick={() => void run('tv', () => eventApi.setTvScene(s, { autoCycle: tv.data?.autoCycle }), `TV → ${s}`)}>{s}</Button>
            ))}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!tv.data?.autoCycle} onChange={(e) => void run('tv', () => eventApi.setTvScene(tv.data?.scene ?? 'bracket', { autoCycle: e.target.checked }), 'Saved')} />
              Auto-cycle between rounds
            </label>
          </div>
          <h2 className="font-display pt-2 text-2xl font-extrabold">Season</h2>
          <p className="text-sm text-ink-muted">
            {season.id} · status <strong>{seasonDoc.data?.status ?? 'setup'}</strong>
            {seasonDoc.data?.qualifierEnd && ` · qualifiers end ${seasonDoc.data.qualifierEnd.toDate().toLocaleString()}`}
          </p>
          <div className="flex flex-wrap gap-2">
            {(['setup', 'qualifying', 'locked', 'event', 'complete'] as SeasonStatus[]).map((s) => (
              <Button key={s} variant={seasonDoc.data?.status === s ? 'primary' : 'ghost'} className="py-1 text-sm capitalize" disabled={!!busy} onClick={() => void run('season', () => eventApi.setSeason({ status: s }), `Season → ${s}`)}>{s}</Button>
            ))}
          </div>
          <p className="text-xs text-ink-muted">"Event" switches everyone's home screen to the Event Hub.</p>
        </Panel>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap gap-2 text-sm text-ink-muted">
        Champion: {bracket?.championUid ? (
          <span className="flex items-center gap-2">
            <Avatar avatarId={directory[bracket.championUid]?.avatarId ?? 'fox'} color={directory[bracket.championUid]?.avatarColor ?? 'teal'} size={20} label="" />
            {name(bracket.championUid)}
          </span>
        ) : '—'}
      </div>
    </main>
  );
}
