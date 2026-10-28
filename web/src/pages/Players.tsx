import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch, friendlyMessage } from '../api/client.js';
import { useAdminGame, useAdminPlayers } from '../api/hooks.js';
import { CardGrid, ConfirmDialog, EmptyState } from '../components/grids.js';
import { useLiveSync } from '../hooks/useLiveSync.js';

export function Players() {
  const qc = useQueryClient();
  useLiveSync();
  const { data } = useAdminPlayers();
  const { data: game } = useAdminGame();
  const [phone, setPhone] = useState('');
  const [csv, setCsv] = useState('');
  const [msg, setMsg] = useState('');
  const [importReport, setImportReport] = useState('');
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const total = data?.total ?? 0;

  const refresh = () => void qc.invalidateQueries();  const post = (path: string, body?: object) => {
    setMsg('');
    apiFetch(path, { method: 'POST', body: JSON.stringify(body ?? {}) })
      .then((r) => {
        setImportReport(JSON.stringify(r));
        refresh();
      })
      .catch((e: unknown) => setMsg(friendlyMessage(e)));
  };
  const del = (id: string) => {
    setMsg('');
    apiFetch(`/api/v1/admin/players/${id}`, { method: 'DELETE' })
      .then(() => {
        setDeleting(null);
        refresh();
      })
      .catch((e: unknown) => {
        setDeleting(null);
        setMsg(friendlyMessage(e));
      });
  };

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="text-2xl font-black">Players ({data?.total ?? 0})</h1>
      {msg && <p className="mt-2 text-sm text-red-400" role="alert">{msg}</p>}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <form
          className="rounded-xl border border-neutral-800 bg-neutral-900 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            setMsg('');
            post('/api/v1/admin/players', { phone: phone || undefined });
            setPhone('');
          }}
        >
          <h2 className="text-sm font-bold">Add player</h2>
          <div className="mt-2 flex gap-2">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number (becomes password)" aria-label="Phone" className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 p-2 text-sm" />
            <button type="submit" className="rounded-lg bg-lime-400 px-3 text-sm font-bold text-neutral-950">Add player</button>
          </div>
          <p className="mt-1 text-xs text-neutral-500">Login ID and card are auto-assigned. Phone number is the login password.</p>
        </form>

        <form
          className="rounded-xl border border-neutral-800 bg-neutral-900 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const parsed = JSON.parse(csv) as unknown;
              if (Array.isArray(parsed)) post('/api/v1/admin/players/import', parsed as object);
              else post('/api/v1/admin/players/import', { csv });
            } catch {
              post('/api/v1/admin/players/import', { csv });
            }
          }}
        >
          <h2 className="text-sm font-bold">CSV import <span className="font-normal text-neutral-500">(paste name,phone rows or a JSON array)</span></h2>
          <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={3} placeholder={'9876543210\n8765432101'} aria-label="CSV input" className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-950 p-2 font-mono text-xs" />
          <button type="submit" className="mt-2 rounded-lg border border-neutral-600 px-3 py-1 text-sm">Preview & import</button>
          {importReport && <pre className="tnum mt-1 max-h-24 overflow-auto text-xs text-neutral-400">{importReport}</pre>}
        </form>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="p-2">#</th><th className="p-2">Name</th><th className="p-2">Login</th><th className="p-2">Phone</th><th className="p-2">Card</th><th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((p) => (
              <tr key={p.id} className="border-t border-neutral-800">
                <td className="tnum p-2">{String(p.serial).padStart(3, '0')}</td>
                <td className="p-2 font-semibold">{p.name}</td>
                <td className="tnum p-2">{p.loginId}</td>
                <td className="tnum p-2">{p.phone ?? '—'}</td>
                <td className="p-2">{p.hasCard ? '✓' : '—'}</td>
                <td className="p-2 whitespace-nowrap">
                  <Link to={`/admin/players/${p.id}`} className="text-lime-300 underline">detail</Link>
                  <button
                    type="button"
                    onClick={() => setDeleting({ id: p.id, name: p.name })}
                    aria-label={`Delete ${p.name}`}
                    className="ml-3 text-red-400 underline"
                  >
                    delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={deleting != null}
        title={deleting ? `Delete ${deleting.name}?` : 'Delete player?'}
        body="This removes the player (and their card/PIN, if any) permanently. Only allowed while the game is still in setup."
        confirmLabel="Delete"
        onConfirm={() => deleting && del(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </main>
  );
}

