import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch, friendlyMessage } from '../api/client.js';

function useLogin(path: string, to: string) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return {
    error,
    busy,
    async submit(body: object) {
      setBusy(true);
      setError('');
      try {
        await apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
        await qc.invalidateQueries();
        nav(to);
      } catch (e) {
        setError(friendlyMessage(e));
      } finally {
        setBusy(false);
      }
    },
  };
}

export function PlayerLogin() {
  const [loginId, setLoginId] = useState('');
  const [pin, setPin] = useState('');
  const login = useLogin('/api/v1/auth/player/login', '/my-card');
  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-2xl font-black">Player login</h1>
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void login.submit({ loginId, pin });
        }}
      >
        <label className="text-sm">Login ID<input value={loginId} onChange={(e) => setLoginId(e.target.value)} className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 p-2.5" placeholder="P047" autoComplete="username" /></label>
        <label className="text-sm">PIN<input value={pin} onChange={(e) => setPin(e.target.value)} className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 p-2.5" placeholder="6-digit PIN" inputMode="numeric" type="password" autoComplete="current-password" /></label>
        {login.error && <p className="text-sm text-red-400" role="alert">{login.error}</p>}
        <button type="submit" disabled={login.busy} className="rounded-lg bg-lime-400 py-2.5 font-bold text-neutral-950 disabled:opacity-50">
          {login.busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-neutral-500">
        <Link to="/admin/login" className="underline">Admin</Link> · <Link to="/" className="underline">Public board</Link>
      </p>
    </main>
  );
}

export function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin('/api/v1/auth/admin/login', '/admin');
  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-2xl font-black">Admin login</h1>
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void login.submit({ username, password });
        }}
      >
        <label className="text-sm">Username<input value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 p-2.5" autoComplete="username" /></label>
        <label className="text-sm">Password<input value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 p-2.5" type="password" autoComplete="current-password" /></label>
        {login.error && <p className="text-sm text-red-400" role="alert">{login.error}</p>}
        <button type="submit" disabled={login.busy} className="rounded-lg bg-lime-400 py-2.5 font-bold text-neutral-950 disabled:opacity-50">
          {login.busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-neutral-500">
        <Link to="/login" className="underline">Player login</Link>
      </p>
    </main>
  );
}
