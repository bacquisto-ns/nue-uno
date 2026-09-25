import { DEFAULT_SEASON_SETTINGS, nextUnoHour } from '@nue-uno/shared';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { m } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '../../api/call';
import { gameApi } from '../../api/game';
import { signOutEverywhere, useSession } from '../../auth/session';
import { db, useQuery } from '../../hooks/firestore';
import { spring, stagger } from '../../motion/tokens';
import { Avatar } from '../../ui/Avatar';
import { Button, ErrorText, Logo, Panel } from '../../ui/primitives';
import type { GameDocData } from '../game/OnlineGame';
import { lazy, Suspense } from 'react';
import { LiveOverlays } from '../live/LiveOverlays';

// Presence pulls in the Realtime Database SDK (~37 KB gz); load it after the lobby is on screen.
const PresenceBeacon = lazy(() => import('../live/PresenceWidgets').then((m) => ({ default: m.PresenceBeacon })));
const OnlineNow = lazy(() => import('../live/PresenceWidgets').then((m) => ({ default: m.OnlineNow })));

type OpenTable = GameDocData & {
  hostUid: string;
  seatUids: string[];
  maxSeats: number;
  requestedMode: 'casual' | 'ranked';
  bracketId?: string | null;
};

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

function fmtDuration(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60_000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h} h ${mins % 60} min` : `${Math.floor(h / 24)} d ${h % 24} h`;
}

/** PRD L5: countdown to the next Uno Hour, glowing while one is live. Shown in local time (Q6). */
function UnoHourCard() {
  const now = useNow(30_000);
  const slot = nextUnoHour(now, DEFAULT_SEASON_SETTINGS.unoHours, DEFAULT_SEASON_SETTINGS.timezone);
  if (!slot) return null;
  const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl px-4 py-3 ring-1 ${slot.live ? 'bg-gold/15 ring-gold/60 shadow-[0_0_30px_#f5c54244]' : 'bg-white/5 ring-white/10'}`}
      aria-live="polite"
    >
      <span className="text-2xl" aria-hidden>{slot.live ? '🔥' : '⏰'}</span>
      <div>
        <p className="font-semibold">{slot.live ? 'Uno Hour is live!' : `Next Uno Hour in ${fmtDuration(slot.startMs - now)}`}</p>
        <p className="text-xs text-ink-muted">
          {time(slot.startMs)}–{time(slot.endMs)} your time{slot.live ? ` · ends in ${fmtDuration(slot.endMs - now)}` : ''}
        </p>
      </div>
    </div>
  );
}

