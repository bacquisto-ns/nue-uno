import { useEffect } from 'react';
import { limits } from './tokens';
import { useEffectsStore } from './effectsMode';

/**
 * X17 performance-aware effects (motion spec §9): sample the frame rate while effects run and
 * switch this session to Reduced if it averages under 45 fps for 2 seconds.
 */
export function useFpsGovernor(active: boolean): void {
  const setAutoReduced = useEffectsStore((s) => s.setAutoReduced);

  useEffect(() => {
    if (!active || document.visibilityState !== 'visible') return;
    let raf = 0;
    let frames = 0;
    let windowStart = performance.now();
    let slowWindows = 0;
    const tick = (now: number) => {
      frames++;
      const elapsed = now - windowStart;
      if (elapsed >= 1000) {
        const fps = (frames * 1000) / elapsed;
        slowWindows = fps < limits.fpsFloor ? slowWindows + 1 : 0;
        frames = 0;
        windowStart = now;
        if (slowWindows >= 2) {
          setAutoReduced(true);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    const onVisibility = () => {
      // Background tabs pause rAF; restart the window so a resume isn't counted as slow.
      frames = 0;
      windowStart = performance.now();
      slowWindows = 0;
    };
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active, setAutoReduced]);
}
