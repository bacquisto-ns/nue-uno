import { onIdTokenChanged, signOut, type User } from 'firebase/auth';
import { create } from 'zustand';
import { auth, loadDb } from '../firebase';
import { useEffectsStore, type EffectsMode } from '../motion/effectsMode';

export interface UserProfile {
  email: string;
  status: 'pending' | 'active' | 'disabled';
  displayName: string;
  department: string | null;
  avatarId: string;
  avatarColor: string;
  attendingEvent: 'yes' | 'no' | 'maybe';
  settings?: { effects?: EffectsMode; sound?: boolean; haptics?: boolean; emotesMuted?: boolean };
  isAdmin?: boolean;
  tutorialDone?: boolean;
  activeGameId?: string | null;
}

interface SessionState {
  loading: boolean;
  user: User | null;
  claims: { active?: boolean; admin?: boolean };
  /** undefined = still loading; null = no profile yet (first run). */
  profile: UserProfile | null | undefined;
}

export const useSession = create<SessionState>(() => ({
  loading: true,
  user: null,
  claims: {},
  profile: undefined,
}));

let unsubProfile: (() => void) | null = null;

/** Wire Firebase auth + the user's profile doc into the store. Call once at startup. */
export function startSession(): () => void {
  return onIdTokenChanged(auth, async (user) => {
    unsubProfile?.();
    unsubProfile = null;
    if (!user) {
      useSession.setState({ loading: false, user: null, claims: {}, profile: undefined });
      return;
    }
    const token = await user.getIdTokenResult();
    useSession.setState({
      loading: false,
      user,
      claims: { active: token.claims.active === true, admin: token.claims.admin === true },
    });
    const [db, { doc, onSnapshot }] = await Promise.all([loadDb(), import('firebase/firestore')]);
    if (auth.currentUser?.uid !== user.uid) return; // signed out while loading
    unsubProfile = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        const profile = snap.exists() ? (snap.data() as UserProfile) : null;
        useSession.setState({ profile });
        if (profile?.settings?.effects) useEffectsStore.getState().setPreference(profile.settings.effects);
        // An admin approved us (or saveProfile activated us): pick up the new `active` claim.
        if (profile?.status === 'active' && !useSession.getState().claims.active) void refreshClaims();
      },
      () => useSession.setState({ profile: null }),
    );
  });
}

/** Refresh the ID token so new custom claims (e.g. `active`) take effect immediately. */
export async function refreshClaims(): Promise<void> {
  await auth.currentUser?.getIdToken(true);
}

export function signOutEverywhere(): Promise<void> {
  return signOut(auth);
}
