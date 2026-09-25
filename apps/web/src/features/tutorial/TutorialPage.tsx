import { AnimatePresence, m } from 'framer-motion';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { call } from '../../api/call';
import { useSession } from '../../auth/session';
import type { TableViewModel } from '../../game/view';
import { spring } from '../../motion/tokens';
import { Button, Panel, Screen } from '../../ui/primitives';
import { LocalTable } from '../practice/PracticeGame';
import { coachTip, LESSON_LABEL, LESSONS, lessonDone, TUTORIAL_BOT, TUTORIAL_HAND_SIZE, tutorialDeck, type Lesson } from './lessons';

const COACH = [{ uid: TUTORIAL_BOT, displayName: 'Coach', avatarId: 'owl', avatarColor: 'amber' }];

/** /tutorial — PRD O2: a ~2 minute guided game. Offered after first-run setup; skippable. */
export function TutorialPage() {
  const navigate = useNavigate();
  const profile = useSession((s) => s.profile);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState<Set<Lesson>>(new Set());
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const deck = useMemo(() => tutorialDeck(), []);
  const recorded = useRef(false);

  // Finishing the game (win or lose) completes the tutorial and earns the Passport stamp.
  const finish = useCallback(() => {
    if (recorded.current || !profile) return;
    recorded.current = true;
    setSaved('saving');
    call('saveProfile', {
      displayName: profile.displayName,
      avatarId: profile.avatarId,
      avatarColor: profile.avatarColor,
      department: profile.department,
      attendingEvent: profile.attendingEvent,
      tutorialDone: true,
    })
      .then(() => setSaved('saved'))
      .catch(() => {
        recorded.current = false;
        setSaved('failed');
      });
  }, [profile]);

  const onEvents = useCallback((events: { type: string; uid?: string; card?: { value: string; color: string } }[]) => {
    const learned = events.map(lessonDone).filter((l): l is Lesson => !!l);
    if (learned.length) setDone((cur) => (learned.every((l) => cur.has(l)) ? cur : new Set([...cur, ...learned])));
    if (events.some((e) => e.type === 'game_finished')) finish();
  }, [finish]);

  const overlay = useCallback(
    (view: TableViewModel) => {
      const tip = coachTip(view, done);
      return (
        <aside className="pointer-events-none fixed inset-x-0 top-[7.25rem] z-20 flex justify-center px-3" aria-live="polite">
          <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-felt-900/95 px-3 py-2 shadow-2xl ring-1 ring-gold/40">
            <div className="flex items-start gap-3">
              <span className="text-2xl" aria-hidden>🦉</span>
              <AnimatePresence mode="wait">
                <m.p key={tip.text} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring.snappy} className="flex-1 text-sm font-medium">
                  {tip.text}
                </m.p>
              </AnimatePresence>
            </div>
            <ul className="mt-1.5 flex flex-wrap gap-1 text-[10px] font-semibold" aria-label="Lessons">
              {LESSONS.map((l) => (
                <li
                  key={l}
                  className={`rounded-full px-2 py-0.5 ${done.has(l) ? 'bg-card-green/80 text-felt-950' : tip.lesson === l ? 'bg-gold text-felt-950' : 'bg-white/10 text-ink-muted'}`}
                >
                  {done.has(l) ? '✓ ' : ''}
                  {LESSON_LABEL[l]}
                </li>
              ))}
            </ul>
            {view.status === 'finished' && (
              <p className="mt-2 text-xs text-ink-muted">
                {saved === 'saved' ? '🛂 Tutorial stamp added to your Passport!' : saved === 'failed' ? "Couldn't save your stamp. Check your connection." : 'Saving your Passport stamp…'}
              </p>
            )}
          </div>
        </aside>
      );
    },
    [done, saved],
  );

  if (!started) {
    return (
      <Screen>
        <Link to="/" className="text-ink-muted hover:text-ink">← Skip for now</Link>
        <Panel className="space-y-4 text-center">
          <p className="text-5xl" aria-hidden>🦉</p>
          <p className="font-display text-3xl font-extrabold">Learn Uno in 2 minutes</p>
          <p className="text-ink-muted">
            Play a quick game against Coach, who'll explain each move as it comes up: matching, action cards, Wilds, drawing, and calling UNO. Finish it for a Passport stamp.
          </p>
          <Button className="w-full py-3 text-lg" onClick={() => setStarted(true)}>Start the tutorial</Button>
          {profile?.tutorialDone && <p className="text-xs text-card-green">✓ You've already finished it. Replay any time.</p>}
        </Panel>
      </Screen>
    );
  }
  return (
    <LocalTable
      bots={COACH}
      setup={{ deck, handSize: TUTORIAL_HAND_SIZE, dealerIndex: 1, botLevel: 'tutorial' }}
      onEvents={onEvents}
      overlay={overlay}
      onLeave={() => navigate('/')}
      exitTo="/"
    />
  );
}
