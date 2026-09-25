import confetti from 'canvas-confetti';
import { collection, limit, orderBy, query, where, type Timestamp } from 'firebase/firestore';
import { AnimatePresence, m } from 'framer-motion';
import QRCode from 'qrcode';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { cueFor } from '../../audio/cues';
import { play } from '../../audio/sound';
import { SoundToggle } from '../../audio/SoundToggle';
import { useActiveBracket, useDirectory, type PlayerCard } from '../../hooks/bracket';
import { db, useDoc, useQuery } from '../../hooks/firestore';
import { spring } from '../../motion/tokens';
import { Avatar } from '../../ui/Avatar';
import { LiveOverlays } from '../live/LiveOverlays';
import { BracketBoard } from '../event/BracketBoard';
import type { TvScene } from '../../api/event';
import { PlayerIntros, SelectionShow } from './Scenes';

// Crowd reactions pull in the Realtime Database SDK; load them after the board is up.
const ReactionLayer = lazy(() => import('../event/Reactions').then((m) => ({ default: m.ReactionLayer })));

interface LiveGame {
  matchId: string;
  turnUid: string | null;
  handCounts: Record<string, number>;
  physicalTable?: number;
}

interface FeedEvent {
  seq: number;
  type: string;
  uid?: string;
  targetUid?: string;
  card?: { value: string };
  at?: Timestamp;
}

/** Plain-English ticker line for an event (motion spec §6 "Marcus hit Dana with a +4 at Table B"). */
function describe(e: FeedEvent, dir: Record<string, PlayerCard>, table: number | undefined): string | null {
  const who = (u?: string) => (u ? (dir[u]?.displayName ?? 'Someone') : 'Someone');
  const at = table ? ` at Table ${table}` : '';
  if (e.type === 'card_played' && e.card?.value === 'wild4' && e.targetUid) return `😈 ${who(e.uid)} hit ${who(e.targetUid)} with a +4${at}`;
  if (e.type === 'card_played' && e.card?.value === 'draw2' && e.targetUid) return `➕ ${who(e.uid)} made ${who(e.targetUid)} draw 2${at}`;
  if (e.type === 'card_played' && e.card?.value === 'skip' && e.targetUid) return `🚫 ${who(e.uid)} skipped ${who(e.targetUid)}${at}`;
  if (e.type === 'uno_called') return `🔔 ${who(e.uid)} calls UNO!${at}`;
  if (e.type === 'uno_caught') return `🎯 ${who(e.uid)} caught ${who(e.targetUid)}${at}`;
  if (e.type === 'final_lap') return `🏁 Final Lap${at}`;
  if (e.type === 'game_finished') return `🏆 ${who(e.uid)} wins${at}!`;
  return null;
}

function GameFeed({ gameId, onEvents }: { gameId: string; onEvents: (gameId: string, events: FeedEvent[]) => void }) {
  const events = useQuery<FeedEvent>(query(collection(db, `games/${gameId}/events`), orderBy('seq', 'desc'), limit(6)), `tv-events-${gameId}`);
  // The TV sound set follows the tables live; events already there when the TV loaded stay quiet.
  const heard = useRef<number | null>(null);
  useEffect(() => {
    if (!events.data) return;
    onEvents(gameId, events.data);
    const newest = Math.max(0, ...events.data.map((e) => e.seq));
    if (heard.current !== null) {
      for (const e of [...events.data].reverse()) {
        if (e.seq <= heard.current) continue;
        for (const snd of cueFor(e, true)?.sounds ?? []) play(snd.name, snd.delayMs);
      }
    }
    heard.current = Math.max(heard.current ?? 0, newest);
  }, [events.data, gameId, onEvents]);
  return null;
}

function useQr(text: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void QRCode.toDataURL(text, { margin: 1, width: 240, color: { dark: '#0b1a2b', light: '#ffffff' } }).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [text]);
  return url;
}

/**
 * /tv — the big screen (PRD E6/E7, motion spec §6). No interaction: the admin's TV director
 * (tv/state) picks the scene. Designed at 1920×1080; text ≥ 32 px for 5 m readability.
 */
