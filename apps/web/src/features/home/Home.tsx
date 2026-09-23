import { Link } from 'react-router';
import { signOutEverywhere, useSession } from '../../auth/session';
import { Avatar } from '../../ui/Avatar';
import { Button, Logo, Panel } from '../../ui/primitives';

/** Home shell. The live lobby (tables, Quick Match, Uno Hours) lands in Week 2 — delivery plan. */
export function Home() {
  const { profile, claims } = useSession();
  if (!profile) return null;
  return (
    <main className="felt-grain mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between">
        <Logo size="sm" />
        <Link to="/profile" className="flex items-center gap-3 rounded-full bg-white/5 py-1 pl-1 pr-4 ring-1 ring-white/10">
          <Avatar avatarId={profile.avatarId} color={profile.avatarColor} size={40} label={profile.displayName} />
          <span className="font-semibold">{profile.displayName}</span>
        </Link>
      </header>

      <Panel className="text-center">
        <p className="font-display text-3xl font-extrabold">You're in! 🎉</p>
        <p className="mt-2 text-ink-muted">
          Tables open soon. Qualifiers start <strong className="text-ink">Oct 14</strong> — practice
          games and the tutorial arrive first.
        </p>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/profile">
          <Button variant="ghost" className="w-full">Edit profile &amp; effects</Button>
        </Link>
        {(import.meta.env.DEV || claims.admin) && (
          <Link to="/dev/effects">
            <Button variant="ghost" className="w-full">Effects gallery ✨</Button>
          </Link>
        )}
        <Button variant="ghost" onClick={() => void signOutEverywhere()}>
          Sign out
        </Button>
      </div>
    </main>
  );
}
