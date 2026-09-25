import { m } from 'framer-motion';
import type { BracketView, MatchView, PlayerCard } from '../../hooks/bracket';
import { spring } from '../../motion/tokens';
import { Avatar } from '../../ui/Avatar';

const STATUS: Record<MatchView['status'], { label: string; cls: string }> = {
  waiting_for_players: { label: 'Waiting', cls: 'bg-white/10 text-ink-muted' },
  ready: { label: 'Ready', cls: 'bg-gold text-felt-950' },
  in_progress: { label: 'Live', cls: 'bg-card-red text-white animate-pulse' },
  complete: { label: 'Done', cls: 'bg-card-green/80 text-white' },
};

/**
 * The bracket as columns of table cards (TV scene "Bracket Board" and the /bracket page).
 * `size="tv"` scales type for reading at 5 m (motion spec §6).
 */
export function BracketBoard({
  bracket,
  matches,
  directory,
  highlightUid,
  size = 'app',
  live,
}: {
  bracket: BracketView;
  matches: Record<string, MatchView>;
  directory: Record<string, PlayerCard>;
  highlightUid?: string;
  size?: 'app' | 'tv';
  /** Optional live overlay per match (card counts, turn) — TV only. */
  live?: Record<string, { turnUid: string | null; handCounts: Record<string, number> }>;
}) {
  const tv = size === 'tv';
  return (
    <div className={`grid gap-4 ${tv ? 'gap-8' : ''}`} style={{ gridTemplateColumns: `repeat(${bracket.rounds.length}, minmax(0, 1fr))` }}>
      {bracket.rounds.map((r) => (
        <section key={r.number} className="flex flex-col gap-4" aria-label={r.name}>
          <h3 className={`font-display font-extrabold text-gold ${tv ? 'text-4xl' : 'text-xl'}`}>{r.name}</h3>
          <div className="flex flex-1 flex-col justify-around gap-4">
          {r.matchIds.map((id) => {
            const mt = matches[id];
            if (!mt) return null;
            const st = STATUS[mt.status];
            const liveInfo = live?.[id];
            return (
              <m.article
                key={id}
                layout
                transition={spring.soft}
                className={`rounded-2xl bg-felt-900/90 ring-1 ${mt.status === 'in_progress' ? 'ring-card-red/70' : 'ring-white/10'} ${tv ? 'p-5' : 'p-3'}`}
              >
                <header className="mb-2 flex items-center gap-2">
                  <span className={`font-display font-extrabold ${tv ? 'text-2xl' : 'text-base'}`}>Table {mt.physicalTable}</span>
                  {mt.gamesToPlay > 1 && <span className="text-xs text-ink-muted">game {Math.min(mt.gameIds.length || 1, mt.gamesToPlay)}/{mt.gamesToPlay}</span>}
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${st.cls}`}>{st.label}</span>
                </header>
                <ul className="space-y-1">
                  {mt.slots.map((uid, i) => {
                    const p = uid ? directory[uid] : undefined;
                    const place = uid ? mt.standings.findIndex((s) => s.uid === uid) : -1;
                    const adv = uid ? mt.advancing.includes(uid) : false;
                    const isTurn = liveInfo && uid && liveInfo.turnUid === uid;
                    return (
                      <li
                        key={uid ?? `empty-${i}`}
                        className={`flex items-center gap-2 rounded-lg px-2 py-1 ${adv ? 'bg-gold/20 ring-1 ring-gold/60' : ''} ${uid && uid === highlightUid ? 'outline outline-2 outline-card-blue' : ''}`}
                      >
                        {p ? (
                          <Avatar avatarId={p.avatarId} color={p.avatarColor} size={tv ? 40 : 24} label="" />
                        ) : (
                          <span className={`grid place-items-center rounded-full bg-white/10 text-ink-muted ${tv ? 'h-10 w-10' : 'h-6 w-6'}`}>?</span>
                        )}
                        <span className={`truncate ${tv ? 'text-2xl' : 'text-sm'} ${uid ? 'font-semibold' : 'text-ink-muted'}`}>
                          {p?.displayName ?? (uid ? 'Player' : 'TBD')}
                        </span>
                        {isTurn && <span className="text-xs text-card-red">● turn</span>}
                        {liveInfo && uid && <span className={`ml-auto rounded-full bg-white px-2 font-bold text-felt-950 ${tv ? 'text-lg' : 'text-xs'}`}>{liveInfo.handCounts[uid] ?? '–'}</span>}
                        {!liveInfo && mt.status === 'complete' && place >= 0 && (
                          <span className={`ml-auto font-bold ${tv ? 'text-xl' : 'text-xs'} ${adv ? 'text-gold' : 'text-ink-muted'}`}>
                            {mt.gamesToPlay > 1 ? `${mt.standings[place]!.points} pts` : `#${place + 1}`}
                          </span>
                        )}
                        {!liveInfo && mt.status === 'ready' && uid && mt.checkedIn.includes(uid) && (
                          <span className="ml-auto text-xs text-card-green">✓ here</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </m.article>
            );
          })}
          </div>
        </section>
      ))}
    </div>
  );
}