export function TvPage() {
  const tv = useDoc<{ scene?: TvScene; autoCycle?: boolean; selectionStep?: number | null; introMatchId?: string | null }>('tv/state');
  const { bracketId, bracket, matches, season, paused } = useActiveBracket();
  const directory = useDirectory();
  const liveGames = useQuery<LiveGame>(
    bracketId ? query(collection(db, 'games'), where('bracketId', '==', bracketId), where('status', '==', 'in_progress')) : null,
    `tv-live-${bracketId}`,
  );
  const live = Object.fromEntries((liveGames.data ?? []).map((g) => [g.matchId, g]));
  const [feeds, setFeeds] = useState<Record<string, FeedEvent[]>>({});
  const onEvents = useMemo(() => (gameId: string, ev: FeedEvent[]) => setFeeds((f) => ({ ...f, [gameId]: ev })), []);
  const qr = useQr(window.location.origin);

  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    if (!tv.data?.autoCycle) return;
    const t = window.setInterval(() => setCycle((c) => c + 1), 20_000);
    return () => window.clearInterval(t);
  }, [tv.data?.autoCycle]);
  const anyLive = (liveGames.data ?? []).length > 0;
  const scene: TvScene =
    bracket?.championUid && tv.data?.scene !== 'bracket'
      ? 'champion'
      : tv.data?.autoCycle && !anyLive
        ? (['bracket', 'pickem', 'cup'] as const)[cycle % 3]!
        : (tv.data?.scene ?? 'bracket');

  const ticker = (liveGames.data ?? [])
    .flatMap((g) => (feeds[g.id] ?? []).map((e) => ({ e, table: g.physicalTable, key: `${g.id}-${e.seq}` })))
    .sort((a, b) => (b.e.at?.toMillis() ?? 0) - (a.e.at?.toMillis() ?? 0))
    .map(({ e, table, key }) => ({ key, text: describe(e, directory, table) }))
    .filter((x): x is { key: string; text: string } => !!x.text)
    .slice(0, 8);

  // Intros default to the next table up: the earliest ready match, else the newest live one.
  const introMatch =
    (tv.data?.introMatchId ? matches[tv.data.introMatchId] : undefined) ??
    Object.values(matches)
      .filter((mt) => mt.status === 'ready' || mt.status === 'in_progress')
      .sort((a, b) => (a.status === b.status ? a.round - b.round || a.physicalTable - b.physicalTable : a.status === 'ready' ? -1 : 1))[0] ??
    null;
  const reactionTargets = useMemo(
    () => ['bracket', ...Object.values(matches).filter((mt) => mt.status === 'in_progress').map((mt) => mt.id)],
    [matches],
  );
  const locked = !!bracket && bracket.status !== 'draft';

  return (
    <main className="felt-grain fixed inset-0 flex flex-col overflow-hidden p-[3vw] text-[1.1vw]">
      <LiveOverlays />
      <Suspense fallback={null}>
        <ReactionLayer targets={reactionTargets} />
      </Suspense>
      <SoundToggle className="fixed bottom-2 right-2 z-40 opacity-40 hover:opacity-100" />
      {(liveGames.data ?? []).map((g) => (
        <GameFeed key={g.id} gameId={g.id} onEvents={onEvents} />
      ))}
      <header className="flex items-center gap-6">
        <h1 className="font-display text-[4vw] font-extrabold leading-none">
          <span className="text-card-red">NUE</span> <span className="text-gold">UNO</span>
        </h1>
        <span className="font-display text-[2vw] font-extrabold text-ink-muted">Connections Tournament</span>
        {paused && <span className="ml-auto animate-pulse rounded-2xl bg-card-yellow px-6 py-2 text-[2vw] font-extrabold text-felt-950">⏸ PAUSED</span>}
        {qr && (
          <figure className={`${paused ? '' : 'ml-auto'} flex items-center gap-3 rounded-2xl bg-white p-2 text-felt-950`}>
            <img src={qr} alt="" className="h-[7vw] w-[7vw]" />
            <figcaption className="pr-3 text-[1.2vw] font-bold leading-tight">Scan to play,<br />pick &amp; react</figcaption>
          </figure>
        )}
      </header>

      <section className="relative mt-[2vw] flex-1">
        <AnimatePresence mode="wait">
          <m.div
            key={scene}
            className="absolute inset-0"
            initial={{ clipPath: 'inset(0 100% 0 0)' }}
            animate={{ clipPath: 'inset(0 0% 0 0)' }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            {scene === 'champion' && bracket?.championUid ? (
              <Champion card={directory[bracket.championUid]} />
            ) : scene === 'pickem' && bracketId ? (
              <PickemScene bracketId={bracketId} />
            ) : scene === 'cup' ? (
              <CupScene seasonId={season.id} />
            ) : scene === 'selection' && locked ? (
              <SelectionShow step={tv.data?.selectionStep ?? 0} bracket={bracket} matches={matches} directory={directory} />
            ) : scene === 'intros' && locked ? (
              <PlayerIntros key={introMatch?.id} match={introMatch} bracket={bracket} directory={directory} seasonId={season.id} />
            ) : bracket && bracket.status !== 'draft' ? (
              <BracketBoard bracket={bracket} matches={matches} directory={directory} size="tv" live={live} />
            ) : (
              <div className="grid h-full place-items-center text-center">
                <p className="font-display text-[5vw] font-extrabold">The bracket is coming soon…</p>
              </div>
            )}
          </m.div>
        </AnimatePresence>
      </section>

      <footer className="mt-[1.5vw] h-[3vw] overflow-hidden rounded-xl bg-felt-950/80 ring-1 ring-white/10" aria-live="polite">
        <m.div
          className="flex h-full items-center gap-[4vw] whitespace-nowrap px-6 text-[1.6vw] font-semibold"
          animate={{ x: ['0%', '-50%'] }}
          transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
        >
          {[...ticker, ...ticker].map((t, i) => (
            <span key={`${t.key}-${i}`}>{t.text}</span>
          ))}
          {ticker.length === 0 && <span className="text-ink-muted">Scan the QR code to play, make your Pick'em picks and cheer on the tables!</span>}
        </m.div>
      </footer>
    </main>
  );
}

function Champion({ card }: { card?: PlayerCard }) {
  useEffect(() => {
    const end = Date.now() + 6000;
    let shot = 0;
    const burst = () => {
      // Sweep bursts across the screen (deterministic — no Math.random in app code).
      void confetti({ particleCount: 120, spread: 110, startVelocity: 55, origin: { x: ((shot++ * 0.37) % 1) * 0.8 + 0.1, y: 0.3 } });
      if (Date.now() < end) window.setTimeout(burst, 700);
    };
    burst();
  }, []);
  return (
    <div className="grid h-full place-items-center text-center">
      <m.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.bouncy} className="space-y-[2vw]">
        <p className="font-display text-[3vw] font-extrabold tracking-widest text-gold">🏆 CHAMPION 🏆</p>
        <div className="mx-auto w-fit rounded-full p-[0.6vw] shadow-[0_0_80px_#f5c542] ring-[0.5vw] ring-gold">
          <Avatar avatarId={card?.avatarId ?? 'fox'} color={card?.avatarColor ?? 'teal'} size={260} label={card?.displayName ?? 'Champion'} />
        </div>
        <p className="font-display text-[7vw] font-extrabold leading-none">{card?.displayName ?? 'Champion'}</p>
        {card?.department && <p className="text-[2vw] text-ink-muted">{card.department}</p>}
      </m.div>
    </div>
  );
}

