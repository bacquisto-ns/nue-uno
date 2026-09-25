import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { FinishSignIn } from './auth/FinishSignIn';
import { RequireAdmin, RequireAuth } from './auth/RequireAuth';
import { SignIn } from './auth/SignIn';

// Everything past sign-in is code-split; Firestore loads with these chunks (PRD §11 budget).
function page<K extends string>(loader: () => Promise<Record<K, ComponentType<never>>>, name: K) {
  return lazy(() => loader().then((m) => ({ default: m[name] as ComponentType })));
}
const HomeSwitch = page(() => import('./features/home/HomeSwitch'), 'HomeSwitch');
const Lobby = page(() => import('./features/lobby/Lobby'), 'Lobby');
const TablePage = page(() => import('./features/table/TablePage'), 'TablePage');
const PracticeGame = page(() => import('./features/practice/PracticeGame'), 'PracticeGame');
const RulesPage = page(() => import('./features/rules/RulesPage'), 'RulesPage');
const LeaderboardPage = page(() => import('./features/leaderboard/LeaderboardPage'), 'LeaderboardPage');
const PassportPage = page(() => import('./features/passport/PassportPage'), 'PassportPage');
const BracketPage = page(() => import('./features/event/BracketPage'), 'BracketPage');
const PickemPage = page(() => import('./features/event/PickemPage'), 'PickemPage');
const TableCheckIn = page(() => import('./features/event/TableCheckIn'), 'TableCheckIn');
const TvPage = page(() => import('./features/tv/TvPage'), 'TvPage');
const AdminPage = page(() => import('./features/admin/AdminPage'), 'AdminPage');
const TableSigns = page(() => import('./features/admin/TableSigns'), 'TableSigns');
const PrintBracket = page(() => import('./features/admin/PrintBracket'), 'PrintBracket');
const ProfileForm = lazy(() =>
  import('./features/onboarding/ProfileForm').then((m) => ({ default: m.ProfileForm })),
);
const EffectsGallery = page(() => import('./features/dev/EffectsGallery'), 'EffectsGallery');

const lazyEl = (el: ReactNode) => <Suspense fallback={null}>{el}</Suspense>;
const authed = (el: ReactNode) => <RequireAuth>{lazyEl(el)}</RequireAuth>;
const admin = (el: ReactNode) => (
  <RequireAuth>
    <RequireAdmin>{lazyEl(el)}</RequireAdmin>
  </RequireAuth>
);

export const router = createBrowserRouter([
  { path: '/signin', element: <SignIn /> },
  { path: '/auth/finish', element: <FinishSignIn /> },
  { path: '/welcome', element: <RequireAuth allowFirstRun>{lazyEl(<ProfileForm mode="welcome" />)}</RequireAuth> },
  { path: '/', element: authed(<HomeSwitch />) },
  { path: '/lobby', element: authed(<Lobby />) },
  { path: '/t/:gameId', element: authed(<TablePage />) },
  { path: '/practice', element: authed(<PracticeGame />) },
  { path: '/profile', element: authed(<ProfileForm mode="edit" />) },
  { path: '/leaderboard', element: authed(<LeaderboardPage />) },
  { path: '/passport', element: authed(<PassportPage />) },
  { path: '/bracket', element: authed(<BracketPage />) },
  { path: '/pickem', element: authed(<PickemPage />) },
  { path: '/table/:n', element: authed(<TableCheckIn />) },
  { path: '/tv', element: authed(<TvPage />) },
  { path: '/admin', element: admin(<AdminPage />) },
  { path: '/admin/signs', element: admin(<TableSigns />) },
  { path: '/admin/print', element: admin(<PrintBracket />) },
  { path: '/rules', element: lazyEl(<RulesPage />) },
  { path: '/dev/effects', element: lazyEl(<EffectsGallery />) },
  { path: '*', element: <Navigate to="/" replace /> },
]);
