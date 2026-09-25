import { DEFAULT_DEPARTMENTS, PASSPORT_MILESTONES } from '@nue-uno/shared';
import { collection, limit, query } from 'firebase/firestore';
import { m } from 'framer-motion';
import { Link } from 'react-router';
import { useSession } from '../../auth/session';
import { db, useDoc, useQuery } from '../../hooks/firestore';
import { useEffectsMode } from '../../motion/effectsMode';
import { spring, stagger } from '../../motion/tokens';
import { Avatar } from '../../ui/Avatar';
import { Panel } from '../../ui/primitives';
import { LiveOverlays } from '../live/LiveOverlays';

interface PassportDoc {
  opponents: Record<string, { department: string | null; firstAtMs: number; games: number }>;
  departments: Record<string, number>;
  distinctCoworkers: number;
  crossDeptPairs: number;
  milestones: string[];
}

interface UserDoc {
  displayName: string;
  avatarId: string;
  avatarColor: string;
  department: string | null;
}

/** Connection Passport (PRD C1): a stamp for every coworker and department you've played. */
export function PassportPage() {
  const uid = useSession((s) => s.user!.uid);
  const myDept = useSession((s) => s.profile?.department ?? null);
  const full = useEffectsMode() === 'full';
  const passport = useDoc<PassportDoc>(`passport/${uid}`);
  const config = useDoc<{ departments?: string[] }>('config/app');
  const users = useQuery<UserDoc>(query(collection(db, 'users'), limit(500)), 'users-directory');
  const byId = Object.fromEntries((users.data ?? []).map((u) => [u.id, u]));

  const p = passport.data ?? { opponents: {}, departments: {}, distinctCoworkers: 0, crossDeptPairs: 0, milestones: [] };
  const departments = (config.data?.departments ?? [...DEFAULT_DEPARTMENTS]).filter((d) => d !== 'Other');
  const stamps = Object.entries(p.opponents).sort((a, b) => a[1].firstAtMs - b[1].firstAtMs);
  const unmet = (users.data ?? []).filter((u) => u.id !== uid && !p.opponents[u.id]);
  const nextMilestone = PASSPORT_MILESTONES.find((n) => p.distinctCoworkers < n);

  return (
    <main className="felt-grain mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <LiveOverlays />
      <Link to="/" className="text-ink-muted hover:text-ink">← Lobby</Link>
      <h1 className="font-display text-4xl font-extrabold">Connection Passport 🛂</h1>

      <Panel className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-muted">Coworkers met</p>
          <p className="font-display text-4xl font-extrabold">{p.distinctCoworkers}</p>
          <p className="text-xs text-ink-muted">{nextMilestone ? `${nextMilestone - p.distinctCoworkers} to the ${nextMilestone} stamp` : 'All coworker milestones!'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-muted">From other teams</p>
          <p className="font-display text-4xl font-extrabold">{p.crossDeptPairs}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-muted">Milestones</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {[...PASSPORT_MILESTONES.map((n) => `coworkers_${n}`), 'all_departments'].map((key) => (
              <span key={key} className={`rounded-full px-2 py-0.5 text-xs font-bold ${p.milestones.includes(key) ? 'bg-gold text-felt-950' : 'bg-white/10 text-ink-muted'}`}>
                {key === 'all_departments' ? 'Every dept' : key.replace('coworkers_', '') + ' met'}
              </span>
            ))}
          </div>
        </div>
      </Panel>

      <section className="space-y-3">
        <h2 className="font-display text-2xl font-extrabold">Departments</h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {departments.map((d) => {
            const done = !!p.departments[d] || d === myDept;
            return (
              <li key={d} className={`rounded-xl px-3 py-2 text-sm font-semibold ring-1 ${done ? 'bg-card-green/20 ring-card-green/60' : 'bg-white/5 ring-white/10 text-ink-muted'}`}>
                {done ? '✅' : '⬜'} {d}{d === myDept ? ' (you)' : ''}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl font-extrabold">Stamps</h2>
        {stamps.length === 0 ? (
          <Panel>Play a game with anyone to earn your first stamp.</Panel>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stamps.map(([id, o], i) => {
              const u = byId[id];
              return (
                <m.li
                  key={id}
                  initial={full ? { scale: 1.6, rotate: -12, opacity: 0 } : false}
                  animate={{ scale: 1, rotate: (i % 3) - 1, opacity: 1 }}
                  transition={{ ...spring.bouncy, delay: Math.min(i, 12) * stagger.list }}
                  className="flex flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-gold/50 bg-felt-900/80 p-3 text-center"
                >
                  <Avatar avatarId={u?.avatarId ?? 'fox'} color={u?.avatarColor ?? 'teal'} size={44} label="" />
                  <p className="w-full truncate font-semibold">{u?.displayName ?? 'Coworker'}</p>
                  <p className="text-xs text-ink-muted">{o.department ?? '—'} · {o.games} game{o.games === 1 ? '' : 's'}</p>
                </m.li>
              );
            })}
          </ul>
        )}
      </section>

      {unmet.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-2xl font-extrabold">Haven't played yet</h2>
          <p className="text-sm text-ink-muted">Quick Match prefers tables with people you haven't met.</p>
          <div className="flex flex-wrap gap-2">
            {unmet.slice(0, 24).map((u) => (
              <span key={u.id} className="flex items-center gap-2 rounded-full bg-white/5 py-1 pl-1 pr-3 text-sm ring-1 ring-white/10">
                <Avatar avatarId={u.avatarId} color={u.avatarColor} size={24} label="" />
                {u.displayName}
              </span>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
