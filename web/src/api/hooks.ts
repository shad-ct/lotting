import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client.js';
import type { BoardData, MeData, MyCardData, StatusData } from './types.js';

export const qk = {
  me: ['me'],
  board: ['board'],
  myCard: ['myCard'],
  status: ['adminStatus'],
  players: ['adminPlayers'],
  draws: ['adminDraws'],
  audit: ['adminAudit'],
};

export function useMe() {
  return useQuery({ queryKey: qk.me, queryFn: () => apiFetch<MeData>('/api/v1/auth/me'), retry: false });
}

export function useBoard(refetchMs = 10000) {
  return useQuery({
    queryKey: qk.board,
    queryFn: () => apiFetch<BoardData>('/api/v1/public/board'),
    refetchInterval: refetchMs,
  });
}

export function useMyCard() {
  return useQuery({ queryKey: qk.myCard, queryFn: () => apiFetch<MyCardData>('/api/v1/me/card') });
}

export function useAdminStatus(params?: { q?: string; sort?: string; full?: boolean }) {
  const search = new URLSearchParams();
  if (params?.q) search.set('q', params.q);
  if (params?.sort) search.set('sort', params.sort);
  if (params?.full) search.set('full', '1');
  const qs = search.toString();
  return useQuery({
    queryKey: [...qk.status, qs],
    queryFn: () => apiFetch<StatusData>(`/api/v1/admin/status${qs ? `?${qs}` : ''}`),
  });
}

export function useAdminGame() {
  return useQuery({
    queryKey: ['adminGame'],
    queryFn: () => apiFetch<{ id: string; name: string; status: string; maxNumber: number; cardSize: number; playerCount: number; winRules: unknown; generationStats: unknown }>('/api/v1/admin/game'),
    retry: false,
  });
}

export function useAdminPlayers() {
  return useQuery({
    queryKey: qk.players,
    queryFn: () => apiFetch<{ items: { id: string; serial: number; name: string; phone: string | null; loginId: string; isActive: boolean; hasPin: boolean; hasCard: boolean; cardImageSentAt: string | null; credentialsSentAt: string | null }[]; total: number }>('/api/v1/admin/players'),
  });
}

export function useDrawLog() {
  return useQuery({
    queryKey: qk.draws,
    queryFn: () => apiFetch<{ items: { seq: number; number: number; source: string; drawnAt: string; isActive: boolean; undoneAt: string | null; undoReason: string | null }[]; total: number }>('/api/v1/admin/draws'),
  });
}

export function useAuditLog() {
  return useQuery({
    queryKey: qk.audit,
    queryFn: () => apiFetch<{ items: { at: string; actor: string; action: string; payload: unknown }[]; total: number }>('/api/v1/admin/audit'),
  });
}

export function useAdminMutation<T>(fn: (vars: T) => Promise<unknown>, invalidate: string[][] = [qk.status, qk.draws, qk.board, qk.players]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of invalidate) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

export const adminApi = {
  draw: (number: number, key?: string) =>
    apiFetch('/api/v1/admin/draws', {
      method: 'POST',
      body: JSON.stringify({ number }),
      headers: key ? { 'Idempotency-Key': key } : {},
    }),
  randomDraw: (key?: string) =>
    apiFetch('/api/v1/admin/draws/random', {
      method: 'POST',
      body: '{}',
      headers: key ? { 'Idempotency-Key': key } : {},
    }),
  undo: (reason?: string) =>
    apiFetch('/api/v1/admin/draws/undo', { method: 'POST', body: JSON.stringify({ reason }) }),
};
