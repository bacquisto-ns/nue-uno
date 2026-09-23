import { useEffect, useRef, useState } from 'react';

const R = 30;
const CIRC = 2 * Math.PI * R;

/**
 * X10 turn ring: drains clockwise, green → amber → red, heartbeat in the last 5 s.
 * The displayed time excludes the server's animation grace, so players never see more time
 * than they really have (ADR-4).
 */
export function TurnRing({
  deadlineMs,
  graceMs,
  totalMs,
  serverNow,
  size,
  isMe,
  haptics,
}: {
  deadlineMs: number | null;
  graceMs: number;
  totalMs: number;
  serverNow: () => number;
  size: number;
  isMe: boolean;
  haptics: boolean;
}) {
  const [remaining, setRemaining] = useState(totalMs);
  const lastBuzz = useRef<number | null>(null);

  useEffect(() => {
    if (deadlineMs === null) return;
    let raf = 0;
    const tick = () => {
      const left = Math.max(0, deadlineMs - graceMs - serverNow());
      setRemaining(left);
      const secs = Math.ceil(left / 1000);
      if (isMe && haptics && secs <= 3 && secs > 0 && lastBuzz.current !== secs) {
        lastBuzz.current = secs;
        navigator.vibrate?.(10);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [deadlineMs, graceMs, serverNow, isMe, haptics]);

  if (deadlineMs === null) {
    return <span className="pointer-events-none absolute inset-[-6px] rounded-full ring-4 ring-gold/80" aria-hidden />;
  }

  const frac = Math.min(1, remaining / Math.max(totalMs, 1));
  const color = frac > 0.5 ? '#2fa35b' : frac > 0.2 ? '#f5b400' : '#e5484d';
  const urgent = remaining <= 5000;
  return (
    <svg
      className={`pointer-events-none absolute -rotate-90 ${urgent ? 'animate-[heartbeat_1s_ease-in-out_infinite]' : ''}`}
      style={{ inset: -(size * 0.14), width: size * 1.28, height: size * 1.28 }}
      viewBox="0 0 64 64"
      aria-hidden
    >
      <circle cx="32" cy="32" r={R} fill="none" stroke="#ffffff22" strokeWidth="4" />
      <circle
        cx="32"
        cy="32"
        r={R}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={CIRC}
        strokeDashoffset={CIRC * (1 - frac)}
      />
    </svg>
  );
}

/** Seconds left, for screen readers and the "your turn" label. */
export function secondsLeft(deadlineMs: number | null, graceMs: number, now: number): number | null {
  return deadlineMs === null ? null : Math.max(0, Math.ceil((deadlineMs - graceMs - now) / 1000));
}
