import { useEffect, useState } from 'react';
import { BOARD_LAYERS, type BoardLayer, type CampaignMember } from '@vtt/shared';
import { emitAck } from '../../core/socket';
import { updateSelected } from './actions';
import { AssetPicker } from './AssetPicker';
import { LAYER_LABELS, useBoard } from './store';
import { useSheets } from '../sheets/store';
import { AiPanel } from '../ai/AiPanel';

/** Propiedades del elemento seleccionado (solo DM). */
export function ItemPanel({ campaignId, members }: { campaignId: string; members: CampaignMember[] }) {
  const item = useBoard((s) => (s.selectedId ? s.items[s.selectedId] : undefined));
  const scene = useBoard((s) => s.scene);
  const [name, setName] = useState('');
  const [picker, setPicker] = useState(false);
  const characters = useSheets((s) => s.characters);

  useEffect(() => setName(item?.name ?? ''), [item?.id, item?.name]);
  if (!item || !scene) return null;

  const g = scene.gridSize;
  const players = members.filter((m) => m.role === 'player');
  const zs = Object.values(useBoard.getState().items).map((i) => i.z);

  const toggleOwner = (userId: string) =>
    updateSelected({ ownerIds: item.ownerIds.includes(userId) ? item.ownerIds.filter((id) => id !== userId) : [...item.ownerIds, userId] });

  return (
    <div className="panel">
      <h3>{item.drawing ? 'Dibujo seleccionado' : 'Elemento seleccionado'}</h3>
      <label>
        Nombre
        <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onBlur={() => name !== item.name && updateSelected({ name })} />
      </label>
      <label className="switch">
        <input type="checkbox" checked={item.showName} onChange={(e) => updateSelected({ showName: e.target.checked })} />
        Mostrar nombre en el tablero
      </label>

      <div className="field-row">
        <label>
          Ancho (casillas)
          <input type="number" min={0.25} step={0.25} value={+(item.width / g).toFixed(2)} onChange={(e) => +e.target.value > 0 && updateSelected({ width: +e.target.value * g })} />
        </label>
        <label>
          Alto (casillas)
          <input type="number" min={0.25} step={0.25} value={+(item.height / g).toFixed(2)} onChange={(e) => +e.target.value > 0 && updateSelected({ height: +e.target.value * g })} />
        </label>
      </div>

      <div className="field-row">
        <label>
          Capa
          <select value={item.layer} onChange={(e) => updateSelected({ layer: e.target.value as BoardLayer })}>
            {BOARD_LAYERS.map((l) => (
              <option key={l} value={l}>
                {LAYER_LABELS[l]}
              </option>
            ))}
          </select>
        </label>
        {!item.assetId && (
          <label>
            Color
            <input type="color" value={item.color} onChange={(e) => updateSelected({ color: e.target.value })} />
          </label>
        )}
      </div>

      {!item.drawing && (
        <label>
          Personaje vinculado
          <select
            value={item.characterId ?? ''}
            onChange={(e) => {
              const c = e.target.value ? characters[e.target.value] : undefined;
              // Al vincular, lo pueden mover quienes controlan al personaje.
              void updateSelected(c ? { characterId: c.id, ownerIds: c.controlledBy } : { characterId: null });
            }}
          >
            <option value="">Ninguno</option>
            {Object.values(characters)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {item.characterId && characters[item.characterId] && (
        <button className="ghost small" onClick={() => useSheets.getState().openSheet(item.characterId!)}>
          Abrir hoja
        </button>
      )}

      {item.layer !== 'map' && !item.drawing && <AiPanel item={item} hasSheet={!!item.characterId} />}

      {players.length > 0 && (
        <fieldset className="owners">
          <legend>Pueden moverlo</legend>
          {players.map((p) => (
            <label key={p.id} className="switch">
              <input type="checkbox" checked={item.ownerIds.includes(p.id)} onChange={() => toggleOwner(p.id)} />
              {p.displayName}
            </label>
          ))}
        </fieldset>
      )}

      <div className="row">
        <button className="small" onClick={() => setPicker(true)}>
          {item.assetId ? 'Cambiar imagen' : 'Poner imagen'}
        </button>
        {item.assetId && (
          <button className="ghost small" onClick={() => updateSelected({ assetId: null })}>
            Quitar imagen
          </button>
        )}
        <button className="ghost small" onClick={() => updateSelected({ z: Math.max(...zs) + 1 })} title="Traer al frente">
          ⬆ Frente
        </button>
        <button className="ghost small" onClick={() => updateSelected({ z: Math.min(...zs) - 1 })} title="Enviar al fondo">
          ⬇ Fondo
        </button>
        {item.layer === 'map' && (
          <button
            className="ghost small"
            onClick={() => updateSelected({ x: 0, y: 0, width: scene.widthCells * g, height: scene.heightCells * g, rotation: 0 })}
          >
            Ajustar a la escena
          </button>
        )}
        <button className="ghost small danger" onClick={() => void emitAck('item:delete', { sceneId: scene.id, id: item.id })}>
          Borrar
        </button>
      </div>
      <p className="muted hint">Arrastra para mover (se ajusta a la cuadrícula; mantén Alt para moverlo libre). Supr para borrar.</p>

      {picker && (
        <AssetPicker
          campaignId={campaignId}
          onClose={() => setPicker(false)}
          onPick={(a) => {
            setPicker(false);
            void updateSelected({ assetId: a.id });
          }}
        />
      )}
    </div>
  );
}
