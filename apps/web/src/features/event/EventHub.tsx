import { m } from 'framer-motion';
import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '../../api/call';
import { eventApi } from '../../api/event';
import { useSession } from '../../auth/session';
import { myMatch, useActiveBracket, useDirectory } from '../../hooks/bracket';
import { spring } from '../../motion/tokens';
import { Avatar } from '../../ui/Avatar';
import { Button, ErrorText, Logo, Panel } from '../../ui/primitives';
import { LiveOverlays } from '../live/LiveOverlays';
import { BracketBoard } from './BracketBoard';

// Reactions pull in the Realtime Database SDK; load them after the hub is on screen.
const CheerPanel = lazy(() => import('./Reactions').then((m) => ({ default: m.CheerPanel })));

/** PRD E2: the home screen while the season is in event mode. */
export function EventHub() {
  const navigate = useNavigate();
  const { user, profile } = useSession();
  const uid = user!.uid;
  const { bracketId, bracket, matches, paused, loading } = useActiveBracket();
  const directory = useDirectory();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const mine = myMatch(matches, uid);
  const champion = bracket?.championUid ? directory[bracket.championUid] : undefined;

  async function checkIn() {
    if (!bracketId || !mine) return;
    setBusy(true);
    setError('');
    try {
      const res = await eventApi.checkInMatch(bracketId, mine.id);
      if (res.gameId) navigate(`/t/${res.gameId}`);
    } catch (err) {
      setError(err instanceof ApiError ? (err.hint ?? err.message) : 'Could not check in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="felt-grain mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-5 px-4 py-6">
      <LiveOverlays />
      <header className="flex items-center justify-between gap-3">
        <Logo size="sm" />
        {profile && (
          <Link to="/profile" className="flex items-center gap-3 rounded-full bg-white/5 py-1 pl-1 pr-4 ring-1 ring-white/10">
            <Avatar avatarId={profile.avatarId} color={profile.avatarColor} size={40} label={profile.displayName} />
            <span className="font-semibold">{profile.displayName}</span>
          </Link>
        )}
      </header>

      <m.div initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="rounded-2xl bg-gradient-to-r from-card-red/30 via-gold/20 to-card-blue/30 px-5 py-4 ring-1 ring-white/10">
        <p className="font-display text-3xl font-extrabold">🎉 It's tournament day!</p>
        <p className="text-sm text-ink-muted">Follow the bracket, make your Pick'em picks, and play casual games at the open tables.</p>
      </m.div>

      {paused && <div role="status" className="rounded-xl bg-card-yellow px-4 py-2 text-center font-bold text-felt-950">⏸ The tournament is paused — hang tight.</div>}

      {champion && (
        <Panel className="text-center">
          <p className="text-sm uppercase tracking-widest text-gold">Champion</p>
          <div className="mt-2 flex items-center justify-center gap-3">
            <Avatar avatarId={champion.avatarId} color={champion.avatarColor} size={56} label={champion.displayName} />
            <p className="font-display text-4xl font-extrabold">{champion.displayName} 🏆</p>
          </div>
        </Panel>
      )}

      {mine && (
        <m.section initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.bouncy}>
          <Panel className="space-y-3 ring-gold/60">
            <p className="text-sm uppercase tracking-widest text-gold">Your match</p>
            <p className="font-display text-3xl font-extrabold">{mine.roundName} · Table {mine.physicalTable}</p>
            <div className="flex flex-wrap gap-2">
              {mine.slots.map((s, i) =>
                s ? (
                  <span key={s} className="flex items-center gap-2 rounded-full bg-white/5 py-1 pl-1 pr-3 text-sm ring-1 ring-white/10">
                    <Avatar avatarId={directory[s]?.avatarId ?? 'fox'} color={directory[s]?.avatarColor ?? 'teal'} size={24} label="" />
                    {directory[s]?.displayName ?? 'Player'}{s === uid ? ' (you)' : ''}
                    {mine.checkedIn.includes(s) && <span className="text-card-green">✓</span>}
                  </span>
                ) : (
                  <span key={`tbd-${i}`} className="rounded-full bg-white/5 px-3 py-1 text-sm text-ink-muted">TBD</span>
                ),
              )}
            </div>
            {mine.status === 'waiting_for_players' && <p className="text-ink-muted">Waiting for earlier tables to finish — we'll call you when it's time.</p>}
            {mine.status === 'ready' && !mine.checkedIn.includes(uid) && (
              <Button className="w-full py-4 text-lg" disabled={busy} onClick={() => void checkIn()}>
                I'm here — check in
              </Button>
            )}
            {mine.status === 'ready' && mine.checkedIn.includes(uid) && (
              <p className="text-card-green">✓ Checked in — the game starts when everyone is here ({mine.checkedIn.length}/{mine.slots.length}).</p>
            )}
            {mine.status === 'in_progress' && mine.currentGameId && (
              <Link to={`/t/${mine.currentGameId}`}>
                <Button className="w-full py-4 text-lg">Go to your table →</Button>
              </Link>
            )}
            <ErrorText>{error}</ErrorText>
          </Panel>
        </m.section>
      )}

      {bracket && bracket.status !== 'draft' && !bracket.championUid && (
        <Suspense fallback={null}>
          <CheerPanel matches={Object.values(matches)} directory={directory} uid={uid} />
        </Suspense>
      )}

      <nav className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['/pickem', "🔮 Pick'em"],
          ['/bracket', '🗺️ Full bracket'],
          ['/leaderboard', '🏆 Leaderboard'],
          ['/lobby', '🃏 Open tables'],
        ].map(([to, label]) => (
          <Link key={to} to={to!} className="rounded-2xl bg-white/5 px-4 py-3 text-center font-semibold ring-1 ring-white/10 hover:bg-white/10">
            {label}
          </Link>
        ))}
      </nav>

      {loading ? (
        <p className="text-ink-muted">Loading the bracket…</p>
      ) : bracket && bracket.status !== 'draft' ? (
        <div className="overflow-x-auto pb-4">
          <div className="min-w-[640px]">
            <BracketBoard bracket={bracket} matches={matches} directory={directory} highlightUid={uid} />
          </div>
        </div>
      ) : (
        <Panel>The bracket will appear here once the organizers lock it.</Panel>
      )}
    </main>
  );
}
