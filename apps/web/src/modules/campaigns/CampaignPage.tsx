import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getSocket } from '../../core/socket';
import { useAuth } from '../auth/store';
import { Board } from '../board/Board';
import { ItemPanel } from '../board/ItemPanel';
import { ScenesPanel } from '../board/ScenesPanel';
import { Toolbar } from '../board/Toolbar';
import { useBoard } from '../board/store';
import { useSceneSync } from '../board/useSceneSync';
import { RollToasts } from '../dice/RollToasts';
import { CharacterSheet } from '../sheets/CharacterSheet';
import { CharactersPanel } from '../sheets/CharactersPanel';
import { useSheets } from '../sheets/store';
import { TemplateEditor } from '../sheets/TemplateEditor';
import { useSheetsSync } from '../sheets/useSheetsSync';
import { useCampaign } from './hooks';
import { InvitePanel } from './InvitePanel';
import { MembersPanel } from './MembersPanel';

/**
 * Vista principal de una partida ("la mesa"): tablero en el centro y paneles a la derecha.
 * Los futuros módulos (hojas, chat, dados) se montan aquí como paneles nuevos.
 */
export function CampaignPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const me = useAuth((s) => s.user)!;
  const { campaign, error, online, connected } = useCampaign(id);
  const isGm = campaign?.role === 'gm';

  // El DM puede abrir cualquier escena sin mover a los jugadores; los jugadores ven la activa.
  const [gmSceneId, setGmSceneId] = useState<string | null>(null);
  useEffect(() => {
    if (isGm && !gmSceneId && campaign?.activeSceneId) setGmSceneId(campaign.activeSceneId);
  }, [isGm, gmSceneId, campaign?.activeSceneId]);
  useEffect(() => {
    // Si borran la escena que el DM estaba mirando, volver a la de los jugadores.
    const onRemoved = ({ sceneId }: { sceneId: string }) => setGmSceneId((cur) => (cur === sceneId ? null : cur));
    const socket = getSocket();
    socket.on('scene:removed', onRemoved);
    return () => void socket.off('scene:removed', onRemoved);
  }, []);
  const viewingSceneId = campaign ? (isGm ? gmSceneId ?? campaign.activeSceneId : campaign.activeSceneId) : null;

  const { error: sceneError } = useSceneSync(viewingSceneId);
  useSheetsSync(id);
  const template = useSheets((s) => s.template);
  const openSheets = useSheets((s) => s.open);
  const characters = useSheets((s) => s.characters);
  const [editingTemplate, setEditingTemplate] = useState(false);
  const scene = useBoard((s) => s.scene);
  const hasSelection = useBoard((s) => Boolean(s.selectedId));

  useEffect(() => () => useBoard.getState().clear(), []);

  if (error)
    return (
      <main className="container">
        <p className="error">{error}</p>
        <Link to="/">Volver a tus partidas</Link>
      </main>
    );
  if (!campaign) return <main className="container muted">Cargando partida…</main>;

  return (
    <div className="table-layout">
      <header className="table-header">
        <button className="ghost" onClick={() => navigate('/')} title="Volver">
          ←
        </button>
        <h1>{campaign.name}</h1>
        <span className={`badge ${campaign.role}`}>{isGm ? 'DM' : 'Jugador'}</span>
        {scene && <span className="muted scene-title">· {scene.name}</span>}
        {isGm && scene && scene.id !== campaign.activeSceneId && <span className="badge warn">Los jugadores no ven esta escena</span>}
        <span className={`conn ${connected ? 'on' : 'off'}`}>{connected ? 'Conectado' : 'Reconectando…'}</span>
      </header>
      {isGm && <Toolbar campaignId={campaign.id} />}
      <section className="table-main">
        {viewingSceneId ? (
          <>
            <Board isGm={isGm} meId={me.id} />
            {sceneError && <p className="board-error error">{sceneError}</p>}
          </>
        ) : (
          <div className="board-placeholder">
            <img src="/d20.svg" alt="" width={64} />
            <p>{isGm ? 'Crea una escena en el panel de la derecha.' : 'El DM todavía no ha abierto ninguna escena.'}</p>
          </div>
        )}
        {template &&
          openSheets.map((cid, i) =>
            characters[cid] ? (
              <CharacterSheet key={cid} index={i} character={characters[cid]} template={template} isGm={isGm} meId={me.id} members={campaign.members} />
            ) : null,
          )}
        <RollToasts campaignId={campaign.id} />
      </section>
      <aside className="table-side">
        {isGm && hasSelection && <ItemPanel campaignId={campaign.id} members={campaign.members} />}
        {isGm && (
          <ScenesPanel campaignId={campaign.id} activeSceneId={campaign.activeSceneId} viewingId={viewingSceneId} onView={setGmSceneId} />
        )}
        <CharactersPanel campaignId={campaign.id} isGm={isGm} meId={me.id} onEditTemplate={() => setEditingTemplate(true)} />
        <MembersPanel campaign={campaign} online={online} meId={me.id} />
        {isGm && campaign.inviteCode && <InvitePanel campaignId={campaign.id} inviteCode={campaign.inviteCode} />}
      </aside>
      {editingTemplate && template && <TemplateEditor campaignId={campaign.id} template={template} onClose={() => setEditingTemplate(false)} />}
    </div>
  );
}
