import { useState } from 'react';
import {
  ADVENTURE_DIFFICULTIES,
  ADVENTURE_SIZE_DEFS,
  ADVENTURE_SIZES,
  DIFFICULTY_LABELS,
  mapSizeLabel,
  MAP_SIZES,
  MAP_STYLE_DEFS,
  MAP_STYLES,
  type AdventureDifficulty,
  type AdventureSize,
  type MapSize,
  type MapStyle,
  type Scene,
} from '@vtt/shared';
import { api } from '../../core/api';
import { PartyLine, useParty } from '../encounters/EncountersWindow';

/** Nombre por defecto según el lugar. */
const DEFAULT_NAMES: Record<MapStyle, string> = {
  dungeon: 'La mazmorra olvidada',
  crypt: 'La cripta del liche',
  castle: 'El castillo maldito',
  sewer: 'Bajo las alcantarillas',
  mine: 'La mina abandonada',
  cave: 'La cueva de los ecos',
  forest: 'El bosque sombrío',
  road: 'Emboscada en el camino',
  village: 'Problemas en el pueblo',
};

interface Summary {
  places: number;
  encounters: number;
  monsters: number;
  traps: number;
}

/**
 * Asistente de aventura rápida (solo el DM): elige el sitio, el tamaño y la dificultad y crea una escena
 * lista para jugar, con el mapa amueblado, notas numeradas, encuentros escondidos, trampas y tesoro.
 */
export function AdventureWindow({ campaignId, onClose, onCreated }: { campaignId: string; onClose: () => void; onCreated: (scene: Scene, message: string) => void }) {
  const party = useParty(campaignId);
  const [name, setName] = useState('');
  const [style, setStyle] = useState<MapStyle>('dungeon');
  const [size, setSize] = useState<AdventureSize>('medium');
  const [rooms, setRooms] = useState<MapSize>('normal');
  const [difficulty, setDifficulty] = useState<AdventureDifficulty>('medium');
  const [encounters, setEncounters] = useState(true);
  const [traps, setTraps] = useState(true);
  const [ambush, setAmbush] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const title = name.trim() || DEFAULT_NAMES[style];
      const { scene, summary } = await api.post<{ scene: Scene; summary: Summary }>(`/campaigns/${campaignId}/adventure`, {
        name: title,
        style,
        size,
        rooms,
        levels: party.levels,
        difficulty,
        encounters,
        traps,
        ambush,
      });
      const parts = [`${summary.places} sitios numerados`];
      if (summary.encounters) parts.push(`${summary.encounters} encuentros (${summary.monsters} monstruos escondidos)`);
      if (summary.traps) parts.push(`${summary.traps} trampas`);
      onCreated(scene, `«${scene.name}» lista: ${parts.join(', ')} y un tesoro. Los jugadores aún no la ven: llévalos con «Llevar» cuando quieras.`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal adventure" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Aventura rápida">
        <div className="row spread">
          <h2>✨ Aventura rápida</h2>
          <button className="ghost small" onClick={onClose} title="Cerrar">
            ✕
          </button>
        </div>
        <p className="muted">Crea una escena nueva lista para jugar: el mapa amueblado, una nota en cada sala con lo que hay, encuentros escondidos, trampas y un tesoro al final. Luego puedes retocarlo todo.</p>
        <label>
          Nombre
          <input value={name} maxLength={80} placeholder={DEFAULT_NAMES[style]} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="map-group">Lugar</div>
        {[false, true].map((outdoor) => (
          <div key={String(outdoor)} className="row wrap" role="group" aria-label={outdoor ? 'Exteriores' : 'Interiores'}>
            {MAP_STYLES.filter((st) => !!MAP_STYLE_DEFS[st].outdoor === outdoor).map((st) => (
              <button key={st} className={`small ${style === st ? 'active' : ''}`} title={MAP_STYLE_DEFS[st].description} onClick={() => setStyle(st)}>
                {MAP_STYLE_DEFS[st].icon} {MAP_STYLE_DEFS[st].name}
              </button>
            ))}
          </div>
        ))}
        <div className="field-row">
          <label>
            Tamaño de la escena
            <select value={size} onChange={(e) => setSize(e.target.value as AdventureSize)}>
              {ADVENTURE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {ADVENTURE_SIZE_DEFS[s].label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {MAP_STYLE_DEFS[style].outdoor && style !== 'village' ? 'Espesura' : 'Salas'}
            <select value={rooms} onChange={(e) => setRooms(e.target.value as MapSize)}>
              {MAP_SIZES.map((s) => (
                <option key={s} value={s}>
                  {mapSizeLabel(style, s)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <PartyLine party={party} />
        <label>
          Dificultad de los encuentros (el último, uno más)
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as AdventureDifficulty)}>
            {ADVENTURE_DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {DIFFICULTY_LABELS[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="switch">
          <input type="checkbox" checked={encounters} onChange={(e) => setEncounters(e.target.checked)} />
          Encuentros (monstruos del compendio con su hoja y su IA)
        </label>
        {encounters && (
          <label className="switch">
            <input type="checkbox" checked={ambush} onChange={(e) => setAmbush(e.target.checked)} />
            Que aparezcan solos cuando un jugador entre en su sala
          </label>
        )}
        <label className="switch">
          <input type="checkbox" checked={traps} onChange={(e) => setTraps(e.target.checked)} />
          Trampas (con salvación y daño según el nivel)
        </label>
        {error && <p className="notice-line">{error}</p>}
        <div className="row">
          <button className="primary" disabled={busy} onClick={() => void create()}>
            {busy ? 'Creando…' : '✨ Crear aventura'}
          </button>
          <button className="ghost" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
