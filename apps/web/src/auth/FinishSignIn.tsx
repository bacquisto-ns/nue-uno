import { isCompanyEmail } from '@nue-uno/shared';
import { isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { auth } from '../firebase';
import { Button, ErrorText, Logo, Panel, Screen } from '../ui/primitives';
import { EMAIL_KEY } from './SignIn';

export function FinishSignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const started = useRef(false);

  const isLink = isSignInWithEmailLink(auth, window.location.href);
  // No saved email means the link was opened on a different device: ask for it.
  const [savedEmail] = useState(() => localStorage.getItem(EMAIL_KEY));
  const needEmail = isLink && !savedEmail;

  const EXPIRED = 'This link has expired or was already used. Request a new one.';

  /** Complete the email-link sign-in (an external system), then leave this page. */
  const finish = useCallback(
    async (address: string) => {
      await signInWithEmailLink(auth, address.trim().toLowerCase(), window.location.href);
      localStorage.removeItem(EMAIL_KEY);
      navigate('/', { replace: true });
    },
    [navigate],
  );

  useEffect(() => {
    if (!isLink || !savedEmail || started.current) return;
    started.current = true;
    finish(savedEmail).catch(() => setError(EXPIRED));
  }, [isLink, savedEmail, finish]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!isCompanyEmail(email)) {
      setError('Use the same work email you requested the link with.');
      return;
    }
    finish(email).catch(() => setError(EXPIRED));
  }

  return (
    <Screen>
      <Logo size="sm" />
      <Panel>
        {!isLink ? (
          <p>
            That doesn't look like a sign-in link.{' '}
            <Link className="text-gold underline" to="/signin">
              Get a new one
            </Link>
            .
          </p>
        ) : needEmail ? (
          <form onSubmit={submit} className="space-y-4">
            <p>Confirm your work email to finish signing in on this device.</p>
            <input
              type="email"
              required
              autoComplete="email"
              aria-label="Work email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl bg-felt-950/70 px-4 py-3 ring-1 ring-white/15 focus:ring-gold"
            />
            <ErrorText>{error}</ErrorText>
            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>
        ) : (
          <div className="space-y-3" aria-live="polite">
            <p>{error ? '' : 'Signing you in…'}</p>
            <ErrorText>{error}</ErrorText>
            {error && (
              <Link className="text-gold underline" to="/signin">
                Request a new link
              </Link>
            )}
          </div>
        )}
      </Panel>
    </Screen>
  );
}
