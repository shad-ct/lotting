import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { qk } from '../api/hooks.js';

/**
 * Single socket owner (04 §1). Server data lives in TanStack Query; sockets
 * only invalidate the cache. Gap detection: every payload carries lastSeq —
 * a jump of >1 (or any reconnect) triggers a full snapshot refetch.
 */
export function useLiveSync(opts?: { onWinDetected?: () => void }) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const lastSeq = useRef(0);
  const onWin = useRef(opts?.onWinDetected);
  onWin.current = opts?.onWinDetected;

  useEffect(() => {
    const socket: Socket = io({ withCredentials: true, reconnection: true, transports: ['polling'] });

    const refetchAll = () => {
      void qc.invalidateQueries({ queryKey: qk.board });
      void qc.invalidateQueries({ queryKey: qk.myCard });
      void qc.invalidateQueries({ queryKey: qk.status });
      void qc.invalidateQueries({ queryKey: qk.draws });
      void qc.invalidateQueries({ queryKey: ['adminGame'] });
    };

    const checkGap = (seq: number) => {
      if (lastSeq.current > 0 && seq > lastSeq.current + 1) refetchAll();
      lastSeq.current = Math.max(lastSeq.current, seq);
    };

    socket.on('connect', () => {
      setConnected(true);
      lastSeq.current = 0;
      refetchAll(); // reconnect → resync (REST is the source of truth)
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('draw:new', (p: { seq: number }) => {
      checkGap(p.seq);
      void qc.invalidateQueries({ queryKey: qk.board });
      void qc.invalidateQueries({ queryKey: qk.myCard });
      void qc.invalidateQueries({ queryKey: qk.status });
      void qc.invalidateQueries({ queryKey: qk.draws });
    });
    socket.on('draw:undone', (p: { seq: number }) => {
      checkGap(p.seq);
      refetchAll();
    });
    socket.on('me:update', (p: { lastSeq?: number }) => {
      if (typeof p?.lastSeq === 'number') checkGap(p.lastSeq);
      void qc.invalidateQueries({ queryKey: qk.myCard });
    });
    socket.on('admin:snapshot', () => {
      void qc.invalidateQueries({ queryKey: qk.status });
      void qc.invalidateQueries({ queryKey: qk.draws });
    });
    socket.on('win:detected', () => {
      void qc.invalidateQueries({ queryKey: qk.status });
      onWin.current?.();
    });
    socket.on('win:confirmed', refetchAll);
    socket.on('game:status', refetchAll);

    return () => {
      socket.disconnect();
    };
  }, [qc]);

  return { connected, lastSeq: lastSeq.current };
}