interface Detail {
  id: string;
  serial: number;
  name: string;
  phone: string | null;
  loginId: string;
  isActive: boolean;
  cardImageSentAt: string | null;
  credentialsSentAt: string | null;
  card: { grid: number[]; verifyCode: string } | null;
  marked: number[];
  remaining: number[];
  markedCount: number;
  remainingCount: number;
  rank: number | null;
  markHistory: { number: number; seq: number | null }[];
}

export function PlayerDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: game } = useAdminGame();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [msg, setMsg] = useState('');
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useLiveSync();
  const load = () => {
    void apiFetch<Detail>(`/api/v1/admin/players/${id}`)
      .then((d) => {
        setDetail(d);
        setEditName(d.name);
        setEditPhone(d.phone ?? '');
      })
      .catch((e: unknown) => setMsg(friendlyMessage(e)));
  };
  useEffect(load, [id]);

  const save = () => {
    setMsg('');
    apiFetch<Detail>(`/api/v1/admin/players/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: editName, phone: editPhone || null }),
    })
      .then((d) => {
        setDetail((prev) => (prev ? { ...prev, name: d.name, phone: d.phone } : prev));
        setEditPhone(d.phone ?? '');
        void qc.invalidateQueries();
      })
      .catch((e: unknown) => setMsg(friendlyMessage(e)));
  };

  const toggleActive = () => {
    if (!detail) return;
    setMsg('');
    apiFetch(`/api/v1/admin/players/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !detail.isActive }),
    })
      .then(() => {
        load();
        void qc.invalidateQueries();
      })
      .catch((e: unknown) => setMsg(friendlyMessage(e)));
  };

  const remove = () => {
    setMsg('');
    apiFetch(`/api/v1/admin/players/${id}`, { method: 'DELETE' })
      .then(() => {
        setConfirmDelete(false);
        void qc.invalidateQueries();
        nav('/admin/players');
      })
      .catch((e: unknown) => {
        setConfirmDelete(false);
        setMsg(friendlyMessage(e));
      });
  };

  if (msg && !detail) return <div className="p-6"><EmptyState title="Player not found" hint={msg} /></div>;
  if (!detail) return <div className="p-6">Loading…</div>;
  const canDelete = game == null || game.status === 'setup';

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <button type="button" onClick={() => nav(-1)} className="text-sm text-neutral-400 underline">← back</button>
      <h1 className="mt-1 text-2xl font-black">{detail.name} <span className="tnum text-neutral-400">#{String(detail.serial).padStart(3, '0')}</span></h1>
      {msg && <p className="mt-2 text-sm text-red-400">{msg}</p>}
      <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-900 p-3">
        <h2 className="text-sm font-bold">Edit player</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" aria-label="Player name" className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 p-2 text-sm" />
          <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Phone (optional)" aria-label="Player phone" className="w-40 rounded-lg border border-neutral-700 bg-neutral-950 p-2 text-sm" />
          <button type="button" onClick={save} className="rounded-lg bg-lime-400 px-3 py-1 text-sm font-bold text-neutral-950">Save</button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={toggleActive}
            className="rounded-lg border border-neutral-600 px-3 py-1 text-sm"
          >
            {detail.isActive ? 'Deactivate (excluded from wins)' : 'Reactivate'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={!canDelete}
            title={canDelete ? 'Delete this player permanently' : 'Players can only be deleted while the game is in setup'}
            className="rounded-lg border border-red-700 px-3 py-1 text-sm font-bold text-red-300 disabled:opacity-40"
          >
            Delete player
          </button>
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
          <p className="tnum text-sm">Login {detail.loginId} · Phone {detail.phone ?? '—'} · Rank {detail.rank ?? '–'}</p>
          <p className="tnum text-sm">{detail.markedCount}/16 marked · {detail.remainingCount} left</p>
          <p className="text-xs text-neutral-500">Timeline: {detail.markHistory.filter((h) => h.seq != null).map((h) => `${h.number}@${h.seq}`).join(', ') || 'no marks yet'}</p>
  
        </div>
        <div>
          {detail.card ? (
            <CardGrid grid={detail.card.grid} marked={detail.marked} size="sm" />
          ) : (
            <EmptyState title="No card yet" />
          )}
          {detail.card && <p className="tnum mt-1 text-xs text-neutral-500">Verify: {detail.card.verifyCode}</p>}
        </div>
      </div>
      {detail.card && (
        <a href={`/api/v1/admin/players/${detail.id}/card.png?marked=1&download=1`} className="mt-3 inline-block rounded-lg border border-neutral-600 px-3 py-1.5 text-sm" download>
          Download marked PNG
        </a>
      )}
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${detail.name}?`}
        body="This removes the player (and their card/PIN, if any) permanently. Only allowed while the game is still in setup."
        confirmLabel="Delete"
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </main>
  );
}
