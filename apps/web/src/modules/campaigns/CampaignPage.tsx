import { useEffect, useState, type CSSProperties } from 'react';
import type { CampaignMember } from '@vtt/shared';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getSocket } from '../../core/socket';
import { useAuth } from '../auth/store';
import { Board } from '../board/Board';
import { ItemPanel } from '../board/ItemPanel';
import { SceneSwitcher } from '../board/SceneTree';
import { ScenesPanel } from '../board/ScenesPanel';
import { Toolbar } from '../board/Toolbar';
import { StatusBar } from '../board/StatusBar';
import { useBoard } from '../board/store';
import { useSceneSync } from '../board/useSceneSync';
import { ChatPanel } from '../chat/ChatPanel';
import { RollToasts } from '../dice/RollToasts';
import { DiceTray } from '../dice3d/DiceTray';
import { Shortcuts } from '../shortcuts/Shortcuts';
import { CritFx, FxPanel } from '../dice/CritFx';
import { SfxListener } from '../sfx/SfxListener';
import { InitiativeAnnounce, InitiativeTracker, TurnBanner } from '../initiative/InitiativeTracker';
import { useInitiativeSync } from '../initiative/useInitiativeSync';
import { HandoutWindow } from '../journal/HandoutWindow';
import { JournalPanel } from '../journal/JournalPanel';
import { useHomebrewSync } from '../homebrew/store';
import { useJournalSync } from '../journal/useJournalSync';
import { MacroBar } from '../macros/MacroBar';
import { JukeboxPanel } from '../jukebox/JukeboxPanel';
import { BackupPanel } from '../backup/BackupPanel';
import { PerformancePanel } from '../performance/PerformancePanel';
import { JukeboxPlayer } from '../jukebox/JukeboxPlayer';
import { CharacterSheet } from '../sheets/CharacterSheet';
import { CharactersPanel } from '../sheets/CharactersPanel';
import { useSheets } from '../sheets/store';
import { TemplateEditor } from '../sheets/TemplateEditor';
import { useSheetsSync } from '../sheets/useSheetsSync';
import { SideResizer, SideToggle } from '../layout/SideControls';
import { useLayout } from '../layout/store';
import { sidebarTabs } from '../layout/tabs';
import { useUnread } from '../layout/unread';
import { useTutorial } from '../tutorial/store';
import { TutorialOverlay } from '../tutorial/TutorialOverlay';
import { useCampaign } from './hooks';
import { InvitePanel } from './InvitePanel';
import { CampaignLangPanel } from './CampaignLangPanel';
import { MembersPanel } from './MembersPanel';
import { tr } from '../../core/i18n';

