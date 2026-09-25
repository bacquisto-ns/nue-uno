import { m } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../../api/call';
import { eventApi } from '../../api/event';
import { spring } from '../../motion/tokens';
import { Logo, Panel, Screen } from '../../ui/primitives';

/**
 * /table/:n — the QR code on each physical table sign (PRD E3). Scanning checks you in to your
 * match at that table; when everyone is in, the game deals and we jump straight to it.
 */
export function TableCheckIn() {
  const { n = '0' } = useParams();
  const table = Number(n);
  const navigate = useNavigate();
  const [state, setState] = useState<{ kind: 'working' | 'waiting' | 'error'; text: string }>({ kind: 'working', text: 'Checking you in…' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    eventApi
      .checkInAtTable(table)
      .then((res) => {
        if (res.gameId) navigate(`/t/${res.gameId}`, { replace: true });
        else setState({ kind: 'waiting', text: "You're checked in! The game starts as soon as everyone at this table is here." });
      })
      .catch((err) =>
        setState({ kind: 'error', text: err instanceof ApiError ? (err.hint ?? err.message) : 'Could not check in — try again.' }),
      );
  }, [navigate, table]);

  return (
    <Screen>
      <Logo size="sm" />
      <m.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.bouncy}>
        <Panel className="space-y-3 text-center">
          <p className="font-display text-5xl font-extrabold">Table {table}</p>
          <p className={state.kind === 'error' ? 'text-red-200' : state.kind === 'waiting' ? 'text-card-green' : 'text-ink-muted'} aria-live="polite">
            {state.kind === 'waiting' ? '✓ ' : ''}{state.text}
          </p>
          <Link to="/" className="inline-block text-gold underline">Back to the Event Hub</Link>
        </Panel>
      </m.div>
    </Screen>
  );
}
