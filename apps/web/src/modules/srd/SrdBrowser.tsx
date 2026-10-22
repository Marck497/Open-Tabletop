import { useMemo, useState } from 'react';
import {
  actionsOf,
  computeAll,
  homebrewDataSchema,
  homebrewFromSrdItem,
  homebrewFromSrdSpell,
  type CreateHomebrewInput,
  spellEffect,
  spellNotes,
  weaponAttack,
  type Character,
  type SheetRow,
  type SrdAbility,
  type SrdData,
  type SrdItem,
  type SrdSpell,
} from '@vtt/shared';
import { api } from '../../core/api';
import type { HomebrewDraft } from '../homebrew/HomebrewEditor';
import { newRowId } from '../sheets/SheetField';
import { useSheets } from '../sheets/store';
import { norm, useSrd } from './useSrd';

type Tab = 'spells' | 'items' | 'classes' | 'races';
const TABS: { id: Tab; label: string }[] = [
  { id: 'spells', label: 'Conjuros' },
  { id: 'items', label: 'Objetos' },
  { id: 'classes', label: 'Clases' },
  { id: 'races', label: 'Especies' },
];
const LIMIT = 150;

/** Compendio de reglas del SRD: conjuros, objetos, clases y especies, con "añadir a la hoja". */
export function SrdBrowser({ isGm, meId, onClose, onCopy }: { isGm: boolean; meId: string; onClose: () => void; onCopy?: (draft: HomebrewDraft) => void }) {
  const { data, error } = useSrd();
  const [tab, setTab] = useState<Tab>('spells');
  const [query, setQuery] = useState('');
  const characters = useSheets((s) => s.characters);
  const editable = Object.values(characters)
    .filter((c) => isGm || c.controlledBy.includes(meId))
    .sort((a, b) => a.name.localeCompare(b.name));
  const [targetId, setTargetId] = useState<string>('');
  const target = characters[targetId] ?? editable[0];
  const [message, setMessage] = useState<string | null>(null);
  const template = useSheets((s) => s.template);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal compendium" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Compendio de reglas">
        <div className="row spread">
          <h2>📚 Reglas del SRD</h2>
          <button className="ghost small" onClick={onClose} title="Cerrar">
            ✕
          </button>
        </div>
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="row">
          <input placeholder="Buscar (español o inglés)" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          {(tab === 'spells' || tab === 'items') && editable.length > 0 && (
            <label className="switch">
              Añadir a
              <select value={target?.id ?? ''} onChange={(e) => setTargetId(e.target.value)}>
                {editable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {message && <p className="muted">{message}</p>}
        {error && <p className="error">{error}</p>}
        {!data && !error && <p className="muted">Cargando el SRD…</p>}
        {data && tab === 'spells' && <SpellList data={data} query={query} target={target} onAdded={setMessage} onCopy={onCopy && ((s) => onCopy(draftOf(homebrewFromSrdSpell(s, template && actionsOf(template)), isGm)))} />}
        {data && tab === 'items' && <ItemList data={data} query={query} target={target} onAdded={setMessage} onCopy={onCopy && ((it) => onCopy(draftOf(homebrewFromSrdItem(it, template), isGm)))} />}
        {data && tab === 'classes' && <ClassList data={data} query={query} />}
        {data && tab === 'races' && <RaceList data={data} query={query} />}
        <p className="muted hint">
          Contenido del SRD 5.1 de D&D, © Wizards of the Coast, bajo licencia CC-BY-4.0, a través de 5e-bits/5e-database (MIT). Nombres traducidos; las descripciones van en el inglés original.
        </p>
      </div>
    </div>
  );
}

/** Borrador del editor de creaciones a partir de una copia del SRD (el DM la comparte de serie). */
const draftOf = (c: CreateHomebrewInput, isGm: boolean): HomebrewDraft => ({ kind: c.kind, name: c.name, shared: isGm, data: homebrewDataSchema.parse(c.data ?? {}) });

/** Añade filas a una lista de la hoja (conjuros, inventario, ataques). */
async function appendRows(c: Character, rows: Record<string, Omit<SheetRow, '_id'>>) {
  const values: Character['values'] = {};
  for (const [list, row] of Object.entries(rows)) {
    const current = Array.isArray(c.values[list]) ? (c.values[list] as SheetRow[]) : [];
    values[list] = [...current, { ...row, _id: newRowId() }];
  }
  const { character } = await api.patch<{ character: Character }>(`/characters/${c.id}`, { values });
  useSheets.getState().upsert(character);
}

function SpellList({ data, query, target, onAdded, onCopy }: { data: SrdData; query: string; target?: Character; onAdded: (m: string) => void; onCopy?: (s: SrdSpell) => void }) {
  const [classId, setClassId] = useState('');
  const [level, setLevel] = useState(-1);
  const [open, setOpen] = useState<string | null>(null);
  const template = useSheets((s) => s.template);
  const list = useMemo(() => {
    const q = norm(query.trim());
    return data.spells
      .filter((s) => (!classId || s.classes.includes(classId)) && (level < 0 || s.level === level) && (!q || norm(`${s.name} ${s.en} ${s.school}`).includes(q)))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }, [data, query, classId, level]);

  async function add(s: SrdSpell) {
    if (!target) return;
    const lvl = Number(target.values.nivel) || 1;
    const mod = template ? (computeAll(template, target.values).conj_mod ?? 0) : 0;
    try {
      await appendRows(target, { conjuros: { nivel: s.level, nombre: s.name, preparado: true, efecto: spellEffect(s, lvl, mod), notas: spellNotes(s) } });
      onAdded(`Añadido a los conjuros de ${target.name}: ${s.name}.`);
    } catch (e) {
      onAdded((e as Error).message);
    }
  }

  return (
    <>
      <div className="row">
        <select value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">Todas las clases</option>
          {data.classes
            .filter((c) => c.spellcasting)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
          <option value={-1}>Todos los niveles</option>
          {Array.from({ length: 10 }, (_, i) => (
            <option key={i} value={i}>
              {i === 0 ? 'Trucos' : `Nivel ${i}`}
            </option>
          ))}
        </select>
        <span className="muted">{list.length} conjuros</span>
      </div>
      <ul className="compendium-list">
        {list.slice(0, LIMIT).map((s) => (
          <li key={s.id}>
            <div className="row spread compendium-row">
              <button className="ghost compendium-name" onClick={() => setOpen(open === s.id ? null : s.id)}>
                <strong>{s.name}</strong> <small className="muted">{s.en}</small>
              </button>
              <span className="compendium-stats">
                {s.level ? `Nv ${s.level}` : 'Truco'} · {s.school}
                {s.concentration ? ' · C' : ''}
                {s.ritual ? ' · R' : ''}
              </span>
              {target && (
                <button className="ghost small" onClick={() => void add(s)} title={`Añadir a ${target.name}`}>
                  + Hoja
                </button>
              )}
              {onCopy && (
                <button className="ghost small" onClick={() => onCopy(s)} title="Copiar a ⚗ Creaciones para editarlo (daño, salvación, área…)">
                  ✎
                </button>
              )}
            </div>
            {open === s.id && <SpellDetails s={s} />}
          </li>
        ))}
        {list.length > LIMIT && <p className="muted">Y {list.length - LIMIT} más: afina la búsqueda.</p>}
      </ul>
    </>
  );
}

const SAVE: Record<SrdAbility, string> = { fue: 'Fuerza', des: 'Destreza', con: 'Constitución', int: 'Inteligencia', sab: 'Sabiduría', car: 'Carisma' };

export function SpellDetails({ s }: { s: SrdSpell }) {
  return (
    <div className="monster-details">
      <p className="muted">
        {s.level ? `Nivel ${s.level}` : 'Truco'} de {s.school.toLowerCase()}
        {s.ritual ? ' (ritual)' : ''} · {s.time} · {s.range}
        {s.area ? ` (${s.area})` : ''} · {s.components} · {s.concentration ? `Concentración, ${s.duration.toLowerCase()}` : s.duration}
      </p>
      {(s.attack || s.save || s.damage || s.heal) && (
        <p>
          {s.attack ? `Ataque de conjuro ${s.attack === 'melee' ? 'cuerpo a cuerpo' : 'a distancia'}. ` : ''}
          {s.save ? `Salvación de ${SAVE[s.save]}. ` : ''}
          {s.damage?.map((d) => `${Object.values(d.bySlot ?? d.byLevel ?? {})[0] ?? ''} ${d.type}`.trim()).join(' + ')}
          {s.heal ? `Cura ${Object.values(s.heal)[0]?.replace('MOD', 'mod.')}` : ''}
        </p>
      )}
      <p className="srd-desc">{s.desc}</p>
      {s.higher && <p className="srd-desc muted">{s.higher}</p>}
    </div>
  );
}

const ITEM_FILTERS = [
  { id: '', label: 'Todo' },
  { id: 'arma', label: 'Armas' },
  { id: 'armadura', label: 'Armaduras' },
  { id: 'equipo', label: 'Equipo' },
  { id: 'herramienta', label: 'Herramientas' },
  { id: 'mágico', label: 'Mágicos' },
];

function ItemList({ data, query, target, onAdded, onCopy }: { data: SrdData; query: string; target?: Character; onAdded: (m: string) => void; onCopy?: (it: SrdItem) => void }) {
  const [cat, setCat] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const list = useMemo(() => {
    const q = norm(query.trim());
    return data.items
      .filter((i) => (!cat || (cat === 'mágico' ? !!i.rarity : !i.rarity && i.cat === cat)) && (!q || norm(`${i.name} ${i.en} ${i.cat}`).includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, query, cat]);

  async function add(it: SrdItem) {
    if (!target) return;
    const scores = { fue: 10, des: 10, con: 10, int: 10, sab: 10, car: 10 } as Record<SrdAbility, number>;
    for (const k of Object.keys(scores) as SrdAbility[]) scores[k] = Number(target.values[k]) || 10;
    const rows: Record<string, Omit<SheetRow, '_id'>> = { inventario: { objeto: it.name, cantidad: 1, peso: it.weight ?? 0 } };
    if (it.weapon) rows.ataques = weaponAttack(it, scores, Number(target.values.nivel) || 1);
    try {
      await appendRows(target, rows);
      onAdded(`Añadido al inventario de ${target.name}${it.weapon ? ' y a sus ataques' : ''}: ${it.name}.`);
    } catch (e) {
      onAdded((e as Error).message);
    }
  }

  return (
    <>
      <div className="row">
        {ITEM_FILTERS.map((f) => (
          <button key={f.id} className={`small ${cat === f.id ? 'active' : ''}`} onClick={() => setCat(f.id)}>
            {f.label}
          </button>
        ))}
        <span className="muted">{list.length} objetos</span>
      </div>
      <ul className="compendium-list">
        {list.slice(0, LIMIT).map((it) => (
          <li key={it.id}>
            <div className="row spread compendium-row">
              <button className="ghost compendium-name" onClick={() => setOpen(open === it.id ? null : it.id)}>
                <strong>{it.name}</strong> {it.en !== it.name && <small className="muted">{it.en}</small>}
              </button>
              <span className="compendium-stats">{itemStats(it)}</span>
              {target && (
                <button className="ghost small" onClick={() => void add(it)} title={`Añadir a ${target.name}`}>
                  + Hoja
                </button>
              )}
              {onCopy && (
                <button className="ghost small" onClick={() => onCopy(it)} title="Copiar a ⚗ Creaciones para editarlo (ataque, daño, usos…)">
                  ✎
                </button>
              )}
            </div>
            {open === it.id && (
              <div className="monster-details">
                <p className="muted">
                  {it.cat}
                  {it.rarity ? `, ${it.rarity}` : ''}
                  {it.cost ? ` · ${it.cost}` : ''}
                  {it.weight ? ` · ${it.weight} lb` : ''}
                </p>
                {it.weapon && (
                  <p>
                    Arma {it.weapon.martial ? 'marcial' : 'sencilla'} {it.weapon.ranged ? 'a distancia' : 'cuerpo a cuerpo'}: {it.weapon.damage} {it.weapon.type}
                    {it.weapon.twoHanded ? ` (${it.weapon.twoHanded} a dos manos)` : ''}
                    {it.weapon.range ? `, alcance ${it.weapon.range} pies` : ''}
                    {it.weapon.props.length ? `. ${it.weapon.props.join(', ')}.` : '.'}
                  </p>
                )}
                {it.armor && (
                  <p>
                    {it.armor.kind === 'escudo' ? `Escudo: +${it.armor.base} a la CA` : `Armadura ${it.armor.kind}: CA ${it.armor.base}${it.armor.dex ? ` + Des${it.armor.maxDex ? ` (máx. ${it.armor.maxDex})` : ''}` : ''}`}
                    {it.armor.str ? `, Fuerza ${it.armor.str}` : ''}
                    {it.armor.stealthDisadvantage ? ', desventaja en Sigilo' : ''}.
                  </p>
                )}
                {it.contents && <p>Contiene: {it.contents.map(([id, n]) => `${data.items.find((x) => x.id === id)?.name ?? id}${n > 1 ? ` ×${n}` : ''}`).join(', ')}.</p>}
                {it.desc && <p className="srd-desc">{it.desc}</p>}
              </div>
            )}
          </li>
        ))}
        {list.length > LIMIT && <p className="muted">Y {list.length - LIMIT} más: afina la búsqueda.</p>}
      </ul>
    </>
  );
}

function itemStats(it: SrdItem) {
  if (it.weapon) return `${it.weapon.damage} ${it.weapon.type}`;
  if (it.armor) return it.armor.kind === 'escudo' ? `+${it.armor.base} CA` : `CA ${it.armor.base}${it.armor.dex ? '+Des' : ''}`;
  if (it.rarity) return it.rarity;
  return it.cost ?? '';
}

function ClassList({ data, query }: { data: SrdData; query: string }) {
  const q = norm(query.trim());
  return (
    <ul className="compendium-list">
      {data.classes.map((c) => {
        const features = [...c.features, ...c.subclasses.flatMap((s) => s.features.map((f) => ({ ...f, name: `${f.name} (${s.name})` })))]
          .filter((f) => !q || norm(`${c.name} ${c.en} ${f.name}`).includes(q))
          .sort((a, b) => a.level - b.level);
        if (q && !features.length) return null;
        return (
          <li key={c.id}>
            <details open={!!q}>
              <summary>
                <strong>{c.name}</strong> <small className="muted">d{c.hitDie} · {c.proficiencies.join(', ') || 'sin armaduras'}</small>
              </summary>
              <div className="srd-traits">
                {features.map((f, i) => (
                  <details key={`${f.name}${i}`}>
                    <summary>
                      Nv {f.level} · {f.name}
                    </summary>
                    <p className="srd-desc">{f.desc}</p>
                    {f.options?.map((o) => (
                      <p key={o.name} className="srd-desc">
                        <b>{o.name}.</b> {o.desc}
                      </p>
                    ))}
                  </details>
                ))}
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

function RaceList({ data, query }: { data: SrdData; query: string }) {
  const q = norm(query.trim());
  return (
    <ul className="compendium-list">
      {data.races
        .filter((r) => !q || norm(`${r.name} ${r.en} ${r.subraces.map((s) => s.name).join(' ')} ${r.traits.map((t) => t.name).join(' ')}`).includes(q))
        .map((r) => (
          <li key={r.id}>
            <details open={!!q}>
              <summary>
                <strong>{r.name}</strong> <small className="muted">{r.size} · {r.speed} pies · {r.languages.join(', ')}</small>
              </summary>
              <div className="srd-traits">
                {[...r.traits, ...r.subraces.flatMap((s) => s.traits.map((t) => ({ ...t, name: `${t.name} (${s.name})` })))].map((t, i) => (
                  <details key={`${t.name}${i}`}>
                    <summary>{t.name}</summary>
                    <p className="srd-desc">{t.desc}</p>
                  </details>
                ))}
              </div>
            </details>
          </li>
        ))}
    </ul>
  );
}
