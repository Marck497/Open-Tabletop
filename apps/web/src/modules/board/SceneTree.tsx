import { useEffect, useState } from 'react';
import { buildSceneTree, folderCycle, userColor, type CampaignMember, type Scene, type SceneFolder, type SceneTreeNode } from '@vtt/shared';
import { api } from '../../core/api';
import { getSocket } from '../../core/socket';

const COLLAPSED_KEY = 'vtt:sceneFolders:collapsed';
const SCENE_MIME = 'application/x-vtt-scene';
const FOLDER_MIME = 'application/x-vtt-folder';
const byOrder = <T extends { sortOrder: number; name: string }>(a: T, b: T) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

/** Escenas y carpetas de la partida, siempre al día. */
export function useSceneList(campaignId: string) {
  const [list, setList] = useState<{ scenes: Scene[]; folders: SceneFolder[] }>({ scenes: [], folders: [] });
  useEffect(() => {
    const load = () => api.get<{ scenes: Scene[]; folders: SceneFolder[] }>(`/campaigns/${campaignId}/scenes`).then((r) => setList({ scenes: r.scenes, folders: r.folders ?? [] }));
    void load();
    const onChanged = (p: { campaignId: string }) => p.campaignId === campaignId && void load();
    const socket = getSocket();
    socket.on('scenes:changed', onChanged);
    return () => void socket.off('scenes:changed', onChanged);
  }, [campaignId]);
  return list;
}

function readCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export async function newScene(campaignId: string, count: number, folderId: string | null = null) {
  const name = prompt('Nombre de la escena', `Escena ${count + 1}`);
  if (!name?.trim()) return null;
  const { scene } = await api.post<{ scene: Scene }>(`/campaigns/${campaignId}/scenes`, { name: name.trim(), folderId });
  return scene;
}

export async function newFolder(campaignId: string, parentId: string | null = null) {
  const name = prompt('Nombre de la carpeta', 'Nueva carpeta');
  if (name?.trim()) await api.post(`/campaigns/${campaignId}/scene-folders`, { name: name.trim(), parentId });
}

interface Props {
  campaignId: string;
  scenes: Scene[];
  folders: SceneFolder[];
  members: CampaignMember[];
  /** Escena de la party. */
  partySceneId: string | null;
  viewingId: string | null;
  onView: (sceneId: string) => void;
}

/**
 * Lista de escenas del DM en carpetas: abrir una escena (solo el DM), llevar a toda la party
 * o a unos jugadores, y arrastrar para ordenar o mover entre carpetas.
 */
