import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch, friendlyMessage } from '../api/client.js';
import { useAdminGame, useAdminPlayers, useAdminStatus } from '../api/hooks.js';
import { ConfirmDialog, CopyButton, EmptyState } from '../components/grids.js';
import { WinnerBanner } from '../components/panels.js';
import { useLiveSync } from '../hooks/useLiveSync.js';

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <section className={`rounded-xl border p-4 ${done ? 'border-lime-800 bg-neutral-900' : 'border-neutral-800 bg-neutral-950'}`}>
      <h2 className="font-bold">{n}. {title} {done && <span className="text-lime-400">✓</span>}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function Setup() {
  const qc = useQueryClient();
  useLiveSync();
  const { data: game } = useAdminGame();
  const { data: players } = useAdminPlayers();
  const { data: status } = useAdminStatus({ full: true });
  const [gameName, setGameName] = useState('Onam Lotto 2026');
  const [phone, setPhone] = useState('');
  const [gameMode, setGameMode] = useState<'housefull' | 'cross'>('housefull');
  const [msg, setMsg] = useState('');
  const [confirmAction, setConfirmAction] = useState<null | 'finish' | 'reopen' | 'delete'>(null);
  const [resetText, setResetText] = useState('');
  const [wipeText, setWipeText] = useState('');

  const refresh = () => {
    void qc.invalidateQueries();
  };
  const doPost = (path: string, body?: object) => {
    setMsg('');
    apiFetch(path, { method: 'POST', body: JSON.stringify(body ?? {}) })
      .then(refresh)
      .catch((e: unknown) => setMsg(friendlyMessage(e)));
  };

  const total = players?.total ?? 0;
  const need = game?.playerCount ?? 0;
  const hasCards = (players?.items.filter((p) => p.hasCard).length ?? 0) >= need && need > 0;

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="text-2xl font-black">Game setup</h1>
      {status?.winners.detected && status.winners.detected.length > 0 && (
        <WinnerBanner
          winners={status.winners.detected.flatMap((e) =>
            e.players.map((p) => ({ serial: p.serial ?? 0, name: p.name }))
          )}
        />
      )}
      {msg && <p className="mt-2 rounded-lg border border-red-800 p-2 text-sm text-red-300" role="alert">{msg}</p>}
      <div className="mt-4 flex flex-col gap-3">
        <Step n={1} title="Create game" done={!!game}>
          {!game ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                doPost('/api/v1/admin/game', { name: gameName, gameMode });
              }}
            >
              <div className="flex gap-2">
                <input value={gameName} onChange={(e) => setGameName(e.target.value)} className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 p-2" aria-label="Game name" />
                <button type="submit" className="rounded-lg bg-lime-400 px-4 font-bold text-neutral-950">Create</button>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-sm text-neutral-400">Mode:</span>
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="gameMode"
                    value="housefull"
                    checked={gameMode === 'housefull'}
                    onChange={() => setGameMode('housefull')}
                    className="accent-lime-400"
                  />
                  <span>🏠 Housefull <span className="text-neutral-500">(complete full card)</span></span>
                </label>
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="gameMode"
                    value="cross"
                    checked={gameMode === 'cross'}
                    onChange={() => setGameMode('cross')}
                    className="accent-lime-400"
                  />
                  <span>✚ Cross <span className="text-neutral-500">(any row or column)</span></span>
                </label>
              </div>
            </form>
          ) : (
            <div>
              <p className="text-sm text-neutral-400">
                {game.name} · {game.status} · {game.playerCount} players · {game.maxNumber} numbers · {game.cardSize}/card
                {' · '}
                <span className={`font-semibold ${(game as { gameMode?: string }).gameMode === 'cross' ? 'text-amber-400' : 'text-lime-400'}`}>
                  {(game as { gameMode?: string }).gameMode === 'cross' ? '✚ Cross mode' : '🏠 Housefull mode'}
                </span>
              </p>
              {game.status === 'setup' && (
                <form
                  className="mt-2 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setMsg('');
                    apiFetch('/api/v1/admin/game', { method: 'PATCH', body: JSON.stringify({ name: gameName }) })
                      .then(refresh)
                      .catch((er: unknown) => setMsg(friendlyMessage(er)));
                  }}
                >
                  <input value={gameName} onChange={(e) => setGameName(e.target.value)} className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 p-2 text-sm" aria-label="Rename game" placeholder="Rename game" />
                  <button type="submit" className="rounded-lg border border-neutral-600 px-3 py-1 text-sm">Rename</button>
                </form>
              )}
            </div>
          )}
        </Step>

        <Step n={2} title="Add players" done={total > 0}>
          <form
            className="flex flex-wrap gap-2 items-end"
            onSubmit={(e) => {
              e.preventDefault();
              setMsg('');
              apiFetch('/api/v1/admin/players', { method: 'POST', body: JSON.stringify({ phone }) })
                .then(refresh)
                .catch((e: unknown) => setMsg(friendlyMessage(e)));
              setPhone('');
            }}
          >
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
              aria-label="Player phone"
              className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 p-2 text-sm"
            />
            <button type="submit" disabled={!game || game.status !== 'setup'} className="rounded-lg bg-lime-400 px-4 font-bold text-neutral-950 disabled:opacity-40">
              Add player
            </button>
          </form>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link to="/admin/players" className="rounded-lg border border-neutral-600 px-3 py-1.5 text-sm">Manage players / CSV import</Link>
          </div>
          <p className="mt-1 text-xs text-neutral-500">{total} players added (no limit — game uses whoever is on the roster).</p>
        </Step>

        <Step n={3} title="Generate cards" done={hasCards}>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!game || game.status !== 'setup' || total === 0} onClick={() => doPost('/api/v1/admin/cards/generate')} className="rounded-lg bg-lime-400 px-3 py-1.5 text-sm font-bold text-neutral-950 disabled:opacity-40">
              Generate cards
            </button>
            {game?.status === 'setup' && hasCards && <span className="text-xs text-neutral-500">Regenerate allowed until locked.</span>}
          </div>
          {game?.status === 'setup' && total === 0 && <p className="mt-1 text-xs text-neutral-500">Add players first.</p>}
          {typeof game?.generationStats === 'object' && game?.generationStats != null && (
            <pre className="tnum mt-2 overflow-auto rounded-lg bg-neutral-900 p-2 text-xs">{JSON.stringify(game.generationStats, null, 1)}</pre>
          )}
        </Step>

        <Step n={4} title="Lock cards (irreversible)" done={['ready', 'live', 'finished'].includes(game?.status ?? '')}>
          <button type="button" disabled={!game || game.status !== 'setup' || !hasCards} onClick={() => doPost('/api/v1/admin/cards/lock')} className="rounded-lg border border-red-700 px-3 py-1.5 text-sm font-bold text-red-300 disabled:opacity-40">
            Lock cards — after this, cards can't be changed
          </button>
          {game?.status === 'setup' && !hasCards && <p className="mt-1 text-xs text-neutral-500">Generate cards first.</p>}
        </Step>

        <Step n={5} title="Distribute, then start" done={game?.status === 'live' || game?.status === 'finished'}>
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/distribution" className="rounded-lg border border-neutral-600 px-3 py-1.5 text-sm">Go to Distribution</Link>
            <button type="button" disabled={game?.status !== 'ready'} onClick={() => doPost('/api/v1/admin/game/start')} className="rounded-lg bg-lime-400 px-3 py-1.5 text-sm font-bold text-neutral-950 disabled:opacity-40">
              Start game
            </button>
          </div>
          {(game?.status === 'live' || game?.status === 'finished') && <p className="mt-1 text-xs text-neutral-500">Status: {game.status}</p>}
        </Step>

        {game && (
          <Step n={6} title="After the event (finish / reset)" done={false}>
            <div className="flex flex-wrap gap-2">
              {game.status === 'live' && (
                <button type="button" onClick={() => setConfirmAction('finish')} className="rounded-lg border border-neutral-600 px-3 py-1.5 text-sm">
                  Finish game
                </button>
              )}
              {game.status === 'finished' && (
                <button type="button" onClick={() => setConfirmAction('reopen')} className="rounded-lg border border-neutral-600 px-3 py-1.5 text-sm">
                  Reopen game (back to live)
                </button>
              )}
              <button type="button" onClick={() => setConfirmAction('delete')} className="rounded-lg border border-red-700 px-3 py-1.5 text-sm font-bold text-red-300">
                Delete game (start fresh)
              </button>
            </div>
            <form
              className="mt-3 flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setMsg('');
                  apiFetch('/api/v1/admin/game/reset', { method: 'POST', body: JSON.stringify({ confirm: 'RESET' }) })
                    .then(() => {
                      setResetText('');
                      refresh();
                    })
                    .catch((er: unknown) => setMsg(friendlyMessage(er)));
                }}
              >
                <input
                  value={resetText}
                  onChange={(e) => setResetText(e.target.value)}
                  placeholder='Type RESET to clear draws + wins'
                  aria-label="Type RESET to confirm"
                  className="w-64 rounded-lg border border-red-800 bg-neutral-900 p-2 text-sm"
                />
                <button type="submit" disabled={resetText !== 'RESET'} className="rounded-lg border border-red-700 px-3 py-1.5 text-sm font-bold text-red-300 disabled:opacity-40">
                  Reset game (keeps players/cards/PINs)
                </button>
              </form>
            <form
              className="mt-3 flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setMsg('');
                apiFetch('/api/v1/admin/game/wipe', { method: 'POST', body: JSON.stringify({ confirm: 'WIPE' }) })
                  .then(() => {
                    setWipeText('');
                    refresh();
                  })
                  .catch((er: unknown) => setMsg(friendlyMessage(er)));
              }}
            >
              <input
                value={wipeText}
                onChange={(e) => setWipeText(e.target.value)}
                placeholder="Type WIPE to delete EVERYTHING in this game"
                aria-label="Type WIPE to confirm full wipe"
                className="w-64 rounded-lg border border-red-800 bg-neutral-900 p-2 text-sm"
              />
              <button type="submit" disabled={wipeText !== 'WIPE'} className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40">
                Wipe everything (players, cards, PINs, draws, wins)
              </button>
            </form>
            <p className="mt-1 text-xs text-neutral-500">Wipe cannot be undone. Works in any status — the game returns to empty setup.</p>
          </Step>
        )}

        {(!game || game.status === 'setup' || game.status === 'ready') && <EmptyState title="Steps unlock in order" hint="Each step explains what it needs." />}
      </div>      <ConfirmDialog
        open={confirmAction === 'finish'}
        title="Finish the game?"
        body="The game closes with the current standings. You can still reopen it afterwards."
        confirmLabel="Finish"
        onConfirm={() => {
          setConfirmAction(null);
          doPost('/api/v1/admin/game/finish');
        }}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === 'reopen'}
        title="Reopen the game?"
        body="The game goes back to live with all draws and confirmed winners intact."
        confirmLabel="Reopen"
        onConfirm={() => {
          setConfirmAction(null);
          doPost('/api/v1/admin/game/reopen', { confirm: true });
        }}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === 'delete'}
        title="Delete this game?"
        body="This permanently removes the game record, players, cards, draws, wins, and audit trail. You can then create a brand new game from Step 1."
        confirmLabel="Delete everything"
        onConfirm={() => {
          setConfirmAction(null);
          apiFetch('/api/v1/admin/game', { method: 'DELETE', body: JSON.stringify({ confirm: true }) })
            .then(refresh)
            .catch((er: unknown) => setMsg(friendlyMessage(er)));
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </main>
  );
}