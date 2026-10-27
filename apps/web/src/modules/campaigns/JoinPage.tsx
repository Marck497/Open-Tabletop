import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { CampaignSummary } from '@vtt/shared';
import { api } from '../../core/api';
import { tr } from '../../core/i18n';

/** Enlace de invitación: /join/CODIGO une al usuario y lo lleva a la partida. */
export function JoinPage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .post<{ campaign: CampaignSummary }>('/campaigns/join', { inviteCode: code })
      .then(({ campaign }) => navigate(`/c/${campaign.id}`, { replace: true }), (e) => setError(e.message));
  }, [code, navigate]);

  return (
    <main className="container">
      {error ? (
        <>
          <p className="error">{error}</p>
          <button onClick={() => navigate('/')}>{tr('Volver')}</button>
        </>
      ) : (
        <p className="muted">{tr('Uniéndote a la partida…')}</p>
      )}
    </main>
  );
}
