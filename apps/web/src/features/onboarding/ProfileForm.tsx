import {
  AVATAR_COLORS,
  AVATARS,
  DEFAULT_DEPARTMENTS,
  SaveProfileInput,
  type AvatarColor,
  type AvatarId,
} from '@nue-uno/shared';
import { m } from 'framer-motion';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, call } from '../../api/call';
import { refreshClaims, useSession, type UserProfile } from '../../auth/session';
import type { EffectsMode } from '../../motion/effectsMode';
import { spring } from '../../motion/tokens';
import { AVATAR_COLOR_VALUES, Avatar } from '../../ui/Avatar';
import { Button, ErrorText, Logo, Panel, Screen } from '../../ui/primitives';
import { PasswordPanel } from './PasswordPanel';

function suggestName(email: string | null | undefined): string {
  const local = (email ?? '').split('@')[0] ?? '';
  const first = local.split(/[._-]/)[0] ?? '';
  return first ? first[0]!.toUpperCase() + first.slice(1) : '';
}

/** First-run setup (PRD A4) and profile/settings editing (A5, A6). */
export function ProfileForm({ mode }: { mode: 'welcome' | 'edit' }) {
  const navigate = useNavigate();
  const { user, profile } = useSession();
  const existing = profile ?? undefined;

  const [displayName, setDisplayName] = useState(existing?.displayName ?? suggestName(user?.email));
  const [avatarId, setAvatarId] = useState<AvatarId>((existing?.avatarId as AvatarId) ?? 'fox');
  const [avatarColor, setAvatarColor] = useState<AvatarColor>(
    (existing?.avatarColor as AvatarColor) ?? 'teal',
  );
  const [department, setDepartment] = useState(existing?.department ?? '');
  const [attendingEvent, setAttending] = useState<UserProfile['attendingEvent']>(
    existing?.attendingEvent ?? 'yes',
  );
  const [effects, setEffects] = useState<EffectsMode>(existing?.settings?.effects ?? 'full');
  const [sound, setSound] = useState(existing?.settings?.sound ?? false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const input = {
      displayName,
      avatarId,
      avatarColor,
      department: department || undefined,
      attendingEvent,
      settings: { effects, sound },
    };
    const parsed = SaveProfileInput.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the form');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await call<SaveProfileInput, { ok: true; status: string }>('saveProfile', parsed.data);
      if (res.status === 'active') await refreshClaims();
      // First run: offer the 2-minute tutorial (PRD O2). It has a "Skip for now" link.
      navigate(mode === 'welcome' && res.status === 'active' ? '/tutorial' : '/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      {mode === 'welcome' ? (
        <div className="space-y-2 text-center">
          <Logo size="sm" />
          <p className="font-display text-3xl font-extrabold">Welcome to the table 👋</p>
          <p className="text-ink-muted">Set up your player card — it takes 30 seconds.</p>
        </div>
      ) : (
        <p className="font-display text-3xl font-extrabold">Your profile</p>
      )}

      <Panel>
        <form onSubmit={submit} className="space-y-6">
          <m.div
            className="flex justify-center"
            key={`${avatarId}-${avatarColor}`}
            initial={{ scale: 0.8, rotate: -6 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={spring.bouncy}
          >
            <Avatar avatarId={avatarId} color={avatarColor} size={88} label={displayName || 'You'} />
          </m.div>

          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              Display name
            </label>
            <input
              id="name"
              required
              maxLength={24}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-xl bg-felt-950/70 px-4 py-3 text-lg ring-1 ring-white/15 focus:ring-gold"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Avatar</legend>
            <div className="grid grid-cols-6 gap-2">
              {AVATARS.map((a) => (
                <button
                  type="button"
                  key={a}
                  aria-label={a}
                  aria-pressed={a === avatarId}
                  onClick={() => setAvatarId(a)}
                  className={`rounded-full p-0.5 transition ${a === avatarId ? 'ring-2 ring-gold' : 'opacity-70 hover:opacity-100'}`}
                >
                  <Avatar avatarId={a} color={avatarColor} size={44} label="" />
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 pt-1" role="radiogroup" aria-label="Avatar color">
              {AVATAR_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  role="radio"
                  aria-checked={c === avatarColor}
                  aria-label={c}
                  onClick={() => setAvatarColor(c)}
                  className={`h-8 w-8 rounded-full ring-offset-2 ring-offset-felt-900 ${c === avatarColor ? 'ring-2 ring-gold' : ''}`}
                  style={{ background: AVATAR_COLOR_VALUES[c] }}
                />
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <label htmlFor="dept" className="text-sm font-medium">
              Department
            </label>
            <select
              id="dept"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full rounded-xl bg-felt-950/70 px-4 py-3 ring-1 ring-white/15 focus:ring-gold"
            >
              <option value="">Choose…</option>
              {DEFAULT_DEPARTMENTS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Will you be at the in-office event?</legend>
            <div className="grid grid-cols-3 gap-2">
              {(['yes', 'maybe', 'no'] as const).map((v) => (
                <button
                  type="button"
                  key={v}
                  aria-pressed={attendingEvent === v}
                  onClick={() => setAttending(v)}
                  className={`min-h-11 rounded-xl capitalize ring-1 ${attendingEvent === v ? 'bg-gold text-felt-950 ring-gold' : 'ring-white/15'}`}
                >
                  {v === 'maybe' ? 'Not sure' : v}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-muted">Only in-office players can be seeded into the bracket.</p>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Effects &amp; sound</legend>
            <div className="grid grid-cols-3 gap-2">
              {(['full', 'reduced', 'off'] as const).map((v) => (
                <button
                  type="button"
                  key={v}
                  aria-pressed={effects === v}
                  onClick={() => setEffects(v)}
                  className={`min-h-11 rounded-xl capitalize ring-1 ${effects === v ? 'bg-white/15 ring-gold' : 'ring-white/15'}`}
                >
                  {v}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-3 pt-1">
              <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} className="h-5 w-5 accent-[var(--color-gold)]" />
              Sound effects
            </label>
          </fieldset>

          <ErrorText>{error}</ErrorText>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Saving…' : mode === 'welcome' ? "Let's play" : 'Save'}
          </Button>
        </form>
      </Panel>
      {mode === 'edit' && <PasswordPanel />}
    </Screen>
  );
}
