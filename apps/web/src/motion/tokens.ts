/**
 * Motion tokens — the only place durations, springs and easings are defined.
 * Spec: docs/design/experience-and-motion.md §2. Never hard-code timings in components.
 */
export const dur = {
  micro: 0.12,
  quick: 0.2,
  standard: 0.32,
  emphasis: 0.6,
  signature: 1.1,
} as const;

export const stagger = {
  deal: 0.06,
  list: 0.03,
} as const;

export const spring = {
  snappy: { type: 'spring', stiffness: 520, damping: 34 },
  bouncy: { type: 'spring', stiffness: 320, damping: 16 },
  soft: { type: 'spring', stiffness: 180, damping: 24 },
} as const;

export const ease = {
  throw: [0.2, 0.8, 0.2, 1],
  out: [0.16, 1, 0.3, 1],
  in: [0.7, 0, 0.84, 0],
} as const;

/** Effect budgets (PRD §11). */
export const limits = {
  particlesPhone: 150,
  particlesTv: 600,
  queueMaxBacklog: 3,
  queueMaxLagMs: 1500,
  fpsFloor: 45,
} as const;
