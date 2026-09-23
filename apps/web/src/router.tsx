import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { FinishSignIn } from './auth/FinishSignIn';
import { RequireAuth } from './auth/RequireAuth';
import { SignIn } from './auth/SignIn';
import { Home } from './features/home/Home';

const ProfileForm = lazy(() =>
  import('./features/onboarding/ProfileForm').then((m) => ({ default: m.ProfileForm })),
);

// Heavy, effects-driven routes are split out of the lobby bundle (PRD §11 performance budget).
const EffectsGallery = lazy(() =>
  import('./features/dev/EffectsGallery').then((m) => ({ default: m.EffectsGallery })),
);

export const router = createBrowserRouter([
  { path: '/signin', element: <SignIn /> },
  { path: '/auth/finish', element: <FinishSignIn /> },
  {
    path: '/welcome',
    element: (
      <RequireAuth allowFirstRun>
        <Suspense fallback={null}>
          <ProfileForm mode="welcome" />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <Home />
      </RequireAuth>
    ),
  },
  {
    path: '/profile',
    element: (
      <RequireAuth>
        <Suspense fallback={null}>
          <ProfileForm mode="edit" />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/dev/effects',
    element: (
      <Suspense fallback={null}>
        <EffectsGallery />
      </Suspense>
    ),
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
