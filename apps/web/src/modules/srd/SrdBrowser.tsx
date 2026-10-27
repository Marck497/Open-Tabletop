import { useMemo, useState } from 'react';
import {
  localName,
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
import { lang, tr } from '../../core/i18n';

type Tab = 'spells' | 'items' | 'classes' | 'races';
const TABS: { id: Tab; label: string }[] = [
  { id: 'spells', label: tr('Conjuros') },
  { id: 'items', label: tr('Objetos') },
  { id: 'classes', label: tr('Clases') },
  { id: 'races', label: tr('Especies') },
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
      <div className="card modal compendium" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={tr('Compendio de reglas')}>
        <div className="row spread">
          <h2>{tr('📚 Reglas del SRD')}</h2>
          <button className="ghost small" onClick={onClose} title={tr('Cerrar')}>
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
          <input placeholder={tr('Buscar (español o inglés)')} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          {(tab === 'spells' || tab === 'items') && editable.length > 0 && (
            <label className="switch">
              {tr('Añadir a')}
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
        {!data && !error && <p className="muted">{tr('Cargando el SRD…')}</p>}
        {data && tab === 'spells' && <SpellList data={data} query={query} target={target} onAdded={setMessage} onCopy={onCopy && ((s) => onCopy(draftOf(homebrewFromSrdSpell(s, template && actionsOf(template)), isGm)))} />}
        {data && tab === 'items' && <ItemList data={data} query={query} target={target} onAdded={setMessage} onCopy={onCopy && ((it) => onCopy(draftOf(homebrewFromSrdItem(it, template), isGm)))} />}
        {data && tab === 'classes' && <ClassList data={data} query={query} />}
        {data && tab === 'races' && <RaceList data={data} query={query} />}
        <p className="muted hint">
          {tr('Contenido del SRD 5.1 de D&D, © Wizards of the Coast, bajo licencia CC-BY-4.0, a través de 5e-bits/5e-database (MIT). Nombres traducidos; las descripciones van en el inglés original.')}
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
      await appendRows(target, { conjuros: { nivel: s.level, nombre: localName(s), preparado: true, efecto: spellEffect(s, lvl, mod), notas: spellNotes(s) } });
      onAdded(tr('Añadido a los conjuros de {name}: {name2}.', { name: target.name, name2: localName(s) }));
    } catch (e) {
      onAdded((e as Error).message);
    }
  }

  return (
    <>
      <div className="row">
        <select value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">{tr('Todas las clases')}</option>
          {data.classes
            .filter((c) => c.spellcasting)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
          <option value={-1}>{tr('Todos los niveles')}</option>
          {Array.from({ length: 10 }, (_, i) => (
            <option key={i} value={i}>
              {i === 0 ? tr('Trucos') : tr('Nivel {i}', { i })}
            </option>
          ))}
        </select>
        <span className="muted">{tr('{n} conjuros', { n: list.length })}</span>
      </div>
      <ul className="compendium-list">
        {list.slice(0, LIMIT).map((s) => (
          <li key={s.id}>
            <div className="row spread compendium-row">
              <button className="ghost compendium-name" onClick={() => setOpen(open === s.id ? null : s.id)}>
                <strong>{localName(s)}</strong> {lang === 'es' && <small className="muted">{s.en}</small>}
              </button>
              <span className="compendium-stats">
                {s.level ? tr('Nv {level}', { level: s.level }) : tr('Truco')} · {tr(s.school)}
                {s.concentration ? tr(' · C') : ''}
                {s.ritual ? tr(' · R') : ''}
              </span>
              {target && (
                <button className="ghost small" onClick={() => void add(s)} title={tr('Añadir a {name}', { name: target.name })}>
                  {tr('+ Hoja')}
                </button>
              )}
              {onCopy && (
                <button className="ghost small" onClick={() => onCopy(s)} title={tr('Copiar a ⚗ Creaciones para editarlo (daño, salvación, área…)')}>
                  ✎
                </button>
              )}
            </div>
            {open === s.id && <SpellDetails s={s} />}
          </li>
        ))}
        {list.length > LIMIT && <p className="muted">Y {list.length - LIMIT}{' '}{tr('más: afina la búsqueda.')}</p>}
      </ul>
    </>
  );
}

const SAVE: Record<SrdAbility, string> = { fue: tr('Fuerza'), des: tr('Destreza'), con: tr('Constitución'), int: tr('Inteligencia'), sab: tr('Sabiduría'), car: tr('Carisma') };

export function SpellDetails({ s }: { s: SrdSpell }) {
  return (
    <div className="monster-details">
      <p className="muted">
        {s.level ? tr('Nivel {level}', { level: s.level }) : tr('Truco')} {tr('de')} {tr(s.school).toLowerCase()}
        {s.ritual ? tr(' (ritual)') : ''} · {s.time} · {s.range}
        {s.area ? ` (${s.area})` : ''} · {s.components} · {s.concentration ? tr('Concentración, {0}', { '0': s.duration.toLowerCase() }) : s.duration}
      </p>
      {(s.attack || s.save || s.damage || s.heal) && (
        <p>
          {s.attack ? tr('Ataque de conjuro {0}. ', { '0': s.attack === 'melee' ? tr('cuerpo a cuerpo') : tr('a distancia') }) : ''}
          {s.save ? tr('Salvación de {0}. ', { '0': SAVE[s.save] }) : ''}
          {s.damage?.map((d) => `${Object.values(d.bySlot ?? d.byLevel ?? {})[0] ?? ''} ${tr(d.type)}`.trim()).join(' + ')}
          {s.heal ? tr('Cura {0}', { '0': Object.values(s.heal)[0]?.replace('MOD', 'mod.') }) : ''}
        </p>
      )}
      <p className="srd-desc">{s.desc}</p>
      {s.higher && <p className="srd-desc muted">{s.higher}</p>}
    </div>
  );
}

const ITEM_FILTERS = [
  { id: '', label: tr('Todo') },
  { id: 'arma', label: tr('Armas') },
  { id: 'armadura', label: tr('Armaduras') },
  { id: 'equipo', label: tr('Equipo') },
  { id: 'herramienta', label: tr('Herramientas') },
  { id: 'mágico', label: tr('Mágicos') },
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
    const rows: Record<string, Omit<SheetRow, '_id'>> = { inventario: { objeto: localName(it), cantidad: 1, peso: it.weight ?? 0 } };
    if (it.weapon) rows.ataques = weaponAttack(it, scores, Number(target.values.nivel) || 1);
    try {
      await appendRows(target, rows);
      onAdded(tr('Añadido al inventario de {name}{1}: {name2}.', { name: target.name, '1': it.weapon ? tr(' y a sus ataques') : '', name2: localName(it) }));
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
        <span className="muted">{tr('{n} objetos', { n: list.length })}</span>
      </div>
      <ul className="compendium-list">
        {list.slice(0, LIMIT).map((it) => (
          <li key={it.id}>
            <div className="row spread compendium-row">
              <button className="ghost compendium-name" onClick={() => setOpen(open === it.id ? null : it.id)}>
                <strong>{localName(it)}</strong> {lang === 'es' && it.en !== it.name && <small className="muted">{it.en}</small>}
              </button>
              <span className="compendium-stats">{itemStats(it)}</span>
              {target && (
                <button className="ghost small" onClick={() => void add(it)} title={tr('Añadir a {name}', { name: target.name })}>
                  {tr('+ Hoja')}
                </button>
              )}
              {onCopy && (
                <button className="ghost small" onClick={() => onCopy(it)} title={tr('Copiar a ⚗ Creaciones para editarlo (ataque, daño, usos…)')}>
                  ✎
                </button>
              )}
            </div>
            {open === it.id && (
              <div className="monster-details">
                <p className="muted">
                  {tr(it.cat)}
                  {it.rarity ? `, ${tr(it.rarity)}` : ''}
                  {it.cost ? ` · ${it.cost}` : ''}
                  {it.weight ? tr(' · {weight} lb', { weight: it.weight }) : ''}
                </p>
                {it.weapon && (
                  <p>
                    {tr('Arma')}{' '}{it.weapon.martial ? tr('marcial') : tr('sencilla')} {it.weapon.ranged ? tr('a distancia') : tr('cuerpo a cuerpo')}: {it.weapon.damage} {it.weapon.type}
                    {it.weapon.twoHanded ? tr(' ({twoHanded} a dos manos)', { twoHanded: it.weapon.twoHanded }) : ''}
                    {it.weapon.range ? tr(', alcance {range} pies', { range: it.weapon.range }) : ''}
                    {it.weapon.props.length ? `. ${it.weapon.props.map((p) => tr(p)).join(', ')}.` : '.'}
                  </p>
                )}
                {it.armor && (
                  <p>
                    {it.armor.kind === 'escudo' ? tr('Escudo: +{base} a la CA', { base: it.armor.base }) : tr('Armadura {kind}: CA {base}{2}', { kind: it.armor.kind, base: it.armor.base, '2': it.armor.dex ? tr(' + Des{0}', { '0': it.armor.maxDex ? tr(' (máx. {maxDex})', { maxDex: it.armor.maxDex }) : '' }) : '' })}
                    {it.armor.str ? tr(', Fuerza {str}', { str: it.armor.str }) : ''}
                    {it.armor.stealthDisadvantage ? tr(', desventaja en Sigilo') : ''}.
                  </p>
                )}
                {it.contents && <p>{tr('Contiene:')}{' '}{it.contents.map(([id, n]) => `${data.items.find((x) => x.id === id)?.name ?? id}${n > 1 ? ` ×${n}` : ''}`).join(', ')}.</p>}
                {it.desc && <p className="srd-desc">{it.desc}</p>}
              </div>
            )}
          </li>
        ))}
        {list.length > LIMIT && <p className="muted">Y {list.length - LIMIT}{' '}{tr('más: afina la búsqueda.')}</p>}
      </ul>
    </>
  );
}

function itemStats(it: SrdItem) {
  if (it.weapon) return `${it.weapon.damage} ${it.weapon.type}`;
  if (it.armor) return it.armor.kind === 'escudo' ? tr('+{base} CA', { base: it.armor.base }) : tr('CA {base}{1}', { base: it.armor.base, '1': it.armor.dex ? tr('+Des') : '' });
  if (it.rarity) return it.rarity;
  return it.cost ?? '';
}

function ClassList({ data, query }: { data: SrdData; query: string }) {
  const q = norm(query.trim());
  return (
    <ul className="compendium-list">
      {data.classes.map((c) => {
        const features = [...c.features, ...c.subclasses.flatMap((s) => s.features.map((f) => ({ ...f, name: `${tr(f.name)} (${localName(s)})` })))]
          .filter((f) => !q || norm(`${c.name} ${c.en} ${f.name}`).includes(q))
          .sort((a, b) => a.level - b.level);
        if (q && !features.length) return null;
        return (
          <li key={c.id}>
            <details open={!!q}>
              <summary>
                <strong>{localName(c)}</strong> <small className="muted">d{c.hitDie} · {c.proficiencies.map((p) => tr(p)).join(', ') || tr('sin armaduras')}</small>
              </summary>
              <div className="srd-traits">
                {features.map((f, i) => (
                  <details key={`${f.name}${i}`}>
                    <summary>
                      {tr('Nv')}{' '}{f.level} · {tr(f.name)}
                    </summary>
                    <p className="srd-desc">{f.desc}</p>
                    {f.options?.map((o) => (
                      <p key={o.name} className="srd-desc">
                        <b>{tr(o.name)}.</b> {o.desc}
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
                <strong>{localName(r)}</strong> <small className="muted">{tr(r.size)} · {r.speed}{' '}{tr('pies ·')}{' '}{r.languages.map((l) => tr(l)).join(', ')}</small>
              </summary>
              <div className="srd-traits">
                {[...r.traits, ...r.subraces.flatMap((s) => s.traits.map((t) => ({ ...t, name: `${tr(t.name)} (${localName(s)})` })))].map((t, i) => (
                  <details key={`${t.name}${i}`}>
                    <summary>{tr(t.name)}</summary>
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