/**
 * Vista principal de una partida ("la mesa"): tablero en el centro y pestañas a la derecha.
 * Cada módulo nuevo puede añadir aquí su pestaña o su ventana flotante.
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
  const viewingSceneId = campaign ? (isGm ? (gmSceneId ?? campaign.activeSceneId) : campaign.activeSceneId) : null;

  const { error: sceneError } = useSceneSync(viewingSceneId);
  useSheetsSync(id);
  useInitiativeSync(id);
  useJournalSync(id);
  useHomebrewSync(id);
  const scene = useBoard((s) => s.scene);
  const hasSelection = useBoard((s) => Boolean(s.selectedId));
  const template = useSheets((s) => s.template);
  const openSheets = useSheets((s) => s.open);
  const characters = useSheets((s) => s.characters);
  const [editingTemplate, setEditingTemplate] = useState(false);
  const tab = useLayout((s) => s.tab);
  const setTab = useLayout((s) => s.setTab);
  const sideWidth = useLayout((s) => s.sideWidth);
  const sideHidden = useLayout((s) => s.sideHidden);
  // El recorrido guiado abre la pestaña de la que habla cada paso (y la barra lateral) y, al acabar, vuelve a la de antes.
  const tourTab = useTutorial((s) => s.steps?.[s.index]?.tab);
  const touring = useTutorial((s) => Boolean(s.steps));
  useEffect(() => {
    const layout = useLayout.getState();
    if (tourTab) {
      layout.setTab(tourTab, false);
      layout.toggleSide(false);
    } else if (!touring) layout.restoreTab();
  }, [tourTab, touring]);
  const tabs = sidebarTabs(isGm);
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'chat';
  const unread = useUnread(id, me.id, isGm, sideHidden ? null : activeTab);
  const unreadTotal = Object.values(unread).reduce((a, b) => a + (b ?? 0), 0);
  useEffect(() => () => useTutorial.getState().close(), []);

  useEffect(() => () => useBoard.getState().clear(), []);

  if (error)
    return (
      <main className="container">
        <p className="error">{error}</p>
        <Link to="/">{tr('Volver a tus partidas')}</Link>
      </main>
    );
  if (!campaign) return <main className="container muted">{tr('Cargando partida…')}</main>;

  return (
    <div className={`table-layout ${sideHidden ? 'side-hidden' : ''}`} style={{ '--side-w': `${sideWidth}px` } as CSSProperties}>
      <header className="table-header">
        <button className="ghost" onClick={() => navigate('/')} title={tr('Volver')}>
          ←
        </button>
        <h1>{campaign.name}</h1>
        <span className={`badge ${campaign.role}`}>{isGm ? 'DM' : tr('Jugador')}</span>
        {isGm ? (
          <SceneSwitcher campaignId={campaign.id} current={scene} members={campaign.members} partySceneId={campaign.activeSceneId} viewingId={viewingSceneId} onView={setGmSceneId} />
        ) : (
          scene && <span className="muted scene-title">· {scene.name}</span>
        )}
        {isGm && scene && <ScenePresence sceneId={scene.id} members={campaign.members} partySceneId={campaign.activeSceneId} />}
        <span className={`conn ${connected ? 'on' : 'off'}`}>{connected ? tr('Conectado') : tr('Reconectando…')}</span>
        <SideToggle unread={unreadTotal} />
      </header>
      {scene && <Toolbar campaignId={campaign.id} isGm={isGm} />}
      <section className="table-main" data-tour="board">
        {viewingSceneId ? (
          <>
            <Board isGm={isGm} meId={me.id} />
            <StatusBar isGm={isGm} meId={me.id} />
            <MacroBar campaignId={campaign.id} isGm={isGm} meId={me.id} />
            {sceneError && <p className="board-error error">{sceneError}</p>}
          </>
        ) : (
          <div className="board-placeholder">
            <img src="/d20.svg" alt="" width={64} />
            <p>{isGm ? tr('Crea una escena en la pestaña Escenas.') : tr('El DM todavía no ha abierto ninguna escena.')}</p>
          </div>
        )}
        <InitiativeTracker campaignId={campaign.id} isGm={isGm} meId={me.id} />
        <TurnBanner meId={me.id} />
        <InitiativeAnnounce meId={me.id} />
        {template &&
          openSheets.map((cid, i) =>
            characters[cid] ? (
              <CharacterSheet key={cid} index={i} character={characters[cid]} template={template} isGm={isGm} meId={me.id} members={campaign.members} />
            ) : null,
          )}
        {(sideHidden || activeTab !== 'chat') && <RollToasts campaignId={campaign.id} />}
        <DiceTray campaignId={campaign.id} />
        <Shortcuts campaignId={campaign.id} isGm={isGm} meId={me.id} />
        <CritFx campaignId={campaign.id} />
        <SfxListener campaignId={campaign.id} />
      </section>
      <aside className="table-side" hidden={sideHidden}>
        <SideResizer />
        {isGm && hasSelection && <ItemPanel campaignId={campaign.id} members={campaign.members} />}
        <nav className="tabs" role="tablist">
          {tabs.map((t, i) => {
            const label = t.id === 'table' ? `${t.label} (${online.length})` : t.label;
            const count = unread[t.id] ?? 0;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={activeTab === t.id}
                aria-label={count ? tr('{label}: {count} sin leer', { label, count }) : label}
                className={activeTab === t.id ? 'active' : ''}
                title={tr('{label} (Mayús+{1})', { label, '1': i + 1 })}
                onClick={() => setTab(t.id)}
              >
                <span className="tab-icon" aria-hidden>
                  {t.icon}
                </span>
                <span className="tab-label">{label}</span>
                {count > 0 && <span className="unread">{count > 99 ? '99+' : count}</span>}
              </button>
            );
          })}
        </nav>
        <div className="tab-body" data-tour={activeTab}>
          {activeTab === 'chat' && <ChatPanel campaignId={campaign.id} isGm={isGm} meId={me.id} members={campaign.members} />}
          {activeTab === 'characters' && (
            <CharactersPanel campaignId={campaign.id} isGm={isGm} meId={me.id} members={campaign.members} onEditTemplate={() => setEditingTemplate(true)} />
          )}
          {activeTab === 'journal' && <JournalPanel campaignId={campaign.id} isGm={isGm} />}
          {activeTab === 'scenes' && isGm && (
            <ScenesPanel campaignId={campaign.id} activeSceneId={campaign.activeSceneId} viewingId={viewingSceneId} members={campaign.members} onView={setGmSceneId} />
          )}
          {activeTab === 'table' && (
            <>
              <MembersPanel campaign={campaign} online={online} meId={me.id} />
              <JukeboxPanel campaignId={campaign.id} isGm={isGm} />
              <FxPanel />
            </>
          )}
          {activeTab === 'settings' && isGm && (
            <>
              {campaign.inviteCode && <InvitePanel campaignId={campaign.id} inviteCode={campaign.inviteCode} />}
              <CampaignLangPanel campaignId={campaign.id} lang={campaign.lang} />
              <BackupPanel campaignId={campaign.id} />
              <PerformancePanel campaignId={campaign.id} />
            </>
          )}
        </div>
      </aside>
      <JukeboxPlayer campaignId={campaign.id} />
      <HandoutWindow campaignId={campaign.id} isGm={isGm} members={campaign.members} />
      <TutorialOverlay />
      {editingTemplate && template && <TemplateEditor campaignId={campaign.id} template={template} onClose={() => setEditingTemplate(false)} />}
    </div>
  );
}

/** Quién de los jugadores ve la escena que tiene abierta el DM. */
function ScenePresence({ sceneId, members, partySceneId }: { sceneId: string; members: CampaignMember[]; partySceneId: string | null }) {
  const players = members.filter((m) => m.role === 'player');
  const here = players.filter((p) => (p.sceneId ?? partySceneId) === sceneId);
  if (!players.length) return null;
  if (!here.length) return <span className="badge warn">{tr('Ningún jugador ve esta escena')}</span>;
  if (here.length === players.length) return <span className="badge">{tr('Toda la party está aquí')}</span>;
  return <span className="badge">{tr('Aquí:')}{' '}{here.map((p) => p.displayName).join(', ')}</span>;
}
