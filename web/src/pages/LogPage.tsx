import { useAdminGame, useAuditLog, useDrawLog } from '../api/hooks.js';

export function LogPage() {
  const { data: log } = useDrawLog();
  const { data: audit } = useAuditLog();
  const { data: game } = useAdminGame();

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">Draw log & audit</h1>
        <a href="/api/v1/admin/export/standings.csv" className="rounded-lg border border-neutral-600 px-3 py-1.5 text-sm" download>
          Export standings CSV
        </a>
      </div>
      <p className="tnum mt-1 text-sm text-neutral-500">Game: {game?.name ?? '…'} · {game?.status ?? ''}</p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <h2 className="font-bold">Draws (undone struck through)</h2>
          <ul className="mt-2 max-h-[60vh] overflow-auto text-sm">
            {(log?.items ?? []).map((d) => (
              <li key={d.seq} className="tnum flex gap-2 border-b border-neutral-800 py-1">
                <span className="text-neutral-500">#{d.seq}</span>
                <span className={d.isActive ? 'font-bold' : 'text-neutral-500 line-through'}>{d.number}</span>
                <span className="text-neutral-500">{d.source} · {new Date(d.drawnAt).toLocaleTimeString()}</span>
                {!d.isActive && <span className="text-xs text-neutral-500">undone{d.undoReason ? `: ${d.undoReason}` : ''}</span>}
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <h2 className="font-bold">Audit</h2>
          <ul className="mt-2 max-h-[60vh] overflow-auto text-sm">
            {(audit?.items ?? []).map((a, i) => (
              <li key={i} className="flex gap-2 border-b border-neutral-800 py-1">
                <span className="text-neutral-500">{new Date(a.at).toLocaleTimeString()}</span>
                <span className="font-bold">{a.action}</span>
                <span className="tnum truncate text-xs text-neutral-500">{JSON.stringify(a.payload)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
