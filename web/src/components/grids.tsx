import { cn } from '../lib/utils.js';

/** Pure 1..110 board (04 §7). Props-driven so it ports 1:1 to Flutter later. */
export function NumberGrid({
  maxNumber = 110,
  drawn = new Set<number>(),
  last = null,
  onPick,
  disabledNumbers,
  popNumber,
}: {
  maxNumber?: number;
  drawn?: Set<number> | number[];
  last?: number | null;
  onPick?: (n: number) => void;
  disabledNumbers?: Set<number>;
  popNumber?: number | null;
}) {
  const drawnSet = drawn instanceof Set ? drawn : new Set(drawn);
  const cells = Array.from({ length: maxNumber }, (_, i) => i + 1);
  return (
    <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10" role="grid" aria-label="Draw board">
      {cells.map((n) => {
        const isDrawn = drawnSet.has(n);
        const isLast = n === last;
        const disabled = disabledNumbers?.has(n) ?? (onPick ? isDrawn : false);
        const cls = cn(
          'tnum flex aspect-square items-center justify-center rounded-md text-sm font-bold sm:text-base',
          'border transition-colors focus-visible:outline-accent',
          isDrawn
            ? 'border-lime-400 bg-lime-400 text-neutral-950'
            : 'border-neutral-700 bg-neutral-900 text-neutral-300',
          isLast && 'ring-2 ring-white ring-offset-2 ring-offset-neutral-950',
          n === popNumber && 'cell-pop',
          onPick && !disabled && 'cursor-pointer hover:border-lime-400',
          disabled && onPick && 'cursor-not-allowed opacity-60',
        );
        const label = `Number ${n}${isDrawn ? ', drawn' : ''}`;
        return onPick ? (
          <button key={n} type="button" aria-label={label} disabled={disabled} onClick={() => onPick(n)} className={cls}>
            {n}
          </button>
        ) : (
          <div key={n} role="gridcell" aria-label={label} className={cls}>
            {n}
          </div>
        );
      })}
    </div>
  );
}

/** Pure 4×4 card (04 §7). Marked = accent fill + bold + ✓ ring (never colour alone). */
export function CardGrid({
  grid,
  marked = new Set<number>(),
  highlight = null,
  size = 'md',
}: {
  grid: number[];
  marked?: Set<number> | number[];
  highlight?: number | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const markedSet = marked instanceof Set ? marked : new Set(marked);
  const text = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-3xl' : 'text-2xl';
  return (
    <div className="grid grid-cols-4 gap-2" role="grid" aria-label="Player card">
      {grid.map((n, i) => {
        const isMarked = markedSet.has(n);
        return (
          <div
            key={i}
            role="gridcell"
            aria-label={`Card number ${n}${isMarked ? ', marked' : ''}`}
            className={cn(
              'tnum relative flex aspect-square items-center justify-center rounded-xl border-2 font-bold',
              text,
              isMarked
                ? 'border-lime-400 bg-lime-400 text-neutral-950'
                : 'border-neutral-700 bg-neutral-900 text-neutral-100',
              n === highlight && 'cell-pop ring-2 ring-white',
            )}
          >
            {n}
            {isMarked && (
              <span aria-hidden className="absolute right-1 top-1 text-sm font-black">
                ✓
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className="h-full rounded-full bg-lime-400 transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function LiveDot({ connected }: { connected: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" title={connected ? 'Live' : 'Reconnecting'}>
      <span className={cn('inline-block h-2 w-2 rounded-full', connected ? 'bg-lime-400' : 'bg-neutral-500')} aria-hidden />
      <span className="text-neutral-400">{connected ? '● Live' : '○ Reconnecting…'}</span>
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-700 p-8 text-center">
      <p className="font-semibold text-neutral-300">{title}</p>
      {hint && <p className="mt-1 text-sm text-neutral-500">{hint}</p>}
    </div>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useCopyState();
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => setDone(true));
      }}
      className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-lime-400"
    >
      {done ? 'Copied!' : label}
    </button>
  );
}

import { useEffect, useState } from 'react';
function useCopyState(): [boolean, (v: boolean) => void] {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1500);
    return () => clearTimeout(t);
  }, [done]);
  return [done, setDone];
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="alertdialog" aria-label={title}>
      <div className="w-full max-w-sm rounded-xl border border-neutral-700 bg-neutral-900 p-5">
        <h2 className="text-lg font-bold">{title}</h2>
        {body && <p className="mt-2 text-sm text-neutral-400">{body}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm">
            Cancel (Esc)
          </button>
          <button type="button" onClick={onConfirm} className="rounded-lg bg-lime-400 px-4 py-2 text-sm font-bold text-neutral-950">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
