/** Haptic patterns (motion spec §8). Android Chrome only; a silent no-op elsewhere. */
export const HAPTICS = {
  light: [10],
  medium: [20],
  heavy: [35, 30, 35],
  double: [15, 60, 15],
  long: [120],
  celebration: [30, 50, 30, 50, 80],
} as const;

export type Haptic = keyof typeof HAPTICS;

export function buzz(pattern: Haptic, enabled = true): void {
  if (!enabled) return;
  try {
    navigator.vibrate?.([...HAPTICS[pattern]]);
  } catch {
    /* unsupported */
  }
}
