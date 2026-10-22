import { useEffect, useState } from 'react';
import {
  acViewOf,
  AC_VIEWS,
  BOARD_LAYERS,
  DARKVISION_PRESETS,
  hpViewOf,
  HP_VIEWS,
  HP_VIEW_LABELS,
  LIGHT_PRESETS,
  type AcView,
  type BoardItem,
  type BoardLayer,
  type CampaignMember,
  type HpView,
  type Scene,
} from '@vtt/shared';
import { emitAck } from '../../core/socket';
import { updateSelected } from './actions';
import { deleteItem, updateItem } from './history';
import { AssetPicker } from './AssetPicker';
import { LAYER_LABELS, useBoard } from './store';
import { useSheets } from '../sheets/store';
import { AiPanel } from '../ai/AiPanel';
import { DamagePanel } from '../damage/DamagePanel';

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

      {item.characterId && !item.drawing && <StatsVisibility />}

      {item.layer !== 'map' && !item.drawing && <DamagePanel campaignId={campaignId} />}

      <GmNotes item={item} />

      {!item.drawing && <LightPanel item={item} scene={scene} />}

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
        <button className="ghost small danger" onClick={() => void deleteItem(scene.id, item.id)}>
          Borrar
        </button>
      </div>
      <p className="muted hint">Arrastra para mover (se ajusta a la cuadrícula; mantén Alt para moverlo libre). Supr para borrar; Ctrl+Z deshace y Ctrl+Y rehace.</p>

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

const AC_VIEW_LABELS: Record<AcView, string> = { gm: 'Solo el DM', all: 'Todos' };

/** Qué ven los jugadores de la vida y la CA del token (el DM y los dueños lo ven siempre). */
function StatsVisibility() {
  const item = useBoard((s) => (s.selectedId ? s.items[s.selectedId] : undefined));
  const scene = useBoard((s) => s.scene);
  if (!item || !scene) return null;
  const autoHp = HP_VIEW_LABELS[hpViewOf({ ...item, hpView: null })].toLowerCase();
  const autoAc = AC_VIEW_LABELS[acViewOf({ ...item, acView: null })].toLowerCase();
  // Aplicar lo mismo a todos los enemigos (tokens con hoja y sin dueños) de la escena.
  const enemies = Object.values(useBoard.getState().items).filter((i) => i.characterId && !i.drawing && !i.ownerIds.length && i.id !== item.id);
  const applyToEnemies = () =>
    enemies.forEach((i) => void updateItem(scene.id, i.id, { hpView: item.hpView, acView: item.acView }));
  return (
    <fieldset className="owners">
      <legend>Lo que ven los jugadores</legend>
      <div className="field-row">
        <label>
          Vida
          <select value={item.hpView ?? ''} onChange={(e) => void updateSelected({ hpView: (e.target.value || null) as HpView | null })}>
            <option value="">Automático ({autoHp})</option>
            {HP_VIEWS.map((v) => (
              <option key={v} value={v}>
                {HP_VIEW_LABELS[v]}
              </option>
            ))}
          </select>
        </label>
        <label>
          CA
          <select value={item.acView ?? ''} onChange={(e) => void updateSelected({ acView: (e.target.value || null) as AcView | null })}>
            <option value="">Automático ({autoAc})</option>
            {AC_VIEWS.map((v) => (
              <option key={v} value={v}>
                {AC_VIEW_LABELS[v]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!item.ownerIds.length && enemies.length > 0 && (
        <button className="ghost small" onClick={applyToEnemies} title="Copia estas dos opciones a los demás tokens con hoja y sin dueño de esta escena">
          Aplicar a los {enemies.length} enemigos de la escena
        </button>
      )}
    </fieldset>
  );
}

/** Luz que da el elemento y su visión en la oscuridad (cuentan con la escena a oscuras). */
function LightPanel({ item, scene }: { item: BoardItem; scene: Scene }) {
  const unit = scene.distanceUnit || 'pies';
  const preset = item.light ? LIGHT_PRESETS.find((p) => p.light.bright === item.light!.bright && p.light.dim === item.light!.dim) : undefined;
  const num = (v: string) => Math.max(0, Math.min(1000, Number(v) || 0));
  return (
    <fieldset className="owners">
      <legend>Luz y visión{!scene.lighting && ' (activa «🌙 A oscuras» en la escena)'}</legend>
      <label>
        Luz
        <select
          value={item.light ? (preset?.label ?? 'custom') : ''}
          onChange={(e) => {
            const p = LIGHT_PRESETS.find((x) => x.label === e.target.value);
            if (!e.target.value) void updateSelected({ light: null });
            else if (p) void updateSelected({ light: p.light });
            else void updateSelected({ light: item.light ?? { bright: 10, dim: 10, color: '#ffb74d' } });
          }}
        >
          <option value="">Ninguna</option>
          {LIGHT_PRESETS.map((p) => (
            <option key={p.label} value={p.label}>
              {p.label} ({p.light.bright}/{p.light.dim})
            </option>
          ))}
          <option value="custom">Personalizada</option>
        </select>
      </label>
      {item.light && (
        <div className="field-row">
          <label>
            Brillante ({unit})
            <input type="number" min={0} step={5} value={item.light.bright} onChange={(e) => void updateSelected({ light: { ...item.light!, bright: num(e.target.value) } })} />
          </label>
          <label>
            Tenue, además ({unit})
            <input type="number" min={0} step={5} value={item.light.dim} onChange={(e) => void updateSelected({ light: { ...item.light!, dim: num(e.target.value) } })} />
          </label>
          <label>
            Color
            <input type="color" value={item.light.color} onChange={(e) => void updateSelected({ light: { ...item.light!, color: e.target.value } })} />
          </label>
        </div>
      )}
      {item.layer === 'token' && (
        <label>
          Visión en la oscuridad ({unit})
          <input type="number" min={0} step={5} list="darkvision-presets" value={item.darkvision} onChange={(e) => void updateSelected({ darkvision: num(e.target.value) })} />
          <datalist id="darkvision-presets">
            {DARKVISION_PRESETS.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </label>
      )}
    </fieldset>
  );
}

/** Notas privadas del DM sobre el elemento (PNJ, trampas, secretos). Se guardan al salir del cuadro. */
function GmNotes({ item }: { item: BoardItem }) {
  const [text, setText] = useState(item.gmNotes);
  useEffect(() => setText(item.gmNotes), [item.id, item.gmNotes]);
  return (
    <label>
      📝 Notas del DM (los jugadores no las ven)
      <textarea
        rows={text ? Math.min(10, text.split('\n').length + 1) : 2}
        maxLength={5000}
        value={text}
        placeholder="Quién es, qué sabe, qué lleva encima, qué pasa si…"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const scene = useBoard.getState().scene;
          // Con el id del elemento: al cambiar de selección, el cuadro pierde el foco después.
          if (scene && text !== item.gmNotes) void updateItem(scene.id, item.id, { gmNotes: text });
        }}
      />
    </label>
  );
}