export function Lobby() {
  const navigate = useNavigate();
  const { profile, claims, user } = useSession();
  const [seats, setSeats] = useState(4);
  const [ranked, setRanked] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const tables = useQuery<OpenTable>(
    query(collection(db, 'games'), where('status', '==', 'lobby'), orderBy('createdAt', 'desc'), limit(20)),
    'open-tables',
  );
  const open = (tables.data ?? []).filter((t) => !t.bracketId);

  async function go(key: string, fn: () => Promise<{ gameId: string } | void>, gameId?: string) {
    setBusy(key);
    setError('');
    try {
      const res = await fn();
      navigate(`/t/${res?.gameId ?? gameId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong — try again.');
    } finally {
      setBusy(null);
    }
  }

  if (!profile) return null;
  const activeGameId = profile.activeGameId;

  return (
    <main className="felt-grain mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <LiveOverlays />
      <header className="flex items-center justify-between gap-3">
        <Logo size="sm" />
        <Link to="/profile" className="flex items-center gap-3 rounded-full bg-white/5 py-1 pl-1 pr-4 ring-1 ring-white/10">
          <Avatar avatarId={profile.avatarId} color={profile.avatarColor} size={40} label={profile.displayName} />
          <span className="font-semibold">{profile.displayName}</span>
        </Link>
      </header>

      {activeGameId && (
        <Link to={`/t/${activeGameId}`}>
          <m.div initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="rounded-2xl bg-card-blue/25 px-4 py-3 font-semibold ring-1 ring-card-blue/60">
            🎴 You're seated at a table — tap to return
          </m.div>
        </Link>
      )}

      <UnoHourCard />
      {user && (
        <Suspense fallback={<div className="h-[54px] rounded-2xl bg-white/5" />}>
          <PresenceBeacon activity="lobby" />
          <OnlineNow myUid={user.uid} />
        </Suspense>
      )}

      <nav className="grid grid-cols-2 gap-3">
        <Link to="/leaderboard" className="rounded-2xl bg-white/5 px-4 py-3 font-semibold ring-1 ring-white/10 hover:bg-white/10">🏆 Leaderboard</Link>
        <Link to="/passport" className="rounded-2xl bg-white/5 px-4 py-3 font-semibold ring-1 ring-white/10 hover:bg-white/10">🛂 My Passport</Link>
      </nav>

      {!profile.tutorialDone && (
        <Link to="/tutorial" className="flex items-center gap-3 rounded-2xl bg-gold/15 px-4 py-3 ring-1 ring-gold/40 hover:bg-gold/25">
          <span className="text-2xl" aria-hidden>🦉</span>
          <span className="flex-1">
            <strong>New to Uno?</strong> <span className="text-ink-muted">Take the 2-minute tutorial and earn a Passport stamp.</span>
          </span>
          <span aria-hidden>→</span>
        </Link>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Button className="py-4 text-lg" disabled={!!busy} onClick={() => void go('quick', gameApi.quickMatch)}>
          {busy === 'quick' ? 'Finding a table…' : '⚡ Quick Match (ranked)'}
        </Button>
        <Link to="/practice">
          <Button variant="ghost" className="w-full py-4 text-lg">🤖 Practice vs bots</Button>
        </Link>
      </div>

      <Panel className="space-y-4">
        <p className="font-display text-2xl font-extrabold">Start a table</p>
        <div className="flex flex-wrap items-center gap-4">
          <div role="radiogroup" aria-label="Seats" className="flex gap-1 rounded-xl bg-white/5 p-1">
            {[2, 3, 4].map((n) => (
              <button key={n} role="radio" aria-checked={seats === n} onClick={() => setSeats(n)}
                className={`min-h-10 rounded-lg px-4 ${seats === n ? 'bg-gold text-felt-950' : ''}`}>
                {n} seats
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={ranked} onChange={(e) => setRanked(e.target.checked)} className="h-5 w-5 accent-[var(--color-gold)]" />
            Ranked
          </label>
          <Button disabled={!!busy} onClick={() => void go('create', () => gameApi.createTable(seats, ranked ? 'ranked' : 'casual'))}>
            {busy === 'create' ? 'Creating…' : 'Create table'}
          </Button>
        </div>
        <p className="text-xs text-ink-muted">Ranked games need 3+ players and count toward the qualifier leaderboard.</p>
        <ErrorText>{error}</ErrorText>
      </Panel>

      <section className="space-y-3" aria-label="Open tables">
        <h2 className="font-display text-2xl font-extrabold">Open tables</h2>
        {tables.data === undefined ? (
          <p className="text-ink-muted">Loading…</p>
        ) : open.length === 0 ? (
          <p className="rounded-2xl bg-white/5 p-4 text-ink-muted">No open tables — start one or hit Quick Match!</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {open.map((t, i) => {
              const host = t.seats.find((s) => s.uid === t.hostUid);
              const full = t.seatUids.length >= t.maxSeats;
              return (
                <m.li
                  key={t.id}
                  initial={{ y: 12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ ...spring.soft, delay: i * stagger.list }}
                  className="flex items-center gap-3 rounded-2xl bg-felt-900/80 p-3 ring-1 ring-white/10"
                >
                  <div className="flex -space-x-3">
                    {t.seats.map((s) => (
                      <Avatar key={s.uid} avatarId={s.avatarId} color={s.avatarColor} size={36} label={s.displayName} />
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{host?.displayName ?? 'Someone'}'s table</p>
                    <p className="text-xs text-ink-muted">
                      {t.seatUids.length}/{t.maxSeats} · <span className="uppercase">{t.requestedMode}</span>
                      {' · '}{[...new Set(t.seats.map((s) => s.department).filter(Boolean))].join(', ')}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    disabled={!!busy || (full && !t.seatUids.includes(user?.uid ?? ''))}
                    onClick={() => void go(t.id, () => gameApi.joinTable(t.id).then(() => undefined), t.id)}
                  >
                    {full ? 'Full' : 'Join'}
                  </Button>
                </m.li>
              );
            })}
          </ul>
        )}
      </section>

      <footer className="flex flex-wrap gap-3 pb-6 text-sm text-ink-muted">
        <Link to="/rules" className="hover:text-ink">📖 Rules</Link>
        {claims.admin && <Link to="/admin" className="hover:text-ink">🛰️ Mission Control</Link>}
        {(import.meta.env.DEV || claims.admin) && <Link to="/dev/effects" className="hover:text-ink">✨ Effects gallery</Link>}
        <button onClick={() => void signOutEverywhere()} className="hover:text-ink">Sign out</button>
      </footer>
    </main>
  );
}
