import { Fragment, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAdminStatus } from '../api/hooks.js';
import { CardGrid, EmptyState, LiveDot, ProgressBar } from '../components/grids.js';
import { Histogram, WinnerModal } from '../components/panels.js';
import { useLiveSync } from '../hooks/useLiveSync.js';

type Filter = 'all' | 'close' | 'done' | 'none' | 'inactive';

export function AdminDashboard() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('rank');
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(true);
  const { data, isLoading } = useAdminStatus({ q, sort, full: true });
  const { connected } = useLiveSync({ onWinDetected: () => setModalOpen(true) });

  if (isLoading) return <div className="p-6">Loading dashboard…</div>;
  if (!data) return <div className="p-6"><EmptyState title="No game yet" hint="Create one from Setup." /></div>;

  const detected = data.winners.detected;
  let rows = data.players;
  if (filter === 'close') rows = rows.filter((p) => p.remainingCount > 0 && p.remainingCount <= 3);
  if (filter === 'done') rows = rows.filter((p) => p.completedAtSeq != null);
  if (filter === 'none') rows = rows.filter((p) => p.markedCount === 0);
  if (filter === 'inactive') rows = rows.filter((p) => !p.isActive);

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">{data.game.name} — dashboard</h1>
        <LiveDot connected={connected} />
      </header>

      <section className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
        {[
          ['Drawn', `${data.drawn.count}`],
          ['Remaining', `${data.drawn.remaining}`],
          ['Last drawn', `${data.drawn.lastDrawn?.number ?? '–'}`],
          ['Status', data.game.status],
          ['Close to win', `${data.closeToWin.length}`],
          ['Mode', (data.game as { gameMode?: string }).gameMode === 'cross' ? '✚ Cross' : '🏠 Housefull'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-center">
            <p className="text-[11px] uppercase tracking-widest text-neutral-500">{k}</p>
            <p className="tnum text-2xl font-black">{v}</p>
          </div>
        ))}
      </section>

      {modalOpen && detected.length > 0 && (
        <WinnerModal
          events={detected}
          onClose={() => setModalOpen(false)}
          onChanged={() => {
            void qc.invalidateQueries();
            setModalOpen(true);
          }}
        />
      )}

      {data.winners.confirmed && data.winners.confirmed.length > 0 && (
        <div className="mt-4 rounded-2xl border-2 border-lime-400 bg-lime-400/10 p-4" role="status">
          <h3 className="font-bold text-lime-300 text-sm uppercase tracking-widest mb-2">Confirmed winners</h3>
          <div className="flex flex-wrap gap-3">
            {data.winners.confirmed.map((e) => (
              <div key={e.id} className="rounded-lg border border-lime-400/50 bg-lime-400/20 p-3">
                <p className="font-bold text-lime-200">{e.placing === 1 ? '🥇' : e.placing === 2 ? '🥈' : e.placing === 3 ? '🥉' : `#${e.placing}`} {e.players.map((p)=>p.name).join(' & ')}</p>
                <p className="tnum text-xs text-neutral-400">Rule: {e.rule} · Draw #{e.drawSeq}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <h2 className="font-bold">Leaderboard (top 10)</h2>
          <ol className="mt-2 flex flex-col gap-2">
            {data.leaderboard.map((p) => {
              const cardSize = data.game.cardSize ?? 16;
              return (
              <li key={p.serial}>
                <div className="flex items-center justify-between text-sm">
                  <span>#{p.rank}{p.isTie ? '=' : ''} <strong>{p.name}</strong> <span className="text-neutral-500">#{String(p.serial).padStart(3, '0')}</span></span>
                  <span className="tnum">{p.markedCount}/{cardSize} · needs {p.remainingCount}</span>
                </div>
                <ProgressBar value={p.markedCount} max={cardSize} />
              </li>
              );
            })}
          </ol>
        </section>

        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <h2 className="font-bold">Hot numbers <span className="text-xs font-normal text-neutral-500">(win if called next)</span></h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {data.hotNumbers.length === 0 && <li className="text-neutral-500">None yet.</li>}
            {data.hotNumbers.map((h) => (
              <li key={h.number} className="tnum">#{h.number} → {h.wouldCompletePlayers.map((s) => `#${String(s).padStart(3, '0')}`).join(', ')}</li>
            ))}
          </ul>
          <h2 className="mt-4 font-bold">Close to winning (≤3)</h2>
          <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-auto text-sm">
            {data.closeToWin.length === 0 && <li className="text-neutral-500">Nobody close yet.</li>}
            {data.closeToWin.map((p) => (
              <li key={p.serial} className="tnum">{p.name} (#{String(p.serial).padStart(3, '0')}) needs {p.remaining.join(', ')}</li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <h2 className="font-bold">Distribution</h2>
          <div className="mt-2"><Histogram data={data.histogram} /></div>
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or serial" className="tnum rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm" />
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm" aria-label="Sort">
            <option value="rank">Rank</option>
            <option value="serial">Serial</option>
            <option value="name">Name</option>
            <option value="marks">Marks</option>
          </select>
          {(['all', 'close', 'done', 'none', 'inactive'] as Filter[]).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full border px-3 py-1 text-xs ${filter === f ? 'border-lime-400 text-lime-300' : 'border-neutral-700 text-neutral-400'}`}>
              {f === 'close' ? 'Close to win (≤3)' : f === 'done' ? 'Completed' : f === 'none' ? 'No marks' : f === 'inactive' ? 'Inactive' : 'All'}
            </button>
          ))}
          <span className="tnum ml-auto text-xs text-neutral-500">{rows.length} players</span>
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-500">
                <th className="p-2">#</th><th className="p-2">Name</th><th className="p-2">Marks</th><th className="p-2">Left</th><th className="p-2">Rank</th><th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const cardSize = data.game.cardSize ?? 16;
                return (
                <Fragment key={p.serial}>
                  <tr className="border-t border-neutral-800">
                    <td className="tnum p-2">{String(p.serial).padStart(3, '0')}</td>
                    <td className="p-2 font-semibold">{p.name}</td>
                    <td className="tnum p-2">{p.markedCount}/{cardSize}</td>
                    <td className="tnum p-2">{p.remainingCount}</td>
                    <td className="tnum p-2">#{p.rank}{p.isTie ? ' =' : ''}</td>
                    <td className="p-2">
                      <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-xs">
                        {p.completedAtSeq != null ? 'Completed' : !p.isActive ? 'Inactive' : p.remainingCount <= 3 ? 'Close!' : 'Playing'}
                      </span>{' '}
                      <button type="button" onClick={() => setExpanded(expanded === p.serial ? null : p.serial)} className="text-xs text-lime-300 underline">
                        {expanded === p.serial ? 'hide' : 'card'}
                      </button>{' '}
                      {p.id && <Link to={`/admin/players/${p.id}`} className="text-xs text-neutral-400 underline">detail</Link>}
                    </td>
                  </tr>
                  {expanded === p.serial && (
                    <tr className="border-t border-neutral-800">
                      <td colSpan={6} className="p-3">
                        <PlayerCardPreview playerId={p.id} remaining={p.remainingNumbers} />
                      </td>
                    </tr>
                  )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

import { useEffect } from 'react';
import { apiFetch } from '../api/client.js';

function PlayerCardPreview({ playerId, remaining }: { playerId: string | null; remaining?: number[] }) {
  const [detail, setDetail] = useState<{ card: { grid: number[] } | null; marked: number[] } | null>(null);
  useEffect(() => {
    if (!playerId) return;
    void apiFetch<{ card: { grid: number[] } | null; marked: number[] }>(`/api/v1/admin/players/${playerId}`).then(setDetail);
  }, [playerId]);
  if (!playerId) return <p className="text-sm text-neutral-500">No card yet.</p>;
  if (!detail) return <p className="text-sm text-neutral-500">Loading…</p>;
  if (!detail.card) return <p className="text-sm text-neutral-500">No card yet.</p>;
  return (
    <div className="max-w-xs">
      <CardGrid grid={detail.card.grid} marked={detail.marked} size="sm" />
      {remaining && remaining.length > 0 && <p className="tnum mt-1 text-xs text-neutral-400">Missing: {remaining.join(', ')}</p>}
    </div>
  );
}
