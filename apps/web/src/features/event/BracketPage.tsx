import { Link } from 'react-router';
import { useSession } from '../../auth/session';
import { useActiveBracket, useDirectory } from '../../hooks/bracket';
import { Panel } from '../../ui/primitives';
import { LiveOverlays } from '../live/LiveOverlays';
import { BracketBoard } from './BracketBoard';

export function BracketPage() {
  const uid = useSession((s) => s.user!.uid);
  const { bracket, matches, loading } = useActiveBracket();
  const directory = useDirectory();
  return (
    <main className="felt-grain mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-5 px-4 py-6">
      <LiveOverlays />
      <Link to="/" className="text-ink-muted hover:text-ink">← Home</Link>
      <h1 className="font-display text-4xl font-extrabold">Bracket</h1>
      {loading ? (
        <p className="text-ink-muted">Loading…</p>
      ) : bracket && bracket.status !== 'draft' ? (
        <div className="overflow-x-auto pb-4">
          <div className="min-w-[720px]">
            <BracketBoard bracket={bracket} matches={matches} directory={directory} highlightUid={uid} />
          </div>
        </div>
      ) : (
        <Panel>The bracket is revealed at the Selection Show on event morning.</Panel>
      )}
    </main>
  );
}
