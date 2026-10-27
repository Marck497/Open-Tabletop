import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { CampaignDetail, CampaignSummary } from '@vtt/shared';
import { api } from '../../core/api';
import { TopBar } from '../../components/TopBar';
import { restoreBackup } from '../backup/restore';
import { lang, tr } from '../../core/i18n';

export function CampaignsPage() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    api.get<{ campaigns: CampaignSummary[] }>('/campaigns').then((r) => setCampaigns(r.campaigns), (e) => setError(e.message));
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      const { campaign } = await api.post<{ campaign: CampaignDetail }>('/campaigns', { name, lang });
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

  async function restore(file: File | undefined) {
    if (!file) return;
    setRestoring(true);
    setError(null);
    try {
      const summary = await restoreBackup(file);
      if (summary.skippedAssets) alert(tr('Restaurada, pero {skippedAssets} archivos no venían en la copia o no eran válidos.', { skippedAssets: summary.skippedAssets }));
      navigate(`/c/${summary.campaignId}`);
    } catch (err) {
      setError((err as Error).message);
      setRestoring(false);
    }
  }

  return (
    <>
      <TopBar />
      <main className="container">
        <h1>{tr('Tus partidas')}</h1>
        {error && <p className="error">{error}</p>}
        {campaigns === null ? (
          <p className="muted">{tr('Cargando…')}</p>
        ) : campaigns.length === 0 ? (
          <p className="muted">{tr('Todavía no estás en ninguna partida. Crea una o únete con un código.')}</p>
        ) : (
          <ul className="campaign-grid">
            {campaigns.map((c) => (
              <li key={c.id}>
                <Link to={`/c/${c.id}`} className="card campaign-card">
                  <strong>{c.name}</strong>
                  <span className={`badge ${c.role}`}>{c.role === 'gm' ? 'DM' : tr('Jugador')}</span>
                  {c.description && <p className="muted">{c.description}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="two-cols">
          <form className="card" onSubmit={create}>
            <h2>{tr('Nueva partida')}</h2>
            <label>
              {tr('Nombre')}
              <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder={tr('La Mina Perdida de Phandelver')} />
            </label>
            <button className="primary">{tr('Crear (serás el DM)')}</button>
          </form>
          <form className="card" onSubmit={join}>
            <h2>{tr('Unirse a una partida')}</h2>
            <label>
              {tr('Código de invitación')}
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required placeholder="ABCD2345" />
            </label>
            <button>{tr('Unirse')}</button>
          </form>
        </div>
        <div className="card restore-card">
          <h2>{tr('Restaurar una copia de seguridad')}</h2>
          <p className="muted">{tr('Crea una partida nueva a partir de un archivo')}{' '}<code>.vtt.json.gz</code>{' '}{tr('descargado desde la pestaña Ajustes de la mesa. Serás su DM; luego invita otra vez a los jugadores.')}</p>
          <label className="button-like">
            {restoring ? tr('Restaurando…') : tr('⬆ Elegir archivo')}
            <input type="file" accept=".gz,.json,application/gzip,application/json" hidden disabled={restoring} onChange={(e) => void restore(e.target.files?.[0])} />
          </label>
        </div>
      </main>
    </>
  );
}
