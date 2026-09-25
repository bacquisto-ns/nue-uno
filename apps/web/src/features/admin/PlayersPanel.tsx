import { DEFAULT_DEPARTMENTS } from '@nue-uno/shared';
import { collection, query } from 'firebase/firestore';
import { useMemo, useState, type ChangeEvent } from 'react';
import { ApiError } from '../../api/call';
import { eventApi } from '../../api/event';
import { db, useQuery } from '../../hooks/firestore';
import { Avatar } from '../../ui/Avatar';
import { Button, ErrorText, Panel } from '../../ui/primitives';
import { rosterFromCsv, type RosterCsvResult } from './rosterCsv';

interface UserRow {
  id: string;
  email: string;
  displayName?: string;
  avatarId?: string;
  avatarColor?: string;
  department?: string | null;
  attendingEvent?: 'yes' | 'no' | 'maybe';
  status?: 'pending' | 'active' | 'disabled';
  isAdmin?: boolean;
}

type Filter = 'all' | 'pending' | 'disabled' | 'offRoster';
type Attending = 'yes' | 'no' | 'maybe';

const STATUS_CLS: Record<string, string> = {
  active: 'bg-success text-white',
  pending: 'bg-gold text-felt-950',
  disabled: 'bg-alert text-white',
};

/**
 * Mission Control → Players (PRD AD1, A3): every account, approvals, moderation and the HR
 * roster import. Disabling is the main safeguard for password accounts (architecture ADR-3).
 */
