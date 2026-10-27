import { useNavigate } from 'react-router-dom';
import type { CampaignDetail, PresenceUser } from '@vtt/shared';
import { api } from '../../core/api';
import { tr } from '../../core/i18n';

interface Props {
  campaign: CampaignDetail;
  online: PresenceUser[];
  meId: string;
}

export function MembersPanel({ campaign, online, meId }: Props) {
  const navigate = useNavigate();
  const onlineIds = new Set(online.map((u) => u.userId));
  const isGm = campaign.role === 'gm';

  async function setRole(userId: string, role: 'gm' | 'player') {
    await api.patch(`/campaigns/${campaign.id}/members/${userId}`, { role });
  }
  async function remove(userId: string) {
    const leaving = userId === meId;
    if (!confirm(leaving ? tr('¿Salir de esta partida?') : tr('¿Expulsar a este jugador?'))) return;
    await api.delete(`/campaigns/${campaign.id}/members/${userId}`);
    if (leaving) navigate('/');
  }

  return (
    <div className="panel">
      <h3>
        {tr('Jugadores')}{' '}<small className="muted">{tr('({n} conectados)', { n: onlineIds.size })}</small>
      </h3>
      <ul className="members">
        {campaign.members.map((m) => {
          const isOwner = m.id === campaign.ownerId;
          return (
            <li key={m.id}>
              <span className={`dot ${onlineIds.has(m.id) ? 'on' : ''}`} title={onlineIds.has(m.id) ? tr('Conectado') : tr('Desconectado')} />
              <span className="member-name">
                {m.displayName}
                {m.id === meId && <small className="muted">{' '}{tr('(tú)')}</small>}
              </span>
              <span className={`badge ${m.role}`}>{m.role === 'gm' ? 'DM' : tr('Jugador')}</span>
              {isGm && !isOwner && m.id !== meId && (
                <span className="member-actions">
                  <button className="ghost small" onClick={() => setRole(m.id, m.role === 'gm' ? 'player' : 'gm')}>
                    {m.role === 'gm' ? tr('Quitar DM') : tr('Hacer DM')}
                  </button>
                  <button className="ghost small danger" onClick={() => remove(m.id)}>
                    {tr('Expulsar')}
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {campaign.ownerId !== meId && (
        <button className="ghost small danger" onClick={() => remove(meId)}>
          {tr('Salir de la partida')}
        </button>
      )}
    </div>
  );
}
