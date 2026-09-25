import { collection, limit, orderBy, query, where, type Timestamp } from 'firebase/firestore';
import { AnimatePresence, m } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { call } from '../../api/call';
import { useSession } from '../../auth/session';
import { db, useQuery } from '../../hooks/firestore';
import { spring } from '../../motion/tokens';

interface InboxItem {
  type: string;
  title: string;
  body: string;
  link?: string;
  takeover?: boolean;
  expiresAt?: Timestamp;
}

interface Announcement {
  text: string;
  level: 'info' | 'urgent';
  expiresAt?: Timestamp;
}

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

/**
 * Global live layer for signed-in screens: announcement banners (AD7 / Uno Hours) and inbox items
 * such as "table forming" nudges (L7) and takeovers (N3).
 */
export function LiveOverlays() {
  const uid = useSession((s) => s.user!.uid);
  const navigate = useNavigate();
  const now = useNow(15_000);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const inbox = useQuery<InboxItem>(
    query(collection(db, `inbox/${uid}/items`), where('seenAt', '==', null), orderBy('createdAt', 'desc'), limit(5)),
    `inbox-${uid}`,
  );
  const banners = useQuery<Announcement>(
    query(collection(db, 'announcements'), where('active', '==', true), orderBy('createdAt', 'desc'), limit(3)),
    'announcements',
  );

  const live = <T extends { expiresAt?: Timestamp }>(x: T) => !x.expiresAt || x.expiresAt.toMillis() > now;
  const items = (inbox.data ?? []).filter(live).filter((i) => !dismissed.has(i.id));
  const banner = (banners.data ?? []).filter(live)[0];

  function seen(id: string) {
    setDismissed((d) => new Set(d).add(id));
    void call('markInboxSeen', { itemIds: [id] }).catch(() => undefined);
  }

  const takeover = items.find((i) => i.takeover);

  return (
    <>
      <AnimatePresence>
        {banner && (
          <m.div
            key={banner.id}
            initial={{ y: -60 }}
            animate={{ y: 0 }}
            exit={{ y: -60 }}
            transition={spring.soft}
            role="status"
            className={`fixed inset-x-0 top-0 z-50 px-4 py-2 text-center text-sm font-semibold shadow-lg ${banner.level === 'urgent' ? 'bg-alert text-white' : 'bg-gold text-felt-950'}`}
          >
            {banner.text}
          </m.div>
        )}
      </AnimatePresence>

      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        <AnimatePresence>
          {items.filter((i) => !i.takeover).map((item) => (
            <m.div
              key={item.id}
              layout
              initial={{ x: 120, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 120, opacity: 0 }}
              transition={spring.snappy}
              className="pointer-events-auto rounded-2xl bg-felt-900/95 p-4 shadow-2xl ring-1 ring-gold/40"
              role="alert"
            >
              <p className="font-semibold">{item.title}</p>
              <p className="mt-1 text-sm text-ink-muted">{item.body}</p>
              <div className="mt-3 flex gap-2">
                {item.link && (
                  <button
                    className="rounded-lg bg-gold px-3 py-1.5 text-sm font-bold text-felt-950"
                    onClick={() => {
                      seen(item.id);
                      navigate(item.link!);
                    }}
                  >
                    Join
                  </button>
                )}
                <button className="rounded-lg px-3 py-1.5 text-sm text-ink-muted hover:text-ink" onClick={() => seen(item.id)}>
                  Dismiss
                </button>
              </div>
            </m.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {takeover && (
          <m.div
            key={takeover.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] grid place-items-center bg-felt-950/90 p-6 text-center backdrop-blur"
            role="alertdialog"
            aria-modal
          >
            <m.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={spring.bouncy} className="space-y-4">
              <p className="font-display text-5xl font-extrabold text-gold">{takeover.title}</p>
              <p className="text-lg">{takeover.body}</p>
              <div className="flex justify-center gap-3">
                {takeover.link && (
                  <button className="rounded-xl bg-gold px-6 py-3 text-lg font-bold text-felt-950" onClick={() => { seen(takeover.id); navigate(takeover.link!); }}>
                    Let's go
                  </button>
                )}
                <button className="rounded-xl px-6 py-3 text-ink-muted" onClick={() => seen(takeover.id)}>Close</button>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