export function PlayersPanel({ myUid }: { myUid: string }) {
  const users = useQuery<Omit<UserRow, 'id'>>(query(collection(db, 'users')), 'admin-users');
  const roster = useQuery<{ name: string }>(query(collection(db, 'roster')), 'admin-roster');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState('');
  const [editing, setEditing] = useState<{ uid: string; displayName: string; department: string; attendingEvent: Attending } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const rosterEmails = useMemo(() => new Set((roster.data ?? []).map((r) => r.id)), [roster.data]);
  const all = useMemo(() => ((users.data ?? []) as UserRow[]).sort((a, b) => (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email)), [users.data]);
  const registered = new Set(all.map((u) => u.email));
  const unregistered = [...rosterEmails].filter((e) => !registered.has(e)).length;
  const count = (s: string) => all.filter((u) => u.status === s).length;

  const q = search.trim().toLowerCase();
  const shown = all.filter((u) => {
    if (filter === 'pending' && u.status !== 'pending') return false;
    if (filter === 'disabled' && u.status !== 'disabled') return false;
    if (filter === 'offRoster' && rosterEmails.has(u.email)) return false;
    return !q || u.email.includes(q) || (u.displayName ?? '').toLowerCase().includes(q) || (u.department ?? '').toLowerCase().includes(q);
  });

  async function run(key: string, fn: () => Promise<unknown>, success: string) {
    setBusy(key);
    setError('');
    setOk('');
    try {
      await fn();
      setOk(success);
    } catch (e) {
      setError(e instanceof ApiError ? (e.hint ?? e.message) : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }
  const needReason = reason.trim().length < 3;

  return (
    <Panel className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-2xl font-extrabold">Players</h2>
        <span className="text-sm text-ink-muted">
          {all.length} accounts · {count('active')} active · {count('pending')} pending · {count('disabled')} disabled
          {rosterEmails.size > 0 && ` · roster ${rosterEmails.size} (${unregistered} not signed up yet)`}
        </span>
      </div>

      <RosterImport onDone={(msg) => setOk(msg)} />

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['all', 'All'],
            ['pending', `Pending (${count('pending')})`],
            ['disabled', 'Disabled'],
            ...(rosterEmails.size ? [['offRoster', 'Not on roster'] as const] : []),
          ] as const
        ).map(([f, label]) => (
          <Button key={f} variant={filter === f ? 'primary' : 'ghost'} className="py-1 text-sm" onClick={() => setFilter(f)}>
            {label}
          </Button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, department"
          aria-label="Search players"
          className="min-w-48 flex-1 rounded-lg bg-felt-950/70 px-3 py-1.5 text-sm ring-1 ring-white/15"
        />
      </div>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required to disable, enable or edit): e.g. 'not a real employee'"
        aria-label="Reason for changes"
        className="w-full rounded-lg bg-felt-950/70 px-3 py-2 text-sm ring-1 ring-white/15"
      />
      <ErrorText>{error}</ErrorText>
      {ok && (
        <p role="status" className="text-sm text-card-green">
          {ok}
        </p>
      )}

      <ul className="max-h-[28rem] space-y-1 overflow-y-auto pr-1">
        {shown.map((u) =>
          editing?.uid === u.id ? (
            <li key={u.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white/10 px-3 py-2">
              <input aria-label="Display name" value={editing.displayName} onChange={(e) => setEditing({ ...editing, displayName: e.target.value })} className="w-40 rounded bg-felt-950/70 px-2 py-1 text-sm ring-1 ring-white/15" />
              <input aria-label="Department" list="departments" value={editing.department} onChange={(e) => setEditing({ ...editing, department: e.target.value })} className="w-36 rounded bg-felt-950/70 px-2 py-1 text-sm ring-1 ring-white/15" />
              <select aria-label="Attending the event" value={editing.attendingEvent} onChange={(e) => setEditing({ ...editing, attendingEvent: e.target.value as Attending })} className="rounded bg-felt-950/70 px-2 py-1 text-sm ring-1 ring-white/15">
                <option value="yes">Attending</option>
                <option value="maybe">Maybe</option>
                <option value="no">Remote</option>
              </select>
              <Button
                className="py-1 text-sm"
                disabled={!!busy || needReason}
                title={needReason ? 'Enter a reason above first' : undefined}
                onClick={() =>
                  void run(
                    u.id,
                    async () => {
                      await eventApi.adminUpdateUser({
                        uid: u.id,
                        reason,
                        ...(editing.displayName !== u.displayName ? { displayName: editing.displayName } : {}),
                        department: editing.department || null,
                        attendingEvent: editing.attendingEvent,
                      });
                      setEditing(null);
                    },
                    `Saved ${editing.displayName}`,
                  )
                }
              >
                Save
              </Button>
              <Button variant="ghost" className="py-1 text-sm" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </li>
          ) : (
            <li key={u.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm">
              <Avatar avatarId={u.avatarId ?? 'fox'} color={u.avatarColor ?? 'teal'} size={28} label="" />
              <span className="w-36 truncate font-semibold">
                {u.displayName ?? '(no profile)'}
                {u.isAdmin && <span className="ml-1 text-xs text-gold">admin</span>}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink-muted">
                {u.email}
                {u.department ? ` · ${u.department}` : ''}
                {u.attendingEvent === 'no' ? ' · remote' : u.attendingEvent === 'maybe' ? ' · maybe' : ''}
                {rosterEmails.size > 0 && !rosterEmails.has(u.email) && <span className="text-gold"> · not on roster</span>}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_CLS[u.status ?? 'pending']}`}>{u.status ?? 'pending'}</span>
              {u.status === 'pending' && (
                <Button className="py-1 text-xs" disabled={!!busy} onClick={() => void run(u.id, () => eventApi.approveUser(u.id), `Approved ${u.displayName ?? u.email}`)}>
                  Approve
                </Button>
              )}
              <Button
                variant="ghost"
                className="py-1 text-xs"
                onClick={() => setEditing({ uid: u.id, displayName: u.displayName ?? '', department: u.department ?? '', attendingEvent: u.attendingEvent ?? 'maybe' })}
              >
                Edit
              </Button>
              {u.id !== myUid &&
                (u.status === 'disabled' ? (
                  <Button variant="ghost" className="py-1 text-xs" disabled={!!busy || needReason} title={needReason ? 'Enter a reason above first' : undefined}
                    onClick={() => void run(u.id, () => eventApi.adminUpdateUser({ uid: u.id, status: 'active', reason }), `Re-enabled ${u.displayName ?? u.email}`)}>
                    Enable
                  </Button>
                ) : (
                  <Button variant="ghost" className="py-1 text-xs text-alert-ink" disabled={!!busy || needReason} title={needReason ? 'Enter a reason above first' : undefined}
                    onClick={() => void run(u.id, () => eventApi.adminUpdateUser({ uid: u.id, status: 'disabled', reason }), `Disabled ${u.displayName ?? u.email}. They're signed out within the hour.`)}>
                    Disable
                  </Button>
                ))}
            </li>
          ),
        )}
        {shown.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">No matching accounts.</li>}
      </ul>
      <datalist id="departments">
        {DEFAULT_DEPARTMENTS.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
    </Panel>
  );
}

/** HR roster CSV upload (PRD A3): parsed in the browser, previewed, then sent to `importRoster`. */
function RosterImport({ onDone }: { onDone: (msg: string) => void }) {
  const [parsed, setParsed] = useState<(RosterCsvResult & { file: string }) | null>(null);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setParsed({ ...rosterFromCsv(await file.text()), file: file.name });
  }

  async function importNow() {
    if (!parsed?.rows.length) return;
    setBusy(true);
    setError('');
    try {
      const res = await eventApi.importRoster(parsed.rows, replace);
      onDone(`Roster imported: ${res.imported} people${res.activated ? `, ${res.activated} pending account(s) activated` : ''}.`);
      setParsed(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-xl bg-white/5 p-3 text-sm">
      <summary className="cursor-pointer font-semibold">📋 Import HR roster (CSV)</summary>
      <div className="mt-2 space-y-2">
        <p className="text-ink-muted">
          Columns: <code>Email</code>, <code>Name</code> (or First/Last name), <code>Department</code>, optional <code>Office</code>. The file stays on this computer; only the rows are sent. Pending accounts on the roster are activated.
        </p>
        <input type="file" accept=".csv,text/csv" onChange={(e) => void pick(e)} aria-label="Roster CSV file" className="text-sm" />
        {parsed && (
          <div className="space-y-2">
            <p>
              <strong>{parsed.file}</strong>: {parsed.rows.length} people ready
              {parsed.errors.length > 0 && <span className="text-gold">, {parsed.errors.length} skipped</span>}
            </p>
            {parsed.errors.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-ink-muted">
                {parsed.errors.slice(0, 8).map((m) => (
                  <li key={m}>{m}</li>
                ))}
                {parsed.errors.length > 8 && <li>…and {parsed.errors.length - 8} more</li>}
              </ul>
            )}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
              Replace the whole roster (removes people not in this file)
            </label>
            <Button className="py-1 text-sm" disabled={busy || parsed.rows.length === 0} onClick={() => void importNow()}>
              {busy ? 'Importing…' : `Import ${parsed.rows.length} people`}
            </Button>
          </div>
        )}
        <ErrorText>{error}</ErrorText>
      </div>
    </details>
  );
}
