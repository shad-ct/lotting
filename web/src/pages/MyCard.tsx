import { useNavigate } from 'react-router-dom';
import { useMyCard } from '../api/hooks.js';
import { apiFetch } from '../api/client.js';
import { CardGrid, LiveDot, ProgressBar, EmptyState } from '../components/grids.js';
import { useLiveSync } from '../hooks/useLiveSync.js';

export function MyCard() {
  const { data, isLoading } = useMyCard();
  const { connected } = useLiveSync();
  const nav = useNavigate();

  if (isLoading) return <div className="p-6">Loading your card…</div>;
  if (!data) return <div className="p-6"><EmptyState title="Card not ready" hint="Ask the admin — cards may not be generated yet." /></div>;

  const markedSet = new Set(data.marked);
  const status =
    data.remainingCount === 0
      ? '🎉 Card complete — waiting for admin to confirm'
      : data.remainingCount <= 3
        ? `So close! ${data.remainingCount} to go`
        : 'In the game';

  return (
    <main className="mx-auto max-w-md p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black">{data.name}</h1>
          <p className="tnum text-sm text-neutral-400">Card #{String(data.serial).padStart(3, '0')} · {data.rankLabel}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <LiveDot connected={connected} />
          <button
            type="button"
            className="text-xs text-neutral-500 underline"
            onClick={() => {
              void apiFetch('/api/v1/auth/logout', { method: 'POST' }).then(() => nav('/login'));
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <div className="mt-4">
        <CardGrid grid={data.grid} marked={markedSet} size="lg" />
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-sm">
          <span className="tnum font-bold">{data.markedCount} / 16 marked</span>
          <span className="tnum text-neutral-400">{data.remainingCount} to go</span>
        </div>
        <div className="mt-1"><ProgressBar value={data.markedCount} max={16} /></div>
      </div>

      <p className="mt-3 rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-center text-sm font-bold" role="status">{status}</p>

      {data.remaining.length > 0 && (
        <div className="mt-3 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
          <p className="text-xs uppercase tracking-widest text-neutral-500">Still needed</p>
          <p className="tnum mt-1 text-lg font-bold">{data.remaining.join(' · ')}</p>
        </div>
      )}

      <a
        href="/api/v1/me/card/image?marked=1"
        className="mt-4 block rounded-lg border border-neutral-700 py-2.5 text-center text-sm font-bold hover:border-lime-400"
        download
      >
        Download my card image
      </a>
    </main>
  );
}
