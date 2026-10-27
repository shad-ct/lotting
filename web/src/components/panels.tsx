import { useState } from 'react';
import { apiFetch } from '../api/client.js';
import type { WinEventShape } from '../api/types.js';
import { ConfirmDialog } from './grids.js';
import { CardGrid } from './grids.js';

export function WinnerBanner({ winners }: { winners: { serial: number; name: string }[] }) {
  if (winners.length === 0) return null;
  const label =
    winners.length === 1
      ? `Winner: ${winners[0].name} (#${String(winners[0].serial).padStart(3, '0')})`
      : `Winners: ${winners.map((w) => `${w.name} (#${String(w.serial).padStart(3, '0')})`).join(' & ')}`;
  return (
    <div className="rounded-2xl border-2 border-lime-400 bg-lime-400/10 p-6 text-center" role="status">
      <p className="text-2xl font-black text-lime-300 sm:text-4xl">🎉 {label}</p>
    </div>
  );
}

export function LastDrawnPanel({ seq, number }: { seq: number | null; number: number | null }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-center">
      <p className="text-xs uppercase tracking-widest text-neutral-500">Last drawn {seq != null ? `(Draw #${seq})` : ''}</p>
      <p className="tnum mt-1 text-7xl font-black text-lime-300 sm:text-8xl">{number ?? '–'}</p>
    </div>
  );
}

export function Histogram({ data }: { data: Record<string, number> }) {
  const max = Math.max(1, ...Object.values(data));
  const keys = Object.keys(data).map(Number).sort((a, b) => a - b);
  const ticks = [...new Set([max, Math.round((max * 2) / 3), Math.round(max / 3), 0])].sort((a, b) => b - a);
  return (
    <div role="img" aria-label={`Marks histogram, up to ${max} players at one mark count`}>
      <div className="flex gap-1">
        <div className="flex h-[80px] w-6 flex-col justify-between text-right" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="tnum text-[10px] leading-none text-neutral-500">{t}</span>
          ))}
        </div>
        <div className="flex h-[80px] flex-1 items-end gap-1">
          {keys.map((k) => (
            <div key={k} className="flex h-full flex-1 items-end" title={`${data[String(k)]} players at ${k}`}>
              <div className="w-full rounded-sm bg-lime-400/80" style={{ height: `${Math.max(3, (data[String(k)] / max) * 80)}px` }} />
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-1">
        <div className="w-6" aria-hidden="true" />
        <div className="flex flex-1 gap-1">
          {keys.map((k) => (
            <span key={k} className="tnum flex-1 text-center text-[10px] text-neutral-500">{k}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function WinnerModal({
  events,
  onClose,
  onChanged,
}: {
  events: WinEventShape[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [verifying, setVerifying] = useState<WinEventShape | null>(null);
  const [verifyData, setVerifyData] = useState<{ grid: number[]; drawn: number[]; missing: number[]; valid: boolean; message: string } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  if (events.length === 0) return null;

  const placingMedal = (placing: number) => {
    if (placing === 1) return '🥇';
    if (placing === 2) return '🥈';
    if (placing === 3) return '🥉';
    return `#${placing}`;
  };

  const placingLabel = (placing: number) => {
    if (placing === 1) return '1st Prize';
    if (placing === 2) return '2nd Prize';
    if (placing === 3) return '3rd Prize';
    return `${placing}th Prize`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="alertdialog" aria-label="Winner detected">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl border border-lime-400 bg-neutral-900 p-5">
        <h2 className="text-xl font-black text-lime-300">🎉 Winner detected — confirm or reject</h2>
        {events.map((e) => (
          <div key={e.id} className="mt-3 rounded-lg border border-neutral-700 p-3">
            <div className="flex items-center gap-2">
              <span className="text-3xl">{placingMedal(e.placing)}</span>
              <div>
                <p className="font-bold">
                  {e.players.map((p) => `${p.name} (#${String(p.serial ?? 0).padStart(3, '0')})`).join(' & ')}
                </p>
                <p className="tnum text-sm text-neutral-400">
                  {placingLabel(e.placing)} · Rule: {e.rule} · Draw #{e.drawSeq}
                </p>
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="rounded-lg border border-neutral-600 px-3 py-1.5 text-sm"
                onClick={() => {
                  setVerifying(e);
                  setVerifyData(null);
                  const serial = e.players[0]?.serial;
                  if (serial != null) {
                    void apiFetch<{ grid: number[]; drawn: number[]; missing: number[]; valid: boolean; message: string }>('/api/v1/admin/verify-claim', {
                      method: 'POST',
                      body: JSON.stringify({ serial }),
                    }).then(setVerifyData);
                  }
                }}
              >
                Verify card
              </button>
              <button
                type="button"
                className="rounded-lg bg-lime-400 px-3 py-1.5 text-sm font-bold text-neutral-950"
                onClick={() => setConfirmId(e.id)}
              >
                Confirm winner(s)
              </button>
              <button
                type="button"
                className="rounded-lg border border-red-800 px-3 py-1.5 text-sm text-red-300"
                onClick={() => {
                  void apiFetch(`/api/v1/admin/wins/${e.id}/reject`, { method: 'POST' }).then(() => onChanged());
                }}
              >
                Reject
              </button>
            </div>
            {verifying?.id === e.id && (
              <div className="mt-3">
                {verifyData ? (
                  <>
                    <CardGrid grid={verifyData.grid} marked={verifyData.drawn} size="sm" />
                    <p className="mt-2 text-sm font-bold">{verifyData.message}</p>
                  </>
                ) : (
                  <p className="text-sm text-neutral-500">Loading card…</p>
                )}
              </div>
            )}
          </div>
        ))}
        <button type="button" onClick={onClose} className="mt-4 rounded-lg border border-neutral-700 px-4 py-2 text-sm">
          Close
        </button>
      </div>
      <ConfirmDialog
        open={confirmId != null}
        title="Confirm winner(s)?"
        body="The public board will show the winner banner. Only confirm after physical verification."
        confirmLabel="Confirm"
        onCancel={() => setConfirmId(null)}
        onConfirm={() => {
          if (confirmId) void apiFetch(`/api/v1/admin/wins/${confirmId}/confirm`, { method: 'POST' }).then(() => onChanged());
          setConfirmId(null);
        }}
      />
    </div>
  );
}
