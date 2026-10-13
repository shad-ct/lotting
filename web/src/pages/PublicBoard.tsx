import { useState } from 'react';
import { useBoard } from '../api/hooks.js';
import { NumberGrid } from '../components/grids.js';
import { LiveDot, EmptyState } from '../components/grids.js';
import { LastDrawnPanel, WinnerBanner } from '../components/panels.js';
import { useLiveSync } from '../hooks/useLiveSync.js';

export function PublicBoard() {
  const { data, isLoading } = useBoard();
  const { connected } = useLiveSync();
  const [sound, setSound] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  if (isLoading) return <div className="p-8">Loading board…</div>;
  if (!data) return <div className="p-8"><EmptyState title="Game not started" hint="Waiting for the admin to start." /></div>;

  const drawnSet = new Set(data.drawn.map((d) => d.number));
  const recent = data.drawn.slice(-10).reverse();
  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black sm:text-3xl">{data.game.name}</h1>
          <p className="tnum text-sm text-neutral-400">
            Drawn {data.drawCount} / {data.game.maxNumber} · Remaining {data.game.maxNumber - data.drawCount}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LiveDot connected={connected} />
          <span className="rounded-full border border-neutral-700 px-3 py-1 text-xs uppercase">{data.game.status}</span>
          <label className="flex items-center gap-1 text-xs text-neutral-400">
            <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> Sound
          </label>
          <button
            type="button"
            className="rounded-lg border border-neutral-700 px-3 py-1 text-xs"
            onClick={() => {
              if (!document.fullscreenElement) void document.documentElement.requestFullscreen().then(() => setFullscreen(true));
              else void document.exitFullscreen().then(() => setFullscreen(false));
            }}
          >
            {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          </button>
        </div>
      </header>

      {data.winners.length > 0 && (
        <div className="mt-4">
          <WinnerBanner winners={data.winners} />
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <NumberGrid maxNumber={data.game.maxNumber} drawn={drawnSet} last={data.lastDrawn?.number ?? null} popNumber={sound ? (data.lastDrawn?.number ?? null) : null} />
        <div className="flex flex-col gap-4">
          <LastDrawnPanel seq={data.lastDrawn?.seq ?? null} number={data.lastDrawn?.number ?? null} />
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs uppercase tracking-widest text-neutral-500">Recent draws</p>
            <p className="tnum mt-2 text-xl font-bold">{recent.length > 0 ? recent.map((d) => d.number).join(' · ') : '–'}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
