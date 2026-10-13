import { useEffect, useRef, useState } from 'react';
import { useAdminStatus, useDrawLog, adminApi } from '../api/hooks.js';
import { ApiError, apiFetch, friendlyMessage } from '../api/client.js';
import { ConfirmDialog, NumberGrid } from '../components/grids.js';
import { useLiveSync } from '../hooks/useLiveSync.js';

export function MiniDrawBox() {
  const [value, setValue] = useState('');
  const [msg, setMsg] = useState('');
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(value);
        if (!Number.isInteger(n)) return;
        setMsg('');
        apiFetch('/api/v1/admin/draws', { method: 'POST', body: JSON.stringify({ number: n }) })
          .then(() => setValue(''))
          .catch((er: unknown) => setMsg(friendlyMessage(er)));
      }}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Draw #"
        inputMode="numeric"
        aria-label="Quick draw number"
        className="tnum w-20 rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm"
      />
      <button type="submit" className="rounded-lg bg-lime-400 px-3 py-1.5 text-sm font-bold text-neutral-950">Draw</button>
      {msg && <span className="text-xs text-red-400">{msg}</span>}
    </form>
  );
}

export function DrawConsole() {
  const { data: status } = useAdminStatus({ full: true });
  const { data: log } = useDrawLog();
  useLiveSync();
  const [input, setInput] = useState('');
  const [confirmOn, setConfirmOn] = useState(true);
  const [pending, setPending] = useState<number | null>(null);
  const [undoAsk, setUndoAsk] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shuffling, setShuffling] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const game = status?.game;
  const drawnMap = new Map((status?.drawn.sequence ?? []).map((n, i) => [n, i + 1]));
  const drawnSet = new Set(drawnMap.keys());
  const live = game?.status === 'live';

  const n = Number(input);
  const validation =
    input === ''
      ? ''
      : !Number.isInteger(n) || n < 1 || n > (game?.maxNumber ?? 110)
        ? '1–110 only'
        : drawnSet.has(n)
          ? `Already drawn at draw #${drawnMap.get(n)}`
          : '';

  const submit = (number: number) => {
    setError('');
    setBusy(true);
    const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    adminApi
      .draw(number, key)
      .then(() => {
        setInput('');
        inputRef.current?.focus();
      })
      .catch((e: unknown) => setError(friendlyMessage(e)))
      .finally(() => {
        setBusy(false);
        setPending(null);
      });
  };

  const random = () => {
    setShuffling(true);
    setError('');
    setTimeout(() => {
      adminApi
        .randomDraw(`${Date.now()}-rnd`)
        .catch((e: unknown) => setError(friendlyMessage(e)))
        .finally(() => setShuffling(false));
    }, 600);
  };

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="text-2xl font-black">Draw console</h1>
      {!live && (
        <p className="mt-2 rounded-lg border border-yellow-800 bg-yellow-950 p-3 text-sm text-yellow-200">
          Start the game from Setup first — draws are disabled while status is “{game?.status ?? '…'}”.
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-3">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !validation && live) {
                e.preventDefault();
                if (confirmOn) setPending(Number(input));
                else submit(Number(input));
              }
              if (e.key === 'Escape') setPending(null);
            }}
            inputMode="numeric"
            autoFocus
            placeholder="1–110"
            aria-label="Number to draw"
            className="tnum rounded-2xl border border-neutral-700 bg-neutral-900 p-4 text-center text-5xl font-black"
          />
          {validation && <p className="text-center text-sm text-red-400" role="alert">{validation}</p>}
          {error && <p className="text-center text-sm text-red-400" role="alert">{error}</p>}
          <button
            type="button"
            disabled={!!validation || !live || busy}
            onClick={() => (confirmOn ? setPending(Number(input)) : submit(Number(input)))}
            className="rounded-xl bg-lime-400 py-3 font-black text-neutral-950 disabled:opacity-40"
          >
            {busy ? 'Drawing…' : 'Draw'}
          </button>
          <button
            type="button"
            disabled={!live || shuffling}
            onClick={random}
            className="rounded-xl border border-neutral-600 py-3 font-bold disabled:opacity-40"
          >
            {shuffling ? '🎲 Shuffling…' : '🎲 Random draw (server picks)'}
          </button>
          <label className="flex items-center gap-2 text-sm text-neutral-400">
            <input type="checkbox" checked={confirmOn} onChange={(e) => setConfirmOn(e.target.checked)} />
            Confirm before submit (recommended live)
          </label>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-center">
            <p className="text-xs uppercase tracking-widest text-neutral-500">Last drawn</p>
            <p className="tnum text-6xl font-black text-lime-300">{status?.drawn.lastDrawn?.number ?? '–'}</p>
            {status?.drawn.lastDrawn && (
              <button
                type="button"
                onClick={() => setUndoAsk(true)}
                className="mt-2 rounded-lg border border-red-800 px-3 py-1.5 text-sm text-red-300"
              >
                Undo draw #{status.drawn.lastDrawn.seq} (number {status.drawn.lastDrawn.number})?
              </button>
            )}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm text-neutral-400">Tap an undrawn number to fill the input:</p>
          <NumberGrid
            maxNumber={game?.maxNumber ?? 110}
            drawn={drawnSet}
            last={status?.drawn.lastDrawn?.number ?? null}
            onPick={(picked) => {
              setInput(String(picked));
              inputRef.current?.focus();
            }}
          />
          <div className="mt-4">
            <h2 className="font-bold">Recent draws</h2>
            <ul className="mt-1 max-h-48 overflow-auto text-sm">
              {(log?.items ?? []).slice(-12).reverse().map((d) => (
                <li key={d.seq} className="tnum flex gap-2 border-b border-neutral-900 py-1">
                  <span className="text-neutral-500">#{d.seq}</span>
                  <span className={d.isActive ? 'font-bold' : 'text-neutral-500 line-through'}>{d.number}</span>
                  <span className="text-neutral-500">{d.source}{!d.isActive ? ' · undone' : ''}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={pending != null}
        title={`Draw ${pending}?`}
        body="Enter confirms · Esc cancels"
        confirmLabel="Draw it"
        onCancel={() => setPending(null)}
        onConfirm={() => pending != null && submit(pending)}
      />
      <ConfirmDialog
        open={undoAsk}
        title={`Undo draw #${status?.drawn.lastDrawn?.seq} (number ${status?.drawn.lastDrawn?.number})?`}
        body="Everyone's board changes. This is audit-logged."
        confirmLabel="Undo"
        onCancel={() => setUndoAsk(false)}
        onConfirm={() => {
          setUndoAsk(false);
          adminApi.undo().catch((e: unknown) => {
            setError(e instanceof ApiError ? friendlyMessage(e) : 'Undo failed');
          });
        }}
      />
    </main>
  );
}
