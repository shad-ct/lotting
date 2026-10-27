import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch, friendlyMessage } from '../api/client.js';
import { useAdminGame, useAdminPlayers } from '../api/hooks.js';
import { ConfirmDialog, CopyButton, EmptyState } from '../components/grids.js';
import { useLiveSync } from '../hooks/useLiveSync.js';

interface Cred { serial: number; name: string; loginId: string; pin: string }

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
  const [gameName, setGameName] = useState('Onam Lotto 2026');
  const [gameMode, setGameMode] = useState<'housefull' | 'cross'>('housefull');
  const [msg, setMsg] = useState('');
  const [creds, setCreds] = useState<Cred[]>([]);
  const [leaving, setLeaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | 'finish' | 'reopen'>(null);
  const [nextName, setNextName] = useState('Onam Lotto 2026');
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
  const hasPins = (players?.items.filter((p) => p.hasPin).length ?? 0) >= need && need > 0;

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6" onMouseLeave={() => creds.length > 0 && setLeaving(true)}>
      <h1 className="text-2xl font-black">Game setup</h1>
      {msg && <p className="mt-2 rounded-lg border border-red-800 p-2 text-sm text-red-300" role="alert">{msg}</p>}
      {leaving && creds.length > 0 && (
        <p className="mt-2 rounded-lg border border-yellow-800 bg-yellow-950 p-3 text-sm text-yellow-200" role="alert">
          PINs can't be shown again. Download/copy them now before leaving this screen.
        </p>
      )}

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

        <Step n={2} title={`Add players (${total}/${need})`} done={total >= need}>
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/players" className="rounded-lg border border-neutral-600 px-3 py-1.5 text-sm">Manage players / CSV import</Link>
          </div>
          {total >= need && <p className="mt-1 text-xs text-neutral-500">Player limit reached ({total}/{need}).</p>}
        </Step>

        <Step n={3} title="Generate credentials (one-time PIN reveal)" done={hasPins}>
          <button type="button" disabled={!game || hasPins || total < need} onClick={() => {
            setMsg('');
            apiFetch<{ items: Cred[] }>('/api/v1/admin/players/credentials/generate', { method: 'POST' })
              .then((r) => { setCreds(r.items); refresh(); })
              .catch((e: unknown) => setMsg(friendlyMessage(e)));
          }} className="rounded-lg bg-lime-400 px-3 py-1.5 text-sm font-bold text-neutral-950 disabled:opacity-40">
            Generate PINs
          </button>
          {game?.status === 'setup' && !hasPins && total < need && <p className="mt-1 text-xs text-neutral-500">Finish step 2 first — all {need} players must be added.</p>}
          {creds.length > 0 && (
            <div className="mt-2 overflow-x-auto">
              <p className="text-sm font-bold text-yellow-200">Copy/download now — PINs can't be shown again.</p>
              <table className="mt-1 w-full text-sm">
                <thead><tr className="text-left text-neutral-500"><th>#</th><th>Name</th><th>Login</th><th>PIN</th></tr></thead>
                <tbody>{creds.map((c) => (
                  <tr key={c.serial} className="tnum border-t border-neutral-800"><td>{c.serial}</td><td>{c.name}</td><td>{c.loginId}</td><td className="font-black">{c.pin}</td></tr>
                ))}</tbody>
              </table>
              <div className="mt-2 flex gap-2">
                <CopyButton text={creds.map((c) => `${c.serial},${c.name},${c.loginId},${c.pin}`).join('\n')} label="Copy all" />
                <a href="/api/v1/admin/export/credentials.csv" className="rounded-md border border-neutral-700 px-2 py-1 text-xs" download>Download CSV</a>
                <a href="/api/v1/admin/export/credentials.print" target="_blank" rel="noreferrer" className="rounded-md border border-neutral-700 px-2 py-1 text-xs">Print slips</a>
              </div>
            </div>
          )}
        </Step>

        <Step n={4} title="Generate cards" done={hasCards}>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!game || game.status !== 'setup' || !hasPins} onClick={() => doPost('/api/v1/admin/cards/generate')} className="rounded-lg bg-lime-400 px-3 py-1.5 text-sm font-bold text-neutral-950 disabled:opacity-40">
              Generate cards
            </button>
            {game?.status === 'setup' && hasCards && <span className="text-xs text-neutral-500">Regenerate allowed until locked.</span>}
          </div>
          {game?.status === 'setup' && !hasPins && <p className="mt-1 text-xs text-neutral-500">Finish step 3 first — every player needs a PIN.</p>}
          {typeof game?.generationStats === 'object' && game?.generationStats != null && (
            <pre className="tnum mt-2 overflow-auto rounded-lg bg-neutral-900 p-2 text-xs">{JSON.stringify(game.generationStats, null, 1)}</pre>
          )}
        </Step>

        <Step n={5} title="Lock cards (irreversible)" done={['ready', 'live', 'finished'].includes(game?.status ?? '')}>
          <button type="button" disabled={!game || game.status !== 'setup' || !hasPins || !hasCards} onClick={() => doPost('/api/v1/admin/cards/lock')} className="rounded-lg border border-red-700 px-3 py-1.5 text-sm font-bold text-red-300 disabled:opacity-40">
            Lock cards — after this, cards can't be changed
          </button>
          {game?.status === 'setup' && (!hasPins || !hasCards) && <p className="mt-1 text-xs text-neutral-500">Finish steps 3–4 first — PINs and cards for every player.</p>}
        </Step>

        <Step n={6} title="Distribute, then start" done={game?.status === 'live' || game?.status === 'finished'}>
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/distribution" className="rounded-lg border border-neutral-600 px-3 py-1.5 text-sm">Go to Distribution</Link>
            <button type="button" disabled={game?.status !== 'ready'} onClick={() => doPost('/api/v1/admin/game/start')} className="rounded-lg bg-lime-400 px-3 py-1.5 text-sm font-bold text-neutral-950 disabled:opacity-40">
              Start game
            </button>
          </div>
          {(game?.status === 'live' || game?.status === 'finished') && <p className="mt-1 text-xs text-neutral-500">Status: {game.status}</p>}
        </Step>

        {game && (
          <Step n={7} title="After the event (finish / reset / new game)" done={false}>
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
            <form
              className="mt-3 flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setMsg('');
                apiFetch('/api/v1/admin/game', { method: 'POST', body: JSON.stringify({ name: nextName }) })
                  .then(refresh)
                  .catch((er: unknown) => setMsg(friendlyMessage(er)));
              }}
            >
              <input value={nextName} onChange={(e) => setNextName(e.target.value)} className="w-64 rounded-lg border border-neutral-700 bg-neutral-900 p-2 text-sm" aria-label="New game name" placeholder="New game name" />
              <button
                type="submit"
                disabled={game.status !== 'finished'}
                title={game.status !== 'finished' ? 'Finish the current game first' : 'Start a fresh game (old data stays archived under its own game)'}
                className="rounded-lg bg-lime-400 px-3 py-1.5 text-sm font-bold text-neutral-950 disabled:opacity-40"
              >
                Start new game
              </button>
            </form>
            {game.status !== 'finished' && (
              <p className="mt-1 text-xs text-neutral-500">A new game can be created once this one is finished. Past games stay in the database under their own game records.</p>
            )}
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
    </main>
  );
}