function PickemScene({ bracketId }: { bracketId: string }) {
  const board = useQuery<{ displayName: string; avatarId: string; avatarColor: string; points: number; correct: number }>(
    query(collection(db, `pickem/${bracketId}/entries`), orderBy('points', 'desc'), limit(10)),
    `tv-pickem-${bracketId}`,
  );
  const top = board.data?.[0]?.points || 1;
  return (
    <div className="flex h-full flex-col gap-[1vw]">
      <h2 className="font-display text-[3.5vw] font-extrabold text-gold">🔮 Pick'em leaders</h2>
      {(board.data ?? []).map((e, i) => (
        <m.div key={e.id} layout transition={spring.soft} className="flex items-center gap-[1.5vw]">
          <span className="font-display w-[3vw] text-[2.4vw] font-extrabold">{i + 1}</span>
          <Avatar avatarId={e.avatarId} color={e.avatarColor} size={56} label="" />
          <div className="relative h-[3.2vw] flex-1 overflow-hidden rounded-xl bg-white/5">
            <m.div className="absolute inset-y-0 left-0 bg-gradient-to-r from-card-blue to-card-green" initial={{ width: 0 }} animate={{ width: `${(e.points / top) * 100}%` }} transition={spring.soft} />
            <span className="relative flex h-full items-center px-4 text-[1.8vw] font-bold">{e.displayName}</span>
          </div>
          <span className="font-display w-[5vw] text-right text-[2.4vw] font-extrabold">{e.points}</span>
        </m.div>
      ))}
    </div>
  );
}

function CupScene({ seasonId }: { seasonId: string }) {
  const cup = useQuery<{ department: string; cupScore: number }>(
    query(collection(db, `departmentCup/${seasonId}/entries`), orderBy('cupScore', 'desc'), limit(10)),
    `tv-cup-${seasonId}`,
  );
  const top = cup.data?.[0]?.cupScore || 1;
  return (
    <div className="flex h-full flex-col gap-[1vw]">
      <h2 className="font-display text-[3.5vw] font-extrabold text-gold">🏢 Department Cup</h2>
      {(cup.data ?? []).map((d, i) => (
        <m.div key={d.id} layout transition={spring.soft} className="flex items-center gap-[1.5vw]">
          <span className="font-display w-[3vw] text-[2.4vw] font-extrabold">{i === 0 ? '👑' : i + 1}</span>
          <div className="relative h-[3.6vw] flex-1 overflow-hidden rounded-xl bg-white/5">
            <m.div className="absolute inset-y-0 left-0 bg-gradient-to-r from-card-red to-gold" initial={{ width: 0 }} animate={{ width: `${(d.cupScore / top) * 100}%` }} transition={spring.soft} />
            <span className="relative flex h-full items-center px-4 text-[2vw] font-bold">{d.department}</span>
          </div>
          <span className="font-display w-[6vw] text-right text-[2.6vw] font-extrabold">{d.cupScore}</span>
        </m.div>
      ))}
    </div>
  );
}
