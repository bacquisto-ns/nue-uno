import { COMPANY_DOMAIN, isCompanyEmail } from '@nue-uno/shared';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { m } from 'framer-motion';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { auth, usingEmulators } from '../firebase';
import { spring } from '../motion/tokens';
import { Card } from '../ui/Card';
import { Button, ErrorText, Logo, Panel, Screen } from '../ui/primitives';
import { useSession } from './session';

export const EMAIL_KEY = 'nueUno.emailForSignIn';
export const MIN_PASSWORD = 8;

const HERO = [
  { id: 'h1', color: 'red', value: '7' },
  { id: 'h2', color: 'wild', value: 'wild' },
  { id: 'h3', color: 'blue', value: 'reverse' },
] as const;

type Mode = 'signin' | 'create' | 'link';

/** Friendly text for Firebase Auth errors (enumeration protection keeps sign-in errors generic). */
export function authMessage(code: string | undefined): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return "That email and password don't match. New here? Create an account instead.";
    case 'auth/email-already-in-use':
      return 'That email already has an account. Sign in instead, or use "Forgot password?".';
    case 'auth/weak-password':
      return `Use at least ${MIN_PASSWORD} characters.`;
    case 'auth/too-many-requests':
      return 'Too many tries. Wait a minute and try again.';
    case 'auth/network-request-failed':
      return 'No connection. Check your network and try again.';
    case 'auth/operation-not-allowed':
      return "Password sign-in isn't switched on yet. Tell the organizers.";
    default:
      return 'Something went wrong. Try again.';
  }
}

const inputCls = 'w-full rounded-xl bg-felt-950/70 px-4 py-3 text-lg ring-1 ring-white/15 placeholder:text-ink-muted/60 focus:ring-gold';

/**
 * Sign in (PRD A1). Passwords are the default (decision 2026-09-25, ADR-3: sign-in emails were
 * being filtered); the email link stays available. Either way only @nuesynergy.com works — the
 * server guards and security rules enforce the domain, this check just fails fast.
 */
export function SignIn() {
  const user = useSession((s) => s.user);
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  function switchTo(next: Mode) {
    setMode(next);
    setError('');
    setNotice('');
  }

  function cleanEmail(): string | null {
    const clean = email.trim().toLowerCase();
    if (!isCompanyEmail(clean)) {
      setError(`Use your @${COMPANY_DOMAIN} work email.`);
      return null;
    }
    return clean;
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    const clean = cleanEmail();
    if (!clean) return;
    if (mode === 'create' && password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      // The session listener picks up the new user and routes to first-run setup or the lobby.
      if (mode === 'create') await createUserWithEmailAndPassword(auth, clean, password);
      else await signInWithEmailAndPassword(auth, clean, password);
    } catch (err) {
      console.error('password sign-in failed', err);
      setError(authMessage((err as { code?: string }).code));
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    const clean = cleanEmail();
    if (!clean) return;
    setBusy(true);
    setError('');
    try {
      await sendPasswordResetEmail(auth, clean, { url: `${window.location.origin}/signin` });
      setNotice(`If ${clean} has an account, a reset link is on its way. Check Junk and Quarantine too.`);
    } catch (err) {
      console.error('sendPasswordResetEmail failed', err);
      setError(authMessage((err as { code?: string }).code));
    } finally {
      setBusy(false);
    }
  }

  async function submitLink(e: FormEvent) {
    e.preventDefault();
    const clean = cleanEmail();
    if (!clean) return;
    setBusy(true);
    setError('');
    try {
      await sendSignInLinkToEmail(auth, clean, {
        url: `${window.location.origin}/auth/finish`,
        handleCodeInApp: true,
      });
      localStorage.setItem(EMAIL_KEY, clean);
      setSentTo(clean);
    } catch (err) {
      // Surfaces Firebase config problems (auth/operation-not-allowed, auth/unauthorized-continue-uri, …).
      console.error('sendSignInLinkToEmail failed', err);
      setError("We couldn't send the link. Check the address and try again.");
    } finally {
      setBusy(false);
    }
  }

  const emailField = (
    <div className="space-y-1 text-left">
      <label className="block text-sm font-medium" htmlFor="email">
        Work email
      </label>
      <input
        id="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        placeholder={`you@${COMPANY_DOMAIN}`}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={inputCls}
      />
    </div>
  );

  return (
    <Screen>
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="relative h-36 w-56" aria-hidden>
          {HERO.map((card, i) => (
            <m.div
              key={card.id}
              className="absolute left-1/2 top-2"
              initial={{ opacity: 0, y: 40, rotate: 0, x: '-50%' }}
              animate={{ opacity: 1, y: 0, rotate: (i - 1) * 14, x: `calc(-50% + ${(i - 1) * 42}px)` }}
              transition={{ ...spring.bouncy, delay: 0.1 + i * 0.08 }}
            >
              <Card card={card} width={76} />
            </m.div>
          ))}
        </div>
        <Logo />
        <p className="text-ink-muted">The NueSynergy Connections tournament.</p>
      </div>

      <Panel>
        {sentTo ? (
          <div className="space-y-3 text-center" aria-live="polite">
            <p className="font-display text-2xl font-extrabold">Check your inbox ✉️</p>
            <p className="text-ink-muted">
              We sent a sign-in link to <strong className="text-ink">{sentTo}</strong>. Open it on
              this device to jump straight in. Not there? Check Junk, or use a password instead.
            </p>
            {usingEmulators && (
              <p className="text-xs text-ink-muted">
                Emulator mode: find the link in the Emulator UI → Authentication.
              </p>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                setSentTo(null);
                switchTo('signin');
              }}
            >
              Use a password instead
            </Button>
          </div>
        ) : mode === 'link' ? (
          <form onSubmit={submitLink} className="space-y-4">
            {emailField}
            <ErrorText>{error}</ErrorText>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Sending…' : 'Email me a sign-in link'}
            </Button>
            <button type="button" className="w-full text-center text-sm text-gold underline" onClick={() => switchTo('signin')}>
              Use a password instead
            </button>
          </form>
        ) : (
          <form onSubmit={submitPassword} className="space-y-4">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-felt-950/60 p-1" role="tablist" aria-label="Sign in or create an account">
              {(['signin', 'create'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={mode === tab}
                  onClick={() => switchTo(tab)}
                  className={`rounded-lg py-2 text-sm font-semibold ${mode === tab ? 'bg-gold text-felt-950' : 'text-ink-muted hover:text-ink'}`}
                >
                  {tab === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>
            {emailField}
            <div className="space-y-1 text-left">
              <label className="block text-sm font-medium" htmlFor="password">
                {mode === 'create' ? `Choose a password (${MIN_PASSWORD}+ characters)` : 'Password'}
              </label>
              <input
                id="password"
                type="password"
                autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                required
                minLength={mode === 'create' ? MIN_PASSWORD : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
              />
            </div>
            <ErrorText>{error}</ErrorText>
            {notice && (
              <p role="status" className="text-sm text-card-green">
                {notice}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'One moment…' : mode === 'create' ? 'Create account' : 'Sign in'}
            </Button>
            <div className="flex justify-between gap-3 text-sm">
              {mode === 'signin' ? (
                <button type="button" className="text-gold underline" disabled={busy} onClick={() => void forgot()}>
                  Forgot password?
                </button>
              ) : (
                <span />
              )}
              <button type="button" className="text-ink-muted underline hover:text-ink" onClick={() => switchTo('link')}>
                Email me a link instead
              </button>
            </div>
          </form>
        )}
      </Panel>
    </Screen>
  );
}
