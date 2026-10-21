import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { CampaignDetail, CampaignSummary } from '@vtt/shared';
import { api } from '../../core/api';
import { TopBar } from '../../components/TopBar';

export function CampaignsPage() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ campaigns: CampaignSummary[] }>('/campaigns').then((r) => setCampaigns(r.campaigns), (e) => setError(e.message));
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      const { campaign } = await api.post<{ campaign: CampaignDetail }>('/campaigns', { name });
      navigate(`/c/${campaign.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function join(e: FormEvent) {
    e.preventDefault();
    try {
      const { campaign } = await api.post<{ campaign: CampaignSummary }>('/campaigns/join', { inviteCode: code });
      navigate(`/c/${campaign.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <TopBar />
      <main className="container">
        <h1>Tus partidas</h1>
        {error && <p className="error">{error}</p>}
        {campaigns === null ? (
          <p className="muted">Cargando…</p>
        ) : campaigns.length === 0 ? (
          <p className="muted">Todavía no estás en ninguna partida. Crea una o únete con un código.</p>
        ) : (
          <ul className="campaign-grid">
            {campaigns.map((c) => (
              <li key={c.id}>
                <Link to={`/c/${c.id}`} className="card campaign-card">
                  <strong>{c.name}</strong>
                  <span className={`badge ${c.role}`}>{c.role === 'gm' ? 'DM' : 'Jugador'}</span>
                  {c.description && <p className="muted">{c.description}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="two-cols">
          <form className="card" onSubmit={create}>
            <h2>Nueva partida</h2>
            <label>
              Nombre
              <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="La Mina Perdida de Phandelver" />
            </label>
            <button className="primary">Crear (serás el DM)</button>
          </form>
          <form className="card" onSubmit={join}>
            <h2>Unirse a una partida</h2>
            <label>
              Código de invitación
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required placeholder="ABCD2345" />
            </label>
            <button>Unirse</button>
          </form>
        </div>
      </main>
    </>
  );
}
