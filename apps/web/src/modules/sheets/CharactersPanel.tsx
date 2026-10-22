import { useState } from 'react';
import { assetUrl, type CampaignMember, type Character } from '@vtt/shared';
import { api } from '../../core/api';
import { CompendiumWindow } from '../compendium/CompendiumWindow';
import type { HomebrewDraft } from '../homebrew/HomebrewEditor';
import { HomebrewWindow } from '../homebrew/HomebrewWindow';
import { CharacterCreator } from '../srd/CharacterCreator';
import { SrdBrowser } from '../srd/SrdBrowser';
import { useSheets } from './store';

/** Lista de personajes que el usuario puede ver ("diario" en Roll20). */
export function CharactersPanel({
  campaignId,
  isGm,
  meId,
  members,
  onEditTemplate,
}: {
  campaignId: string;
  isGm: boolean;
  meId: string;
  members: CampaignMember[];
  onEditTemplate: () => void;
}) {
  const characters = useSheets((s) => s.characters);
  const openSheet = useSheets((s) => s.openSheet);
  const list = Object.values(characters).sort((a, b) => a.name.localeCompare(b.name));
  const [compendium, setCompendium] = useState(false);
  const [creator, setCreator] = useState(false);
  const [rules, setRules] = useState(false);
  /** Ventana de creaciones: cerrada (null), abierta, o abierta con una copia del SRD para editar. */
  const [homebrew, setHomebrew] = useState<{ draft: HomebrewDraft | null } | null>(null);

  async function create() {
    const name = prompt(isGm ? 'Nombre del personaje o PNJ' : 'Nombre de tu personaje');
    if (!name?.trim()) return;
    const { character } = await api.post<{ character: Character }>(`/campaigns/${campaignId}/characters`, { name: name.trim() });
    useSheets.getState().upsert(character);
    openSheet(character.id);
  }

  return (
    <div className="panel">
      <div className="row spread">
        <h3>Personajes</h3>
        <span className="row">
          {isGm && (
            <button className="ghost small" onClick={() => setCompendium(true)} title="Monstruos del SRD 5e con su hoja y su IA">
              📖 Compendio
            </button>
          )}
          <button className="ghost small" onClick={() => void create()} title="Hoja en blanco">
            + Nuevo
          </button>
        </span>
      </div>
      <div className="row">
        <button className="small" onClick={() => setCreator(true)} title="Especie, clase, características, equipo y conjuros del SRD 5e: la hoja sale rellena">
          ✨ Crear personaje 5e
        </button>
        <button className="ghost small" onClick={() => setRules(true)} title="Conjuros, objetos, clases y especies del SRD 5e">
          📚 Reglas
        </button>
        <button className="ghost small" onClick={() => setHomebrew({ draft: null })} title="Crea y edita hechizos, ataques y objetos que funcionan con los botones de las hojas">
          ⚗ Creaciones
        </button>
      </div>
      {list.length === 0 && <p className="muted hint">{isGm ? 'Crea los PJ y PNJ de la partida.' : 'Crea tu personaje o pide al DM que te asigne uno.'}</p>}
      <ul className="character-list">
        {list.map((c) => (
          <li key={c.id}>
            <button
              className="ghost character-row"
              onClick={() => openSheet(c.id)}
              draggable={isGm}
              onDragStart={(e) => e.dataTransfer.setData('application/x-vtt-character', c.id)}
              title={isGm ? 'Abrir hoja (arrástralo al tablero para crear su token)' : 'Abrir hoja'}
            >
              <span className="avatar small">{c.avatarAssetId ? <img src={assetUrl(c.avatarAssetId)} alt="" /> : c.name.slice(0, 1)}</span>
              <span className="member-name">{c.name}</span>
              {isGm && c.controlledBy.length === 0 && <span className="badge">PNJ</span>}
              {!isGm && c.controlledBy.includes(meId) && <span className="badge gm">Tuyo</span>}
            </button>
          </li>
        ))}
      </ul>
      {isGm && (
        <button className="ghost small" onClick={onEditTemplate}>
          ⚙ Editar plantilla de hoja
        </button>
      )}
      {creator && <CharacterCreator campaignId={campaignId} onClose={() => setCreator(false)} />}
      {rules && (
        <SrdBrowser
          isGm={isGm}
          meId={meId}
          onClose={() => setRules(false)}
          onCopy={(draft) => {
            setRules(false);
            setHomebrew({ draft });
          }}
        />
      )}
      {homebrew && <HomebrewWindow campaignId={campaignId} isGm={isGm} meId={meId} members={members} initialDraft={homebrew.draft} onClose={() => setHomebrew(null)} />}
      {compendium && <CompendiumWindow campaignId={campaignId} onClose={() => setCompendium(false)} />}
    </div>
  );
}
