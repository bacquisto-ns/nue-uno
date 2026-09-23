import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { FinishSignIn } from './auth/FinishSignIn';
import { RequireAuth } from './auth/RequireAuth';
import { SignIn } from './auth/SignIn';

// Everything past sign-in is code-split; Firestore loads with these chunks (PRD §11 budget).
function page<K extends string>(loader: () => Promise<Record<K, ComponentType<never>>>, name: K) {
  return lazy(() => loader().then((m) => ({ default: m[name] as ComponentType })));
}
const Lobby = page(() => import('./features/lobby/Lobby'), 'Lobby');
const TablePage = page(() => import('./features/table/TablePage'), 'TablePage');
const PracticeGame = page(() => import('./features/practice/PracticeGame'), 'PracticeGame');
const RulesPage = page(() => import('./features/rules/RulesPage'), 'RulesPage');
const ProfileForm = lazy(() =>
  import('./features/onboarding/ProfileForm').then((m) => ({ default: m.ProfileForm })),
);
const EffectsGallery = page(() => import('./features/dev/EffectsGallery'), 'EffectsGallery');

const lazyEl = (el: ReactNode) => <Suspense fallback={null}>{el}</Suspense>;
const authed = (el: ReactNode) => <RequireAuth>{lazyEl(el)}</RequireAuth>;

export const router = createBrowserRouter([
  { path: '/signin', element: <SignIn /> },
  { path: '/auth/finish', element: <FinishSignIn /> },
  { path: '/welcome', element: <RequireAuth allowFirstRun>{lazyEl(<ProfileForm mode="welcome" />)}</RequireAuth> },
  { path: '/', element: authed(<Lobby />) },
  { path: '/t/:gameId', element: authed(<TablePage />) },
  { path: '/practice', element: authed(<PracticeGame />) },
  { path: '/profile', element: authed(<ProfileForm mode="edit" />) },
  { path: '/rules', element: lazyEl(<RulesPage />) },
  { path: '/dev/effects', element: lazyEl(<EffectsGallery />) },
  { path: '*', element: <Navigate to="/" replace /> },
]);
