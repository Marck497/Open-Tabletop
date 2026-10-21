import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthPage } from './modules/auth/AuthPage';
import { RequireAuth } from './modules/auth/RequireAuth';
import { useAuth } from './modules/auth/store';
import { CampaignPage } from './modules/campaigns/CampaignPage';
import { CampaignsPage } from './modules/campaigns/CampaignsPage';
import { JoinPage } from './modules/campaigns/JoinPage';

export function App() {
  const { loading, init } = useAuth();
  useEffect(() => {
    void init();
  }, [init]);

  if (loading) return <main className="container muted">Cargando…</main>;

  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/" element={<RequireAuth><CampaignsPage /></RequireAuth>} />
      <Route path="/join/:code" element={<RequireAuth><JoinPage /></RequireAuth>} />
      <Route path="/c/:id" element={<RequireAuth><CampaignPage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
