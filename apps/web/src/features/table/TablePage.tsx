import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../../api/call';
import { gameApi } from '../../api/game';
import { useSession } from '../../auth/session';
import { useDoc } from '../../hooks/firestore';
import { Avatar } from '../../ui/Avatar';
import { Button, ErrorText, Logo, Panel, Screen } from '../../ui/primitives';
import { OnlineGame, type GameDocData } from '../game/OnlineGame';
import { lazy, Suspense } from 'react';
import { LiveOverlays } from '../live/LiveOverlays';

const PresenceBeacon = lazy(() => import('../live/PresenceWidgets').then((m) => ({ default: m.PresenceBeacon })));

interface LobbyDoc extends GameDocData {
  hostUid: string;
  seatUids: string[];
  maxSeats: number;
  requestedMode: 'casual' | 'ranked';
  collusionWarning?: boolean;
  bracketId?: string | null;
}

/** /t/:gameId — pre-game table while in the lobby, then the live game (PRD L1, L4). */
export function TablePage() {
  const { gameId = '' } = useParams();
  const game = useDoc<LobbyDoc>(`games/${gameId}`);
  const seated = useSession((s) => !!s.user && !!game.data?.seatUids?.includes(s.user.uid));
  const beacon = (
    <Suspense fallback={null}>
      <PresenceBeacon activity={game.data?.status === 'in_progress' && seated ? 'game' : 'spectating'} gameId={gameId} />
    </Suspense>
  );

  if (game.data === undefined) return <Screen><Logo /></Screen>;
  if (game.data === null) {
    return (
      <Screen>
        <Panel>
          <p className="mb-4">That table has closed.</p>
          <Link to="/"><Button>Back to lobby</Button></Link>
        </Panel>
      </Screen>
    );
  }
  if (game.data.status === 'lobby') {
    return (
      <>
        {beacon}
        <LiveOverlays />
        <PreGameTable gameId={gameId} game={game.data} />
      </>
    );
  }
  return (
    <>
      {beacon}
      <OnlineGame
        gameId={gameId}
        game={game.data}
        fromCache={game.fromCache}
        pending={!!game.metadata?.hasPendingWrites}
      />
    </>
  );
}

function PreGameTable({ gameId, game }: { gameId: string; game: LobbyDoc }) {
  const navigate = useNavigate();
  const uid = useSession((s) => s.user!.uid);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const seated = game.seatUids.includes(uid);
  const isHost = game.hostUid === uid;
  const full = game.seatUids.length >= game.maxSeats;
  const link = `${window.location.origin}/t/${gameId}`;

  async function act(fn: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError('');
    try {
      await fn();
      after?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const rankedNote =
    game.requestedMode !== 'ranked'
      ? 'Casual game — just for fun.'
      : game.collusionWarning
        ? "This group has hit today's ranked limit — this game will be casual."
        : game.seatUids.length < 3
          ? 'Ranked needs 3+ players — with 2 it will be casual.'
          : 'Ranked (if the qualifier window is open).';

  return (
    <Screen>
      <div className="flex items-center justify-between">
        <Link to="/" className="text-ink-muted hover:text-ink">← Lobby</Link>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wide">
          {game.requestedMode}
        </span>
      </div>
      <Panel className="space-y-5">
        <p className="font-display text-3xl font-extrabold">Table</p>
        <ul className="grid grid-cols-2 gap-3" aria-label="Seats">
          {Array.from({ length: game.maxSeats }, (_, i) => {
            const s = game.seats[i];
            return (
              <li key={i} className={`flex items-center gap-3 rounded-2xl p-3 ${s ? 'bg-white/5' : 'border-2 border-dashed border-white/15'}`}>
                {s ? (
                  <>
                    <Avatar avatarId={s.avatarId} color={s.avatarColor} size={40} label={s.displayName} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{s.displayName}{s.uid === uid ? ' (you)' : ''}</p>
                      <p className="truncate text-xs text-ink-muted">
                        {[s.uid === game.hostUid ? 'Host' : null, s.department].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </>
                ) : (
                  <span className="text-sm text-ink-muted">Open seat</span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-ink-muted">{rankedNote}</p>

        <div className="flex gap-2">
          <input readOnly value={link} aria-label="Invite link" className="min-w-0 flex-1 rounded-xl bg-felt-950/70 px-3 py-2 text-sm ring-1 ring-white/15" />
          <Button
            variant="ghost"
            onClick={() => void navigator.clipboard?.writeText(link).then(() => setCopied(true))}
          >
            {copied ? 'Copied ✓' : 'Copy link'}
          </Button>
        </div>

        <ErrorText>{error}</ErrorText>
        <div className="flex flex-wrap gap-3">
          {!seated && (
            <Button disabled={busy || full} onClick={() => void act(() => gameApi.joinTable(gameId))}>
              {full ? 'Table full' : 'Take a seat'}
            </Button>
          )}
          {isHost && (
            <Button disabled={busy || game.seatUids.length < 2} onClick={() => void act(() => gameApi.startGame(gameId))}>
              {game.seatUids.length < 2 ? 'Waiting for players…' : 'Start game'}
            </Button>
          )}
          {seated && !isHost && <p className="self-center text-sm text-ink-muted">Waiting for the host to start…</p>}
          {seated && (
            <Button variant="ghost" disabled={busy} onClick={() => void act(() => gameApi.leaveTable(gameId), () => navigate('/'))}>
              Leave table
            </Button>
          )}
        </div>
      </Panel>
    </Screen>
  );
}
