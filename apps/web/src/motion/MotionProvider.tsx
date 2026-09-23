import { LazyMotion } from 'framer-motion';
import type { ReactNode } from 'react';

// Animation features load after first paint, keeping them out of the lobby bundle (PRD §11).
// Components use `m.*` (not `motion.*`) so only the tiny core ships up front.
const loadFeatures = () => import('./features').then((mod) => mod.default);

export function MotionProvider({ children }: { children: ReactNode }) {
  return <LazyMotion features={loadFeatures}>{children}</LazyMotion>;
}
