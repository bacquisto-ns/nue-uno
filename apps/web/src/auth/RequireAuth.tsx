import { isCompanyEmail } from '@nue-uno/shared';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Button, Logo, Panel, Screen } from '../ui/primitives';
import { signOutEverywhere, useSession } from './session';

function Splash() {
  return (
    <Screen>
      <div className="flex justify-center" aria-busy="true" aria-live="polite">
        <Logo />
      </div>
    </Screen>
  );
}

/**
 * Route guard: signed in → company email → has a profile → approved.
 * Pending users see the waiting screen; first-time users go to /welcome.
 */
export function RequireAuth({ children, allowFirstRun = false }: { children: ReactNode; allowFirstRun?: boolean }) {
  const { loading, user, profile, claims } = useSession();
  const location = useLocation();

  if (loading) return <Splash />;
  if (!user) return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  if (!isCompanyEmail(user.email)) {
    return (
      <Screen>
        <Panel>
          <p className="mb-4">Nue Uno is for NueSynergy employees only.</p>
          <Button onClick={() => void signOutEverywhere()}>Sign out</Button>
        </Panel>
      </Screen>
    );
  }
  if (profile === undefined) return <Splash />;
  if (profile === null) return allowFirstRun ? <>{children}</> : <Navigate to="/welcome" replace />;
  if (profile.status === 'disabled') {
    return (
      <Screen>
        <Panel>This account has been disabled. Contact the event organizers.</Panel>
      </Screen>
    );
  }
  if (profile.status === 'pending' || !claims.active) {
    if (allowFirstRun) return <>{children}</>;
    return <PendingApproval />;
  }
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const claims = useSession((s) => s.claims);
  return claims.admin ? <>{children}</> : <Navigate to="/" replace />;
}

function PendingApproval() {
  return (
    <Screen>
      <Logo size="sm" />
      <Panel>
        <p className="font-display text-2xl font-extrabold">Almost there ⏳</p>
        <p className="mt-2 text-ink-muted">
          Your email isn't on the employee roster yet, so an organizer needs to approve you. You'll
          get in automatically once they do.
        </p>
        <Button variant="ghost" className="mt-4" onClick={() => void signOutEverywhere()}>
          Sign out
        </Button>
      </Panel>
    </Screen>
  );
}
