import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminLayout, PlayerGuard } from './components/AdminLayout.js';
import { AdminLogin, PlayerLogin } from './pages/Login.js';
import { AdminDashboard } from './pages/AdminDashboard.js';
import { Distribution } from './pages/Distribution.js';
import { DrawConsole } from './pages/DrawConsole.js';
import { LogPage } from './pages/LogPage.js';
import { MyCard } from './pages/MyCard.js';
import { PlayerDetail, Players } from './pages/Players.js';
import { PublicBoard } from './pages/PublicBoard.js';
import { Setup } from './pages/Setup.js';

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 2000 } },
});

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<PublicBoard />} />
          <Route path="/login" element={<PlayerLogin />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/my-card" element={<PlayerGuard><MyCard /></PlayerGuard>} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="draw" element={<DrawConsole />} />
            <Route path="players" element={<Players />} />
            <Route path="players/:id" element={<PlayerDetail />} />
            <Route path="setup" element={<Setup />} />
            <Route path="distribution" element={<Distribution />} />
            <Route path="log" element={<LogPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
