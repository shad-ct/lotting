import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useMe } from '../api/hooks.js';
import { apiFetch } from '../api/client.js';
import { MiniDrawBox } from '../pages/DrawConsole.js';

function linkCls({ isActive }: { isActive: boolean }): string {
  return `rounded-lg px-3 py-1.5 text-sm ${isActive ? 'bg-lime-400 font-bold text-neutral-950' : 'text-neutral-300 hover:bg-neutral-800'}`;
}

export function AdminLayout() {
  const { data: me, isLoading } = useMe();
  const nav = useNavigate();

  if (isLoading) return <div className="p-6">Checking session…</div>;
  if (!me) {
    nav('/admin/login');
    return null;
  }
  if (me.role !== 'admin') {
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-black">403 — admins only</h1>
        <p className="mt-2 text-sm text-neutral-400">This area requires an admin login.</p>
      </main>
    );
  }

  return (
    <div>
      <header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 p-3">
          <nav className="flex flex-wrap items-center gap-1" aria-label="Admin">
            <NavLink to="/admin" end className={linkCls}>Dashboard</NavLink>
            <NavLink to="/admin/draw" className={linkCls}>Draw</NavLink>
            <NavLink to="/admin/players" className={linkCls}>Players</NavLink>
            <NavLink to="/admin/setup" className={linkCls}>Setup</NavLink>
            <NavLink to="/admin/distribution" className={linkCls}>Distribution</NavLink>
            <NavLink to="/admin/log" className={linkCls}>Log</NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <MiniDrawBox />
            <button
              type="button"
              className="text-xs text-neutral-500 underline"
              onClick={() => {
                void apiFetch('/api/v1/auth/logout', { method: 'POST' }).then(() => nav('/admin/login'));
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}

export function PlayerGuard({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading } = useMe();
  const nav = useNavigate();
  if (isLoading) return <div className="p-6">Checking session…</div>;
  if (!me) {
    nav('/login');
    return null;
  }
  if (me.role !== 'player') {
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-black">403 — players only</h1>
      </main>
    );
  }
  return <>{children}</>;
}
