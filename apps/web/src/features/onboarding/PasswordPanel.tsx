import { EmailAuthProvider, linkWithCredential, updatePassword } from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { authMessage, MIN_PASSWORD } from '../../auth/SignIn';
import { auth } from '../../firebase';
import { Button, ErrorText, Panel } from '../../ui/primitives';

/**
 * Set or change the account password (ADR-3). Accounts made with an email link have no password
 * yet: linking one lets them sign in with a password next time, even if emails get filtered.
 */
export function PasswordPanel() {
  const current = auth.currentUser;
  const hasPassword = !!current?.providerData.some((p) => p.providerId === 'password');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!current?.email) return;
    if (password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      // Email-link users already show the "password" provider; updatePassword works for both.
      if (hasPassword) await updatePassword(current, password);
      else await linkWithCredential(current, EmailAuthProvider.credential(current.email, password));
      setPassword('');
      setDone(true);
    } catch (err) {
      const code = (err as { code?: string }).code;
      console.error('set password failed', err);
      setError(code === 'auth/requires-recent-login' ? 'For security, sign out and back in, then set your password.' : authMessage(code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <form onSubmit={submit} className="space-y-3">
        <p className="font-display text-xl font-extrabold">Password</p>
        <p className="text-sm text-ink-muted">Set a password to sign in without waiting for an email.</p>
        <label className="block text-sm font-medium" htmlFor="new-password">
          New password ({MIN_PASSWORD}+ characters)
        </label>
        {/* Lets password managers file the new password under the right account. */}
        <input type="email" autoComplete="username" value={current?.email ?? ''} readOnly hidden />
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
          required
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setDone(false);
          }}
          className="w-full rounded-xl bg-felt-950/70 px-4 py-3 ring-1 ring-white/15 focus:ring-gold"
        />
        <ErrorText>{error}</ErrorText>
        {done && (
          <p role="status" className="text-sm text-card-green">
            ✓ Password saved. Next time, sign in with your email and this password.
          </p>
        )}
        <Button type="submit" variant="ghost" className="w-full" disabled={busy}>
          {busy ? 'Saving…' : 'Save password'}
        </Button>
      </form>
    </Panel>
  );
}