export function SceneTree({ campaignId, scenes, folders, members, partySceneId, viewingId, onView }: Props) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [moving, setMoving] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; mode: 'before' | 'inside' } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tree = buildSceneTree(folders, scenes);
  const players = members.filter((m) => m.role === 'player');

  function toggleFolder(id: string) {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
    } catch {
      /* sin almacenamiento */
    }
  }

  const send = (body: { scenes?: { id: string; folderId: string | null; sortOrder: number }[]; folders?: { id: string; parentId: string | null; sortOrder: number }[] }) =>
    api.put(`/campaigns/${campaignId}/scene-tree`, body).catch((e: Error) => setError(e.message));

  /** Coloca una escena en una carpeta (al final, o antes de otra escena). */
  function placeScene(id: string, folderId: string | null, beforeId?: string) {
    const moved = scenes.find((s) => s.id === id);
    if (!moved) return;
    const siblings = scenes.filter((s) => (s.folderId ?? null) === folderId && s.id !== id).sort(byOrder);
    const at = beforeId ? siblings.findIndex((s) => s.id === beforeId) : -1;
    siblings.splice(at < 0 ? siblings.length : at, 0, moved);
    void send({ scenes: siblings.map((s, i) => ({ id: s.id, folderId, sortOrder: i })) });
  }

  /** Coloca una carpeta dentro de otra (al final) o antes de otra carpeta. */
  function placeFolder(id: string, parentId: string | null, beforeId?: string) {
    if (folderCycle(folders, id, parentId)) return setError('Una carpeta no puede ir dentro de sí misma.');
    const moved = folders.find((f) => f.id === id);
    if (!moved) return;
    const siblings = folders.filter((f) => (f.parentId ?? null) === parentId && f.id !== id).sort(byOrder);
    const at = beforeId ? siblings.findIndex((f) => f.id === beforeId) : -1;
    siblings.splice(at < 0 ? siblings.length : at, 0, moved);
    void send({ folders: siblings.map((f, i) => ({ id: f.id, parentId, sortOrder: i })) });
  }

  function onDrop(e: React.DragEvent, target: { kind: 'scene'; scene: Scene } | { kind: 'folder'; folder: SceneFolder; mode: 'before' | 'inside' } | { kind: 'root' }) {
    e.preventDefault();
    e.stopPropagation();
    setOver(null);
    setError(null);
    const sceneId = e.dataTransfer.getData(SCENE_MIME);
    const folderId = e.dataTransfer.getData(FOLDER_MIME);
    if (sceneId) {
      if (target.kind === 'scene') placeScene(sceneId, target.scene.folderId ?? null, target.scene.id);
      else if (target.kind === 'folder') placeScene(sceneId, target.mode === 'inside' ? target.folder.id : (target.folder.parentId ?? null));
      else placeScene(sceneId, null);
    } else if (folderId) {
      if (target.kind === 'scene') placeFolder(folderId, target.scene.folderId ?? null);
      else if (target.kind === 'folder') {
        if (target.folder.id === folderId) return;
        if (target.mode === 'inside') placeFolder(folderId, target.folder.id);
        else placeFolder(folderId, target.folder.parentId ?? null, target.folder.id);
      } else placeFolder(folderId, null);
    }
  }

  async function renameFolder(f: SceneFolder) {
    const name = prompt('Nombre de la carpeta', f.name);
    if (name?.trim() && name.trim() !== f.name) await api.patch(`/scene-folders/${f.id}`, { name: name.trim() }).catch((e: Error) => setError(e.message));
  }
  async function deleteFolder(f: SceneFolder) {
    if (!confirm(`¿Borrar la carpeta "${f.name}"? Las escenas que tiene no se borran: pasan a la carpeta de arriba.`)) return;
    await api.delete(`/scene-folders/${f.id}`).catch((e: Error) => setError(e.message));
  }

  function sceneRow(s: Scene, depth: number) {
    const here = players.filter((p) => (p.sceneId ?? partySceneId) === s.id);
    return (
      <li key={s.id} className="scene-node">
        <div
          className={`scene-row ${s.id === viewingId ? 'viewing' : ''} ${over?.id === s.id ? 'drop-before' : ''}`}
          style={{ paddingLeft: depth * 14 }}
          draggable
          onDragStart={(e) => e.dataTransfer.setData(SCENE_MIME, s.id)}
          onDragOver={(e) => {
            e.preventDefault();
            setOver({ id: s.id, mode: 'before' });
          }}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => onDrop(e, { kind: 'scene', scene: s })}
        >
          <button className="ghost scene-name" onClick={() => onView(s.id)} title="Abrir (solo tú)">
            🗺 {s.name}
          </button>
          {s.id === partySceneId && (
            <span className="badge gm" title="La escena de la party">
              Party
            </span>
          )}
          <span className="scene-players">
            {here.map((p) => (
              <span key={p.id} className="player-dot" style={{ background: userColor(p.id) }} title={`${p.displayName} está aquí`}>
                {p.displayName.slice(0, 1).toUpperCase()}
              </span>
            ))}
          </span>
          <button className={`ghost small ${moving === s.id ? 'active' : ''}`} onClick={() => setMoving(moving === s.id ? null : s.id)} title="Llevar jugadores a esta escena">
            Llevar ▾
          </button>
        </div>
        {moving === s.id && (
          <MovePlayers
            campaignId={campaignId}
            scene={s}
            players={players}
            partySceneId={partySceneId}
            onDone={(err) => {
              setMoving(null);
              setError(err);
            }}
          />
        )}
      </li>
    );
  }

  function folderNode(n: SceneTreeNode, depth: number) {
    const f = n.folder;
    const closed = collapsed.has(f.id);
    const count = countScenes(n);
    return (
      <li key={f.id} className="scene-node">
        <div
          className={`scene-row folder ${over?.id === f.id ? `drop-${over.mode}` : ''}`}
          style={{ paddingLeft: depth * 14 }}
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.setData(FOLDER_MIME, f.id);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            setOver({ id: f.id, mode: e.clientY - r.top < r.height * 0.3 ? 'before' : 'inside' });
          }}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onDrop(e, { kind: 'folder', folder: f, mode: e.clientY - r.top < r.height * 0.3 ? 'before' : 'inside' });
          }}
        >
          <button className="ghost scene-name" onClick={() => toggleFolder(f.id)} aria-expanded={!closed} title={closed ? 'Abrir carpeta' : 'Cerrar carpeta'}>
            {closed ? '▸' : '▾'} 📁 {f.name} <small className="muted">{count}</small>
          </button>
          <button className="ghost small" onClick={() => void newScene(campaignId, scenes.length, f.id).then((s) => s && onView(s.id))} title="Nueva escena en esta carpeta">
            +
          </button>
          <button className="ghost small" onClick={() => void newFolder(campaignId, f.id)} title="Nueva subcarpeta">
            📁+
          </button>
          <button className="ghost small" onClick={() => void renameFolder(f)} title="Renombrar">
            ✎
          </button>
          <button className="ghost small danger" onClick={() => void deleteFolder(f)} title="Borrar la carpeta (no sus escenas)">
            ✕
          </button>
        </div>
        {!closed && (
          <ul className="scene-tree">
            {n.folders.map((c) => folderNode(c, depth + 1))}
            {n.scenes.map((s) => sceneRow(s, depth + 1))}
            {!n.folders.length && !n.scenes.length && (
              <li className="muted hint" style={{ paddingLeft: (depth + 1) * 14 + 8 }}>
                Vacía: arrastra escenas aquí.
              </li>
            )}
          </ul>
        )}
      </li>
    );
  }

  return (
    <>
      <ul className="scene-tree">
        {tree.folders.map((n) => folderNode(n, 0))}
        {tree.scenes.map((s) => sceneRow(s, 0))}
      </ul>
      {folders.length > 0 && (
        <div
          className={`scene-root-drop ${over?.id === '' ? 'drop-inside' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver({ id: '', mode: 'inside' });
          }}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => onDrop(e, { kind: 'root' })}
        >
          Suelta aquí para sacar de las carpetas
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </>
  );
}

function countScenes(n: SceneTreeNode): number {
  return n.scenes.length + n.folders.reduce((t, c) => t + countScenes(c), 0);
}

/** Elegir a quién se lleva a una escena: toda la party o unos jugadores. */
function MovePlayers({
  campaignId,
  scene,
  players,
  partySceneId,
  onDone,
}: {
  campaignId: string;
  scene: Scene;
  players: CampaignMember[];
  partySceneId: string | null;
  onDone: (error: string | null) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const run = (p: Promise<unknown>) => p.then(() => onDone(null)).catch((e: Error) => onDone(e.message));
  return (
    <div className="move-players">
      <button className="small primary" onClick={() => void run(api.put(`/campaigns/${campaignId}/active-scene`, { sceneId: scene.id }))}>
        👥 Toda la party
      </button>
      {players.length > 0 ? (
        <>
          <span className="muted">o solo a:</span>
          {players.map((p) => {
            const at = p.sceneId ?? partySceneId;
            return (
              <label key={p.id} className="switch" title={at === scene.id ? 'Ya está en esta escena' : undefined}>
                <input type="checkbox" checked={picked.includes(p.id)} onChange={() => setPicked(picked.includes(p.id) ? picked.filter((x) => x !== p.id) : [...picked, p.id])} />
                {p.displayName}
                {at === scene.id && <small className="muted">(aquí)</small>}
              </label>
            );
          })}
          <button className="small" disabled={!picked.length} onClick={() => void run(api.put(`/campaigns/${campaignId}/player-scene`, { sceneId: scene.id, userIds: picked }))}>
            Llevar a {picked.length || 'los marcados'}
          </button>
        </>
      ) : (
        <span className="muted">Aún no hay jugadores en la partida.</span>
      )}
    </div>
  );
}

/** Botón de la barra de arriba (DM): desplegable con las escenas para cambiar de mapa o llevar a los jugadores. */
export function SceneSwitcher(props: Omit<Props, 'scenes' | 'folders'> & { current: Scene | null }) {
  const [open, setOpen] = useState(false);
  const { scenes, folders } = useSceneList(props.campaignId);
  return (
    <div className="scene-switcher">
      <button className={`small ${open ? 'active' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} title="Cambiar de escena o llevar a los jugadores">
        🗺 {props.current?.name ?? 'Escenas'} ▾
      </button>
      {open && (
        <>
          <div className="scene-switcher-backdrop" onClick={() => setOpen(false)} />
          <div className="scene-switcher-menu card">
            <div className="row spread">
              <strong>Escenas</strong>
              <span className="row">
                <button className="ghost small" onClick={() => void newScene(props.campaignId, scenes.length).then((s) => s && props.onView(s.id))}>
                  + Escena
                </button>
                <button className="ghost small" onClick={() => void newFolder(props.campaignId)}>
                  + Carpeta
                </button>
              </span>
            </div>
            <SceneTree
              {...props}
              scenes={scenes}
              folders={folders}
              onView={(id) => {
                props.onView(id);
                setOpen(false);
              }}
            />
            <p className="muted hint">Pulsa una escena para verla tú solo. Con "Llevar" mueves a toda la party o a quien marques. Arrastra para ordenar y meter en carpetas.</p>
          </div>
        </>
      )}
    </div>
  );
}
