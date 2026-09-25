import { useActiveBracket, useDirectory } from '../../hooks/bracket';

/**
 * /admin/print — the paper fallback (PRD AD9): the bracket on one page, then a score sheet per
 * table. If the Wi-Fi dies, tables play with real cards, write down the finishing order, and an
 * organizer enters it later with Mission Control's Override (reason: "paper game").
 */
export function PrintBracket() {
  const { bracket, matches, season } = useActiveBracket();
  const directory = useDirectory();
  const name = (uid: string | null) => (uid ? (directory[uid]?.displayName ?? 'Player') : '');

  if (!bracket) return <main className="p-8">No bracket yet. Generate and lock one in Mission Control first.</main>;
  const seedOf = Object.fromEntries(bracket.seeds.map((s) => [s.uid, s.seed]));

  return (
    <main className="bg-white text-felt-950">
      <style>{'@media print { .no-print { display: none } .page { break-after: page; } body { background: #fff } @page { margin: 12mm } }'}</style>
      <div className="no-print flex items-center gap-3 p-4">
        <button className="rounded bg-felt-900 px-4 py-2 font-bold text-white" onClick={() => window.print()}>
          Print
        </button>
        <span className="text-sm">The bracket prints on page 1, then one score sheet per table.</span>
      </div>

      <section className="page p-6">
        <h1 className="font-display text-3xl font-extrabold">
          Nue Uno · {season.id} bracket <span className="text-base font-normal">({bracket.status})</span>
        </h1>
        <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: `repeat(${bracket.rounds.length}, minmax(0, 1fr))` }}>
          {bracket.rounds.map((r) => (
            <div key={r.number} className="flex flex-col justify-around gap-3">
              <h2 className="font-display text-lg font-extrabold">{r.name}</h2>
              {r.matchIds.map((id) => {
                const mt = matches[id];
                if (!mt) return null;
                return (
                  <div key={id} className="rounded border-2 border-felt-950 p-2 text-sm">
                    <p className="font-bold">
                      Table {mt.physicalTable} <span className="font-normal">({id}{mt.gamesToPlay > 1 ? `, ${mt.gamesToPlay} games` : ''})</span>
                    </p>
                    {mt.slots.map((u, i) => (
                      <p key={i} className="flex h-6 items-end gap-2 border-b border-dotted border-felt-950/40">
                        <span className="w-6 text-xs">{u && seedOf[u] ? `#${seedOf[u]}` : ''}</span>
                        <span className={mt.advancing.includes(u ?? '') ? 'font-bold' : ''}>{name(u)}</span>
                      </p>
                    ))}
                    <p className="mt-1 text-xs">Top 2 advance{mt.advancing.length ? ` · advanced: ${mt.advancing.map(name).join(', ')}` : ''}</p>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {bracket.rounds.flatMap((r) =>
        r.matchIds.map((id) => {
          const mt = matches[id];
          if (!mt) return null;
          const games = Math.max(1, mt.gamesToPlay);
          return (
            <section key={`sheet-${id}`} className="page p-6">
              <h2 className="font-display text-3xl font-extrabold">
                Score sheet · {r.name} · Table {mt.physicalTable}
              </h2>
              <p className="mt-1 text-sm">
                Write each player's finishing place (1 = went out first). {games > 1 ? `The Final is scored by points per game (${mt.slots.length === 3 ? '1st 8 · 2nd 4 · 3rd 1' : '1st 10 · 2nd 6 · 3rd 3 · 4th 1'}); most points wins.` : 'Top 2 advance.'}
              </p>
              <table className="mt-4 w-full border-collapse text-lg">
                <thead>
                  <tr>
                    <th className="border-2 border-felt-950 p-2 text-left">Player</th>
                    {Array.from({ length: games }, (_, g) => (
                      <th key={g} className="border-2 border-felt-950 p-2">Game {g + 1} place</th>
                    ))}
                    {games > 1 && <th className="border-2 border-felt-950 p-2">Points</th>}
                    <th className="border-2 border-felt-950 p-2">Initials</th>
                  </tr>
                </thead>
                <tbody>
                  {mt.slots.map((u, i) => (
                    <tr key={i}>
                      <td className="h-14 border-2 border-felt-950 p-2">{name(u) || '________________'}</td>
                      {Array.from({ length: games }, (_, g) => (
                        <td key={g} className="border-2 border-felt-950" />
                      ))}
                      {games > 1 && <td className="border-2 border-felt-950" />}
                      <td className="border-2 border-felt-950" />
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-6 text-sm">Organizer: enter this in Mission Control → {id} → Override, with the reason "paper game".</p>
              <p className="mt-8 text-sm">Organizer signature: ______________________ Time: ________</p>
            </section>
          );
        }),
      )}
    </main>
  );
}
