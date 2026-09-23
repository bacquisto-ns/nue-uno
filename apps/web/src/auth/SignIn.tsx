import { COMPANY_DOMAIN, isCompanyEmail } from '@nue-uno/shared';
import { sendSignInLinkToEmail } from 'firebase/auth';
import { m } from 'framer-motion';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { auth, usingEmulators } from '../firebase';
import { spring } from '../motion/tokens';
import { Card } from '../ui/Card';
import { Button, ErrorText, Logo, Panel, Screen } from '../ui/primitives';
import { useSession } from './session';

export const EMAIL_KEY = 'nueUno.emailForSignIn';

const HERO = [
  { id: 'h1', color: 'red', value: '7' },
  { id: 'h2', color: 'wild', value: 'wild' },
  { id: 'h3', color: 'blue', value: 'reverse' },
] as const;

export function SignIn() {
  const user = useSession((s) => s.user);
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!isCompanyEmail(clean)) {
      setError(`Use your @${COMPANY_DOMAIN} work email.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await sendSignInLinkToEmail(auth, clean, {
        url: `${window.location.origin}/auth/finish`,
        handleCodeInApp: true,
      });
      localStorage.setItem(EMAIL_KEY, clean);
      setSentTo(clean);
    } catch {
      setError("We couldn't send the link. Check the address and try again.");
    } finally {
      setBusy(false);
    }
  }

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
              this device to jump straight in.
            </p>
            {usingEmulators && (
              <p className="text-xs text-ink-muted">
                Emulator mode: find the link in the Emulator UI → Authentication.
              </p>
            )}
            <Button variant="ghost" onClick={() => setSentTo(null)}>
              Use a different email
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-left text-sm font-medium" htmlFor="email">
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
              className="w-full rounded-xl bg-felt-950/70 px-4 py-3 text-lg ring-1 ring-white/15 placeholder:text-ink-muted/60 focus:ring-gold"
            />
            <ErrorText>{error}</ErrorText>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Sending…' : 'Email me a sign-in link'}
            </Button>
            <p className="text-center text-xs text-ink-muted">No password needed.</p>
          </form>
        )}
      </Panel>
    </Screen>
  );
}
