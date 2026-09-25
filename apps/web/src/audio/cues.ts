import type { Haptic } from './haptics';
import type { SoundName } from './sound';

export interface CueEvent {
  type: string;
  uid?: string;
  targetUid?: string;
  card?: { value: string; color?: string };
  count?: number;
}

export interface Cue {
  sounds: { name: SoundName; delayMs?: number }[];
  haptic?: Haptic;
  /** Haptic only when this uid is me (e.g. I'm the one who got +4'd). */
  hapticFor?: string;
}

/**
 * Sound + haptic for a game event (motion spec §5 table). Pure, so it's unit-tested. Penalty draws
 * arrive as their own `cards_drawn` event, so +2/+4 don't add draw sounds here.
 */
export function cueFor(e: CueEvent, tv = false): Cue | null {
  switch (e.type) {
    case 'game_started':
      return { sounds: [{ name: 'shuffle' }, { name: 'flip', delayMs: 700 }] };
    case 'card_played': {
      const v = e.card?.value;
      if (v === 'wild4')
        return {
          sounds: [{ name: 'slam' }, { name: 'crowd-ooh', delayMs: 250 }],
          haptic: 'heavy',
          hapticFor: e.targetUid,
        };
      if (v === 'wild') return { sounds: [{ name: 'card-snap' }, { name: 'whoosh-color', delayMs: 150 }], haptic: 'medium' };
      if (v === 'skip' && e.targetUid) return { sounds: [{ name: 'card-snap' }, { name: 'stamp', delayMs: 200 }], haptic: 'medium', hapticFor: e.targetUid };
      if (v === 'draw2' && e.targetUid)
        return { sounds: [{ name: 'card-snap' }, { name: 'stamp', delayMs: 200 }], haptic: 'medium', hapticFor: e.targetUid };
      if (v === 'reverse') return { sounds: [{ name: 'card-snap' }, { name: 'whoosh-reverse', delayMs: 120 }], haptic: 'light' };
      return { sounds: [{ name: 'card-snap' }] };
    }
    case 'cards_drawn':
      return { sounds: Array.from({ length: Math.min(e.count ?? 1, 4) }, (_, i) => ({ name: 'draw' as const, delayMs: i * 100 })) };
    case 'uno_called':
      return { sounds: [{ name: 'uno-shout' }], haptic: 'double' };
    case 'uno_caught':
      return { sounds: [{ name: 'siren-short' }, { name: 'stamp', delayMs: 400 }], haptic: 'heavy', hapticFor: e.targetUid };
    case 'final_lap':
      return { sounds: [{ name: 'final-lap-horn' }], haptic: 'long' };
    case 'game_finished':
      return { sounds: [{ name: 'win-sting' }, ...(tv ? [{ name: 'cheer' as const, delayMs: 400 }] : [])], haptic: 'celebration' };
    default:
      return null;
  }
}
