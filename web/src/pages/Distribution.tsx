import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch, friendlyMessage } from '../api/client.js';
import { useAdminStatus } from '../api/hooks.js';
import { EmptyState } from '../components/grids.js';
import { useLiveSync } from '../hooks/useLiveSync.js';

/**
 * Distribution (03 §6): per-player PNG download + Web Share + wa.me text,
 * sent checkboxes, bulk ZIP/CSV/print, progress counters, filters.
 * wa.me carries TEXT ONLY — the admin attaches the downloaded PNG manually.
 */
export function Distribution() {
  const qc = useQueryClient();
  useLiveSync();
  const { data } = useAdminStatus({ full: true });
  const [filter, setFilter] = useState<'all' | 'unsent' | 'sent'>('all');
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  if (!data) return <div className="p-6">Loading…</div>;
  const canShare = typeof navigator !== 'undefined' && 'canShare' in navigator;

  let rows = data.players;
  if (filter === 'unsent') rows = rows.filter((p) => !p.cardImageSentAt || !p.credentialsSentAt);
  if (filter === 'sent') rows = rows.filter((p) => p.cardImageSentAt && p.credentialsSentAt);
  if (search) {
    const s = search.toLowerCase();
    rows = rows.filter((p) => p.name.toLowerCase().includes(s) || String(p.serial).includes(s));
  }
  const cardsSent = data.players.filter((p) => p.cardImageSentAt).length;
  const credsSent = data.players.filter((p) => p.credentialsSentAt).length;

  const toggle = (id: string | null, field: 'cardImageSent' | 'credentialsSent', current: string | null) => {
    if (!id) return;
    apiFetch(`/api/v1/admin/players/${id}/sent`, { method: 'PATCH', body: JSON.stringify({ [field]: !current }) })
      .then(() => void qc.invalidateQueries())
      .catch((e: unknown) => setMsg(friendlyMessage(e)));
  };

  const shareCard = async (serial: number, name: string) => {
    setMsg('');
    try {
      const res = await fetch(`/api/v1/admin/players/${rows.find((r) => r.serial === serial)?.id}/card.png?download=1`, { credentials: 'include' });
      const blob = await res.blob();
      const file = new File([blob], `${String(serial).padStart(3, '0')}_${name}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Card #${serial}`, text: `${name} — ${data.game.name}` });
      } else {
        setMsg('Web Share not supported here — download the PNG and attach it manually.');
      }
    } catch (e) {
      setMsg(e instanceof Error && e.name === 'AbortError' ? '' : 'Share failed — download the PNG instead.');
    }
  };

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <h1 className="text-2xl font-black">Distribution</h1>
      {msg && <p className="mt-2 text-sm text-yellow-200" role="status">{msg}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900 p-3">
        <a href="/api/v1/admin/export/cards.zip" className="rounded-lg bg-lime-400 px-3 py-1.5 text-sm font-bold text-neutral-950" download>Download all cards (ZIP)</a>
        <a href="/api/v1/admin/export/credentials.csv" className="rounded-lg border border-neutral-600 px-3 py-1.5 text-sm" download>Credentials CSV</a>
        <a href="/api/v1/admin/export/credentials.print" target="_blank" rel="noreferrer" className="rounded-lg border border-neutral-600 px-3 py-1.5 text-sm">Print slips</a>
        <span className="tnum ml-auto text-xs text-neutral-400">Cards sent {cardsSent}/{data.players.length} · Credentials sent {credsSent}/{data.players.length}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm" />
        {(['all', 'unsent', 'sent'] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full border px-3 py-1 text-xs ${filter === f ? 'border-lime-400 text-lime-300' : 'border-neutral-700 text-neutral-400'}`}>
            {f === 'unsent' ? 'Not yet sent' : f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {rows.length === 0 && <div className="mt-3"><EmptyState title="Nobody here" hint="Try another filter." /></div>}

      <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="p-2">#</th><th className="p-2">Name</th><th className="p-2">Phone</th>
              <th className="p-2">Card PNG</th><th className="p-2">Share</th><th className="p-2">WhatsApp text</th>
              <th className="p-2">Card sent</th><th className="p-2">Creds sent</th><th className="p-2">Reset PIN</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.serial} className="border-t border-neutral-800">
                <td className="tnum p-2">{String(p.serial).padStart(3, '0')}</td>
                <td className="p-2 font-semibold">{p.name}</td>
                <td className="tnum p-2">{p.phone ?? <span className="text-neutral-600">No phone saved</span>}</td>
                <td className="p-2">
                  {p.id && (
                    <>
                      <a href={`/api/v1/admin/players/${p.id}/card.png?download=1`} className="text-lime-300 underline" download>⬇ PNG</a>{' '}
                      <button type="button" onClick={() => setPreview(`/api/v1/admin/players/${p.id}/card.png`)} className="text-xs text-neutral-400 underline">preview</button>
                    </>
                  )}
                </td>
                <td className="p-2">
                  {canShare ? (
                    <button type="button" onClick={() => void shareCard(p.serial, p.name)} className="rounded-md border border-neutral-600 px-2 py-0.5 text-xs">Share card</button>
                  ) : (
                    <span className="text-xs text-neutral-600">Use download + attach</span>
                  )}
                </td>
                <td className="p-2">
                  {p.phone ? (
                    <a
                      href={`https://wa.me/${p.phone}?text=${encodeURIComponent(`Hi ${p.name}! Your ${data.game.name} card is #${String(p.serial).padStart(3, '0')}. Login ID: ${p.loginId ?? ''}. Your card image is attached separately.`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-neutral-600 px-2 py-0.5 text-xs"
                    >
                      WhatsApp text
                    </a>
                  ) : (
                    <span className="text-xs text-neutral-600">No phone saved</span>
                  )}
                </td>
                <td className="p-2">
                  <input type="checkbox" aria-label={`Card sent for ${p.name}`} checked={!!p.cardImageSentAt} onChange={() => toggle(p.id, 'cardImageSent', p.cardImageSentAt)} />
                </td>
                <td className="p-2">
                  <input type="checkbox" aria-label={`Credentials sent for ${p.name}`} checked={!!p.credentialsSentAt} onChange={() => toggle(p.id, 'credentialsSent', p.credentialsSentAt)} />
                </td>
                <td className="p-2">
                  {p.id && (
                    <button
                      type="button"
                      className="rounded-md border border-neutral-600 px-2 py-0.5 text-xs"
                      onClick={() => {
                        apiFetch<{ pin: string }>(`/api/v1/admin/players/${p.id}/reset-pin`, { method: 'POST' })
                          .then((r) => setMsg(`New PIN for ${p.name}: ${r.pin} — copy now, it can't be shown again.`))
                          .catch((e: unknown) => setMsg(friendlyMessage(e)));
                      }}
                    >
                      Reset PIN
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setPreview(null)} role="dialog" aria-label="Card preview">
          <img src={preview} alt="Card preview" className="max-h-[90vh] rounded-xl" />
        </div>
      )}
    </main>
  );
}
