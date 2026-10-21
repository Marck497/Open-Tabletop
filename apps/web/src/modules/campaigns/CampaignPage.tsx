import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/store';
import { useCampaign } from './hooks';
import { MembersPanel } from './MembersPanel';
import { InvitePanel } from './InvitePanel';

/**
 * Vista principal de una partida ("la mesa"). El área central alojará el tablero
 * y los paneles laterales (hojas, chat, dados) cuando se añadan esos módulos.
 */
export function CampaignPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const me = useAuth((s) => s.user)!;
  const { campaign, error, online, connected } = useCampaign(id);

  if (error)
    return (
      <main className="container">
        <p className="error">{error}</p>
        <Link to="/">Volver a tus partidas</Link>
      </main>
    );
  if (!campaign) return <main className="container muted">Cargando partida…</main>;

  const isGm = campaign.role === 'gm';

  return (
    <div className="table-layout">
      <header className="table-header">
        <button className="ghost" onClick={() => navigate('/')} title="Volver">
          ←
        </button>
        <h1>{campaign.name}</h1>
        <span className={`badge ${campaign.role}`}>{isGm ? 'DM' : 'Jugador'}</span>
        <span className={`conn ${connected ? 'on' : 'off'}`}>{connected ? 'Conectado' : 'Reconectando…'}</span>
      </header>
      <section className="table-main">
        <div className="board-placeholder">
          <img src="/d20.svg" alt="" width={64} />
          <p>Aquí irá el tablero.</p>
          <p className="muted">Sistema de juego: {campaign.systemId}</p>
        </div>
      </section>
      <aside className="table-side">
        <MembersPanel campaign={campaign} online={online} meId={me.id} />
        {isGm && campaign.inviteCode && <InvitePanel campaignId={campaign.id} inviteCode={campaign.inviteCode} />}
      </aside>
    </div>
  );
}
