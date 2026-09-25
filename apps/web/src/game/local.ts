import { splitState, type GameState } from '@nue-uno/engine';
import type { TableViewModel } from './view';

export interface LocalSeat {
  uid: string;
  displayName: string;
  avatarId: string;
  avatarColor: string;
}

/** Table view for a game run by the in-browser engine (practice, tutorial). */
export function localView(state: GameState, myUid: string, seats: readonly LocalSeat[], lastPlayedBy: string | null): TableViewModel {
  const { publicDoc } = splitState(state);
  const byUid = Object.fromEntries(seats.map((s) => [s.uid, s]));
  return {
    myUid,
    seats: state.players.map((uid) => ({
      ...byUid[uid]!,
      uid,
      department: null,
      cardCount: publicDoc.handCounts[uid] ?? 0,
      away: false,
      forfeited: state.forfeited.includes(uid),
      isBot: uid !== myUid,
    })),
    myHand: state.hands[myUid] ?? [],
    topCard: publicDoc.topCard,
    currentColor: state.currentColor,
    direction: state.direction,
    phase: state.phase,
    turnUid: publicDoc.turnUid,
    drawnCardId: state.drawnCardId,
    drawPileCount: publicDoc.drawPileCount,
    unoPending: state.unoPending,
    finalLap: state.finalLap,
    turnDeadlineMs: null,
    graceMs: 0,
    paused: false,
    mode: 'practice',
    status: state.phase === 'finished' ? 'finished' : 'in_progress',
    placements: state.placements,
    endedBy: state.endedBy,
    version: state.version,
    lastPlayedBy,
  };
}
