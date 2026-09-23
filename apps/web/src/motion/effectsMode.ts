import { useEffect, useState } from 'react';
import { create } from 'zustand';

export type EffectsMode = 'full' | 'reduced' | 'off';

interface EffectsState {
  /** The user's saved preference (from users/{uid}.settings.effects). */
  preference: EffectsMode;
  /** Set by the FPS governor when the device can't keep up (motion spec §9). */
  autoReduced: boolean;
  setPreference: (mode: EffectsMode) => void;
  setAutoReduced: (value: boolean) => void;
}

export const useEffectsStore = create<EffectsState>((set) => ({
  preference: 'full',
  autoReduced: false,
  setPreference: (preference) => set({ preference }),
  setAutoReduced: (autoReduced) => set({ autoReduced }),
}));

function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(query).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia?.(query);
    if (!mql) return;
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/** The effective mode: the strictest of user preference, OS setting and auto-downgrade. */
export function useEffectsMode(): EffectsMode {
  const { preference, autoReduced } = useEffectsStore();
  const osReduced = usePrefersReducedMotion();
  if (preference === 'off') return 'off';
  if (preference === 'reduced' || osReduced || autoReduced) return 'reduced';
  return 'full';
}
