import { collection, limit, query } from 'firebase/firestore';
import { db, useQuery } from '../../hooks/firestore';
import { useOnlineUsers, usePresence, type Activity } from '../../hooks/presence';
import { Avatar } from '../../ui/Avatar';

/** Renders nothing — just keeps this device's presence up to date (ADR-6). */
export function PresenceBeacon({ activity, gameId }: { activity: Activity; gameId?: string }) {
  usePresence(activity, gameId);
  return null;
}

/** PRD L6: who's online right now, from RTDB presence. */
export function OnlineNow({ myUid }: { myUid: string }) {
  const online = useOnlineUsers();
  const users = useQuery<{ displayName: string; avatarId: string; avatarColor: string }>(
    query(collection(db, 'users'), limit(500)),
    'users-directory',
  );
  const byId = Object.fromEntries((users.data ?? []).map((u) => [u.id, u]));
  const others = online.filter((o) => o.uid !== myUid && byId[o.uid]);
  const playing = others.filter((o) => o.activity === 'game').length;
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10" aria-label="Online now">
      <span className="relative flex h-3 w-3" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-card-green opacity-60" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-card-green" />
      </span>
      <p className="text-sm font-semibold">
        {others.length === 0 ? 'Just you right now' : `${others.length} online${playing ? ` · ${playing} in a game` : ''}`}
      </p>
      <div className="ml-auto flex -space-x-2">
        {others.slice(0, 8).map((o) => (
          <span key={o.uid} title={`${byId[o.uid]!.displayName}${o.activity === 'game' ? ' (playing)' : ''}`} className={o.activity === 'game' ? 'opacity-60' : ''}>
            <Avatar avatarId={byId[o.uid]!.avatarId} color={byId[o.uid]!.avatarColor} size={30} label={byId[o.uid]!.displayName} />
          </span>
        ))}
      </div>
    </div>
  );
}
