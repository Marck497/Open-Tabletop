import { useMemo, useState } from 'react';
import {
  localName,
  abilityMod,
  finalAbilities,
  hitPoints,
  pointBuyCost,
  POINT_BUY_BUDGET,
  resolveGear,
  roll4d6,
  spellLimits,
  SRD_ABILITIES,
  srdCharacterValues,
  STANDARD_ARRAY,
  validScores,
  type Character,
  type SrdAbility,
  type SrdBuild,
  type SrdData,
  type SrdEquipChoice,
  type SrdGear,
  type SrdSpell,
  type SrdTrait,
} from '@vtt/shared';
import { api } from '../../core/api';
import { useSheets } from '../sheets/store';
import { SpellDetails } from './SrdBrowser';
import { ABILITY_LABELS, norm, SKILL_LABELS, useSrd } from './useSrd';
import { lang, tr } from '../../core/i18n';

type Method = 'array' | 'pointbuy' | 'roll' | 'manual';
type EquipState = Record<string, { option: number; picks: string[][] }>;

const METHODS: { id: Method; label: string }[] = [
  { id: 'array', label: tr('Serie estándar') },
  { id: 'pointbuy', label: tr('Compra por puntos') },
  { id: 'roll', label: tr('Tirar 4d6') },
  { id: 'manual', label: tr('A mano') },
];
const ALIGNMENTS = [tr('Legal bueno'), tr('Neutral bueno'), tr('Caótico bueno'), tr('Legal neutral'), tr('Neutral'), tr('Caótico neutral'), tr('Legal malvado'), tr('Neutral malvado'), tr('Caótico malvado')];
const fromArray = (values: readonly number[]) => Object.fromEntries(SRD_ABILITIES.map((a, i) => [a, values[i] ?? 10])) as Record<SrdAbility, number>;
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** Creador de personajes de D&D 5e con los datos del SRD: rellena la hoja entera al terminar. */
export function CharacterCreator({ campaignId, onClose }: { campaignId: string; onClose: () => void }) {
  const { data, error } = useSrd();
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal creator" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={tr('Creador de personajes')}>
        <div className="row spread">
          <h2>{tr('✨ Nuevo personaje (D&D 5e)')}</h2>
          <button className="ghost small" onClick={onClose} title={tr('Cerrar')}>
            ✕
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {!data && !error && <p className="muted">{tr('Cargando el SRD…')}</p>}
        {data && <Creator data={data} campaignId={campaignId} onDone={onClose} />}
      </div>
    </div>
  );
}

function Creator({ data, campaignId, onDone }: { data: SrdData; campaignId: string; onDone: () => void }) {
  const template = useSheets((s) => s.template);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [raceId, setRaceId] = useState('human');
  const [subraceId, setSubraceId] = useState<string | undefined>();
  const [bonusChoice, setBonusChoice] = useState<SrdAbility[]>([]);
  const [raceSkills, setRaceSkills] = useState<string[]>([]);
  const [classId, setClassId] = useState('fighter');
  const [level, setLevel] = useState(1);
  const [subclassId, setSubclassId] = useState<string | undefined>();
  const [classSkills, setClassSkills] = useState<string[]>([]);
  const [options, setOptions] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<Method>('array');
  const [pool, setPool] = useState<number[]>([...STANDARD_ARRAY]);
  const [rolls, setRolls] = useState<number[][]>([]);
  const [scores, setScores] = useState(fromArray(STANDARD_ARRAY));
  const [backgroundId, setBackgroundId] = useState(data.backgrounds[0]?.id ?? '');
  const [backgroundName, setBackgroundName] = useState('');
  const [bgSkills, setBgSkills] = useState<string[]>([]);
  const [alignment, setAlignment] = useState('');
  const [languages, setLanguages] = useState<string[]>([]);
  const [equip, setEquip] = useState<EquipState>({});
  const [spells, setSpells] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const race = data.races.find((r) => r.id === raceId)!;
  const sub = race.subraces.find((s) => s.id === subraceId) ?? (race.subraces.length === 1 ? race.subraces[0] : undefined);
  const cls = data.classes.find((c) => c.id === classId)!;
  // Sin elegir nada se usa la única subclase del SRD en cuanto el nivel la permite ('' = ninguna).
  const subclass = cls.subclasses.find((s) => s.id === (subclassId ?? (cls.subclasses.length === 1 ? cls.subclasses[0]!.id : '')) && s.level <= level);
  const bg = data.backgrounds.find((b) => b.id === backgroundId);
  const final = finalAbilities({ abilities: scores, bonusChoice }, race, sub);
  const limits = spellLimits(cls, level, cls.spellcasting ? abilityMod(final[cls.spellcasting.ability]) : 0);
  const raceCantrip = sub?.cantrip;
  const hasSpells = limits.cantrips + limits.spells > 0 || !!raceCantrip;

  // Habilidades que ya vienen dadas (especie y trasfondo) no se pueden volver a elegir.
  const fixedSkills = new Set([...race.skills, ...(sub?.skills ?? []), ...(bg?.skills ?? [])]);
  const allSkills = [...new Set([...fixedSkills, ...raceSkills, ...classSkills, ...(bg ? [] : bgSkills)])];

  const traitOptions = [...race.traits, ...(sub?.traits ?? [])].filter((t) => t.options?.length);
  const classOptions = [...cls.features, ...(subclass?.features ?? [])].filter((f) => f.level <= level && f.options?.length);
  const extraLanguages = race.extraLanguages + (sub?.extraLanguages ?? 0) + (bg?.extraLanguages ?? 0);

  // Equipo: elecciones de la clase y del trasfondo.
  const choices: [string, SrdEquipChoice][] = [...cls.equipmentChoices.map((c, i) => [`c${i}`, c] as [string, SrdEquipChoice]), ...(bg?.equipmentChoices ?? []).map((c, i) => [`b${i}`, c] as [string, SrdEquipChoice])];
  const items = [
    ...cls.equipment,
    ...(bg?.equipment ?? []),
    ...choices.flatMap(([key, c]) => {
      const st = equip[key] ?? { option: 0, picks: [] };
      return resolveGear(c.options[st.option] ?? [], st.picks);
    }),
  ];

  const build: SrdBuild = {
    raceId,
    subraceId: sub?.id,
    classId,
    subclassId: subclass?.id,
    level,
    abilities: scores,
    bonusChoice,
    backgroundId: bg?.id ?? '',
    backgroundName: backgroundName.trim() || undefined,
    skills: allSkills.filter((s) => !fixedSkills.has(s)),
    items,
    spells,
    options,
    languages,
    alignment: alignment || undefined,
  };

  // Los nombres de los pasos se comparan abajo: se traducen solo al mostrarlos.
  const steps = ['Especie', 'Clase', 'Características', 'Trasfondo', 'Equipo', ...(hasSpells ? ['Conjuros'] : []), 'Resumen'];
  const stepName = steps[Math.min(step, steps.length - 1)]!;

  // Avisos que no bloquean: se puede crear igualmente y retocar la hoja después.
  const warnings: Record<string, string[]> = {
    Especie: race.bonusChoice && bonusChoice.length < race.bonusChoice.choose ? [tr('Elige {choose} características para el +{amount}.', { choose: race.bonusChoice.choose, amount: race.bonusChoice.amount })] : [],
    Clase: classSkills.length < cls.skills.choose ? [tr('Elige {choose} habilidades de clase.', { choose: cls.skills.choose })] : [],
    Características: validScores(method, SRD_ABILITIES.map((a) => scores[a])) ? [] : [method === 'pointbuy' ? tr('Te pasas de {POINT_BUY_BUDGET} puntos.', { POINT_BUY_BUDGET }) : tr('Usa cada valor una vez.')],
    Trasfondo: !bg && bgSkills.length < 2 ? [tr('Elige 2 habilidades del trasfondo.')] : [],
    Equipo: [],
    Conjuros: [],
    Resumen: name.trim() ? [] : [tr('Ponle un nombre.')],
  };

  function changeMethod(m: Method) {
    setMethod(m);
    if (m === 'array') {
      setPool([...STANDARD_ARRAY]);
      setScores(fromArray(STANDARD_ARRAY));
    } else if (m === 'pointbuy') setScores(fromArray([8, 8, 8, 8, 8, 8]));
    else if (m === 'roll') rollAll();
  }
  function rollAll() {
    const r = SRD_ABILITIES.map(() => roll4d6());
    setRolls(r.map((x) => x.dice));
    const totals = r.map((x) => x.total);
    setPool(totals);
    setScores(fromArray(totals));
  }
  /** En serie estándar y tirada, elegir un valor para una característica lo intercambia con la que lo tenía. */
  function pickValue(a: SrdAbility, v: number) {
    const other = SRD_ABILITIES.find((b) => b !== a && scores[b] === v);
    setScores({ ...scores, [a]: v, ...(other ? { [other]: scores[a] } : {}) });
  }

  async function create() {
    if (!template) return;
    setBusy(true);
    setMessage(null);
    try {
      const values = srdCharacterValues(template, build, data);
      const { character } = await api.post<{ character: Character }>(`/campaigns/${campaignId}/characters`, { name: name.trim() || tr('Sin nombre') });
      const { character: full } = await api.patch<{ character: Character }>(`/characters/${character.id}`, { values });
      useSheets.getState().upsert(full);
      useSheets.getState().openSheet(full.id);
      onDone();
    } catch (e) {
      setMessage((e as Error).message);
      setBusy(false);
    }
  }

  const toggle = (list: string[], set: (l: string[]) => void, v: string, max: number) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : list.length < max ? [...list, v] : [...list.slice(1), v]);

  return (
    <>
      <nav className="creator-steps">
        {steps.map((s, i) => (
          <button key={s} className={`small ${i === step ? 'active' : 'ghost'}`} onClick={() => setStep(i)}>
            {i + 1}. {tr(s)}
            {warnings[s]?.length ? ' •' : ''}
          </button>
        ))}
      </nav>

      <div className="creator-body">
        {stepName === 'Especie' && (
          <>
            <Choices
              items={data.races.map((r) => ({ id: r.id, label: localName(r), hint: bonusText(r.bonuses) }))}
              value={raceId}
              onChange={(id) => {
                setRaceId(id);
                setSubraceId(undefined);
                setBonusChoice([]);
                setRaceSkills([]);
              }}
            />
            {race.subraces.length > 0 && (
              <Choices items={race.subraces.map((s) => ({ id: s.id, label: localName(s), hint: bonusText(s.bonuses) }))} value={sub?.id} onChange={setSubraceId} />
            )}
            <p className="muted">
              {tr(race.size)} · {race.speed}{' '}{tr('pies · Idiomas:')}{' '}{race.languages.map((l) => tr(l)).join(', ')}
              {extraLanguages && race.extraLanguages ? tr(' y {extraLanguages} a elegir', { extraLanguages: race.extraLanguages }) : ''}
              {race.proficiencies.length ? ` · ${race.proficiencies.map((p) => tr(p)).join(', ')}` : ''}
            </p>
            {race.bonusChoice && (
              <Picker
                label={tr('+{amount} a {choose} características', { amount: race.bonusChoice.amount, choose: race.bonusChoice.choose })}
                options={race.bonusChoice.from.map((a) => ({ id: a, label: ABILITY_LABELS[a]! }))}
                selected={bonusChoice}
                onToggle={(a) => toggle(bonusChoice, (l) => setBonusChoice(l as SrdAbility[]), a, race.bonusChoice!.choose)}
              />
            )}
            {race.skillChoice && (
              <Picker
                label={tr('{choose} habilidades a elegir', { choose: race.skillChoice.choose })}
                options={race.skillChoice.from.filter((s) => !fixedSkills.has(s)).map((s) => ({ id: s, label: SKILL_LABELS[s] ?? s }))}
                selected={raceSkills}
                onToggle={(s) => toggle(raceSkills, setRaceSkills, s, race.skillChoice!.choose)}
              />
            )}
            <TraitOptions traits={traitOptions} options={options} setOptions={setOptions} />
            <Traits traits={[...race.traits, ...(sub?.traits ?? [])]} />
          </>
        )}

        {stepName === 'Clase' && (
          <>
            <Choices
              items={data.classes.map((c) => ({ id: c.id, label: localName(c), hint: `d${c.hitDie}` }))}
              value={classId}
              onChange={(id) => {
                setClassId(id);
                setSubclassId(undefined);
                setClassSkills([]);
                setEquip({});
                setSpells([]);
              }}
            />
            <div className="row">
              <label className="switch">
                {tr('Nivel')}
                <input type="number" className="tiny-number" min={1} max={20} value={level} onChange={(e) => setLevel(Math.max(1, Math.min(20, Math.round(Number(e.target.value)) || 1)))} />
              </label>
              {cls.subclasses.map((s) =>
                s.level <= level ? (
                  <button key={s.id} className={`small ${subclass?.id === s.id ? 'active' : ''}`} onClick={() => setSubclassId(subclass?.id === s.id ? '' : s.id)}>
                    {localName(s)}
                  </button>
                ) : (
                  <span key={s.id} className="muted">
                    {tr('Subclase (')}{localName(s)}{tr(') a nivel')}{' '}{s.level}
                  </span>
                ),
              )}
            </div>
            <p className="muted">
              {tr('PG')} {hitPoints(cls, level, final.con, sub?.id)}{' '}{tr('· Salvaciones:')}{' '}{cls.saves.map((a) => ABILITY_LABELS[a]).join(', ')} · {cls.proficiencies.join(', ') || tr('Sin armaduras')}
              {cls.spellcasting ? tr(' · Conjuros con {0}', { '0': ABILITY_LABELS[cls.spellcasting.ability] }) : ''}
            </p>
            <Picker
              label={tr('{choose} habilidades de clase', { choose: cls.skills.choose })}
              options={cls.skills.from.map((s) => ({ id: s, label: SKILL_LABELS[s] ?? s, disabled: fixedSkills.has(s) || raceSkills.includes(s) }))}
              selected={classSkills}
              onToggle={(s) => toggle(classSkills, setClassSkills, s, cls.skills.choose)}
            />
            <TraitOptions traits={classOptions} options={options} setOptions={setOptions} />
            <Traits traits={[...cls.features, ...(subclass?.features ?? [])].filter((f) => f.level <= level).map((f) => ({ ...f, name: tr('Nv {level} · {name}', { level: f.level, name: tr(f.name) }) }))} />
          </>
        )}

        {stepName === 'Características' && (
          <>
            <div className="row">
              {METHODS.map((m) => (
                <button key={m.id} className={`small ${method === m.id ? 'active' : ''}`} onClick={() => changeMethod(m.id)}>
                  {m.label}
                </button>
              ))}
              {method === 'roll' && (
                <button className="small" onClick={rollAll} title={tr('Vuelve a tirar las seis')}>
                  {tr('🎲 Repetir')}
                </button>
              )}
            </div>
            {method === 'pointbuy' && (
              <p className="muted">
                {tr('Puntos:')}{' '}{pointBuyCost(SRD_ABILITIES.map((a) => scores[a])) ?? '—'} / {POINT_BUY_BUDGET}{' '}{tr('(de 8 a 15)')}
              </p>
            )}
            {method === 'roll' && rolls.length > 0 && <p className="muted">{tr('Tiradas:')}{' '}{rolls.map((d) => `[${d.join(', ')}]`).join(' ')}{' '}{tr('(sin el dado más bajo)')}</p>}
            <div className="ability-grid">
              {SRD_ABILITIES.map((a) => {
                const bonus = final[a] - scores[a];
                return (
                  <div key={a} className="ability-cell">
                    <strong>{ABILITY_LABELS[a]}</strong>
                    {method === 'array' || method === 'roll' ? (
                      <select value={scores[a]} onChange={(e) => pickValue(a, Number(e.target.value))}>
                        {[...new Set(pool)].sort((x, y) => y - x).map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="number"
                        min={method === 'pointbuy' ? 8 : 1}
                        max={method === 'pointbuy' ? 15 : 30}
                        value={scores[a]}
                        onChange={(e) => setScores({ ...scores, [a]: Math.round(Number(e.target.value)) || 0 })}
                      />
                    )}
                    <span className="muted">
                      {bonus ? tr('{0} especie → ', { '0': signed(bonus) }) : ''}
                      <b>{final[a]}</b> ({signed(abilityMod(final[a]))})
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {stepName === 'Trasfondo' && (
          <>
            <Choices
              items={[...data.backgrounds.map((b) => ({ id: b.id, label: localName(b), hint: b.skills.map((s) => SKILL_LABELS[s]).join(', ') })), { id: '', label: tr('Otro (propio)'), hint: tr('2 habilidades a elegir') }]}
              value={backgroundId}
              onChange={setBackgroundId}
            />
            {bg ? (
              <Traits traits={[bg.feature]} />
            ) : (
              <>
                <input placeholder={tr('Nombre del trasfondo (Soldado, Criminal…)')} value={backgroundName} onChange={(e) => setBackgroundName(e.target.value)} />
                <Picker
                  label={tr('2 habilidades')}
                  options={Object.keys(SKILL_LABELS).map((s) => ({ id: s, label: SKILL_LABELS[s]!, disabled: fixedSkills.has(s) || raceSkills.includes(s) || classSkills.includes(s) }))}
                  selected={bgSkills}
                  onToggle={(s) => toggle(bgSkills, setBgSkills, s, 2)}
                />
              </>
            )}
            <label>
              {tr('Alineamiento')}
              <select value={alignment} onChange={(e) => setAlignment(e.target.value)}>
                <option value="">—</option>
                {ALIGNMENTS.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
            {extraLanguages > 0 && (
              <Picker
                label={tr('{extraLanguages} idioma{1} más', { extraLanguages, '1': extraLanguages > 1 ? 's' : '' })}
                options={data.languages.filter((l) => !race.languages.includes(l)).map((l) => ({ id: l, label: tr(l) }))}
                selected={languages}
                onToggle={(l) => toggle(languages, setLanguages, l, extraLanguages)}
              />
            )}
          </>
        )}

        {stepName === 'Equipo' && (
          <>
            {[...cls.equipment, ...(bg?.equipment ?? [])].length > 0 && (
              <p>
                <strong>{tr('Siempre:')}</strong> {[...cls.equipment, ...(bg?.equipment ?? [])].map((g) => gearLabel(g, data)).join(', ')}
              </p>
            )}
            {choices.map(([key, c]) => (
              <EquipChoiceView key={key} choice={c} data={data} state={equip[key] ?? { option: 0, picks: [] }} onChange={(st) => setEquip({ ...equip, [key]: st })} />
            ))}
            {bg?.gold ? <p className="muted">{tr('Y {gold} po.', { gold: bg.gold })}</p> : null}
          </>
        )}

        {stepName === 'Conjuros' && (
          <SpellStep
            data={data}
            classId={cls.id}
            limits={limits}
            extra={raceCantrip ? { classId: raceCantrip.classId, choose: raceCantrip.choose, label: sub!.name } : undefined}
            selected={spells}
            onChange={setSpells}
          />
        )}

        {stepName === 'Resumen' && (
          <Summary data={data} build={build} name={name} setName={setName} />
        )}
      </div>

      {warnings[stepName]?.map((w) => (
        <p key={w} className="muted">
          ⚠ {w}
        </p>
      ))}
      {message && <p className="error">{message}</p>}
      <div className="row spread">
        <button className="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
          {tr('← Atrás')}
        </button>
        {step < steps.length - 1 ? (
          <button className="primary" onClick={() => setStep(step + 1)}>
            {tr('Siguiente →')}
          </button>
        ) : (
          <button className="primary" disabled={busy || !template || !name.trim()} onClick={() => void create()}>
            {tr('Crear personaje')}
          </button>
        )}
      </div>
      <p className="muted hint">{tr('Datos del SRD 5.1 de D&D (CC-BY-4.0). Todo se puede cambiar después en la hoja.')}</p>
    </>
  );
}

function bonusText(b: Partial<Record<SrdAbility, number>>) {
  return Object.entries(b)
    .map(([a, n]) => `${a.toUpperCase()} ${signed(n)}`)
    .join(', ');
}

function gearLabel(g: SrdGear, data: SrdData) {
  if ('id' in g) {
    const name = data.items.find((i) => i.id === g.id)?.name ?? g.id;
    return g.qty > 1 ? `${g.qty} × ${name}` : name;
  }
  const cat = data.categories[g.category]?.name ?? g.category;
  const label = g.choose > 1 ? `${g.choose} × ${cat.replace(/^una? /, '')}` : cat;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function Choices({ items, value, onChange }: { items: { id: string; label: string; hint?: string }[]; value: string | undefined; onChange: (id: string) => void }) {
  return (
    <div className="creator-choices">
      {items.map((it) => (
        <button key={it.id} className={value === it.id ? 'active' : ''} onClick={() => onChange(it.id)}>
          {it.label}
          {it.hint && <small>{it.hint}</small>}
        </button>
      ))}
    </div>
  );
}

function Picker({ label, options, selected, onToggle }: { label: string; options: { id: string; label: string; disabled?: boolean }[]; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <div className="creator-picker">
      <span className="muted">{label}:</span>
      {options.map((o) => (
        <button key={o.id} className={`small ${selected.includes(o.id) ? 'active' : ''}`} disabled={o.disabled} onClick={() => onToggle(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function TraitOptions({ traits, options, setOptions }: { traits: SrdTrait[]; options: Record<string, string>; setOptions: (o: Record<string, string>) => void }) {
  return (
    <>
      {traits.map((t) => (
        <label key={t.name}>
          {tr(t.name)}
          <select value={options[t.name] ?? ''} onChange={(e) => setOptions({ ...options, [t.name]: e.target.value })}>
            <option value="">{tr('— elige —')}</option>
            {t.options!.map((o) => (
              <option key={o.name} value={o.name}>
                {tr(o.name)}
              </option>
            ))}
          </select>
          {options[t.name] && <small className="muted srd-desc">{t.options!.find((o) => o.name === options[t.name])?.desc}</small>}
        </label>
      ))}
    </>
  );
}

/** Rasgos con su descripción (en inglés, la del SRD) desplegable. */
function Traits({ traits }: { traits: { name: string; desc: string }[] }) {
  return (
    <div className="srd-traits">
      {traits.map((t, i) => (
        <details key={`${t.name}${i}`}>
          <summary>{tr(t.name)}</summary>
          <p className="srd-desc">{t.desc}</p>
        </details>
      ))}
    </div>
  );
}

function EquipChoiceView({ choice, data, state, onChange }: { choice: SrdEquipChoice; data: SrdData; state: { option: number; picks: string[][] }; onChange: (s: { option: number; picks: string[][] }) => void }) {
  const chosen = choice.options[state.option] ?? [];
  const categories = chosen.filter((g): g is { category: string; choose: number } => 'category' in g);
  return (
    <div className="creator-equip">
      <div className="row">
        {choice.options.map((opt, i) => (
          <button key={i} className={`small ${state.option === i ? 'active' : ''}`} onClick={() => onChange({ option: i, picks: [] })}>
            {opt.map((g) => gearLabel(g, data)).join(' + ')}
          </button>
        ))}
      </div>
      {categories.map((g, ci) => (
        <div key={ci} className="row">
          {Array.from({ length: g.choose }, (_, k) => (
            <select
              key={k}
              value={state.picks[ci]?.[k] ?? ''}
              onChange={(e) => {
                const picks = choice.options[state.option]!.filter((x) => 'category' in x).map((_, j) => [...(state.picks[j] ?? [])]);
                picks[ci]![k] = e.target.value;
                onChange({ ...state, picks });
              }}
            >
              <option value="">— {data.categories[g.category]?.name ?? g.category} —</option>
              {data.categories[g.category]?.items.map((id) => {
                const it = data.items.find((x) => x.id === id);
                return (
                  <option key={id} value={id}>
                    {it?.name ?? id}
                    {it?.weapon ? ` (${it.weapon.damage} ${it.weapon.type})` : ''}
                  </option>
                );
              })}
            </select>
          ))}
        </div>
      ))}
    </div>
  );
}

function SpellStep({
  data,
  classId,
  limits,
  extra,
  selected,
  onChange,
}: {
  data: SrdData;
  classId: string;
  limits: { cantrips: number; spells: number; maxLevel: number };
  extra?: { classId: string; choose: number; label: string };
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const q = norm(query.trim());
  const list = useMemo(
    () =>
      data.spells
        .filter((s) => (s.classes.includes(classId) && s.level <= limits.maxLevel) || (extra && s.level === 0 && s.classes.includes(extra.classId)))
        .filter((s) => !q || norm(`${s.name} ${s.en}`).includes(q))
        .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
    [data, classId, limits.maxLevel, extra, q],
  );
  const own = (s: SrdSpell) => s.classes.includes(classId);
  const chosen = selected.map((id) => data.spells.find((s) => s.id === id)).filter((s): s is SrdSpell => !!s);
  const cantrips = chosen.filter((s) => s.level === 0).length;
  const leveled = chosen.length - cantrips;
  const cantripMax = limits.cantrips + (extra?.choose ?? 0);

  function toggle(s: SrdSpell) {
    if (selected.includes(s.id)) return onChange(selected.filter((x) => x !== s.id));
    if (s.level === 0 ? cantrips >= cantripMax : leveled >= limits.spells) return;
    onChange([...selected, s.id]);
  }

  return (
    <>
      <p className="muted">
        {tr('Trucos')}{' '}{cantrips}/{cantripMax}
        {extra ? tr(' (uno de mago por ser {label})', { label: extra.label }) : ''}{' '}{tr('· Conjuros')}{' '}{leveled}/{limits.spells}
        {limits.maxLevel ? tr(' (hasta nivel {maxLevel})', { maxLevel: limits.maxLevel }) : ''}
      </p>
      <input placeholder={tr('Buscar conjuro')} value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul className="compendium-list creator-spells">
        {list.map((s) => {
          const on = selected.includes(s.id);
          const full = !on && (s.level === 0 ? cantrips >= cantripMax : leveled >= limits.spells || !own(s));
          return (
            <li key={s.id}>
              <div className="row compendium-row">
                <input type="checkbox" checked={on} disabled={full} onChange={() => toggle(s)} aria-label={s.name} />
                <button className="ghost compendium-name" onClick={() => setOpen(open === s.id ? null : s.id)}>
                  <strong>{localName(s)}</strong> {lang === 'es' && <small className="muted">{s.en}</small>}
                </button>
                <span className="compendium-stats">{s.level ? tr('Nv {level}', { level: s.level }) : tr('Truco')} · {tr(s.school)}</span>
              </div>
              {open === s.id && <SpellDetails s={s} />}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Summary({ data, build, name, setName }: { data: SrdData; build: SrdBuild; name: string; setName: (n: string) => void }) {
  const template = useSheets((s) => s.template);
  const v = template ? srdCharacterValues(template, build, data) : {};
  const rows = (key: string) => (Array.isArray(v[key]) ? (v[key] as Record<string, unknown>[]) : []);
  return (
    <>
      <input placeholder={tr('Nombre del personaje')} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <p>
        <strong>
          {String(v.raza ?? '')} · {String(v.clase ?? '')} {tr('nivel')} {String(v.nivel ?? '')}
        </strong>
        {v.trasfondo ? ` · ${String(v.trasfondo)}` : ''}
        {v.alineamiento ? ` · ${String(v.alineamiento)}` : ''}
      </p>
      <p>
        {tr('PG')} {String(v.pg_max ?? '—')}{' '}{tr('· CA')}{' '}{String(v.ca ?? '—')}{' '}{tr('· Velocidad')}{' '}{String(v.velocidad ?? '—')}{' '}{tr('pies ·')}{' '}
        {SRD_ABILITIES.map((a) => `${a.toUpperCase()} ${String(v[a] ?? '')}`).join(' · ')}
      </p>
      {rows('ataques').length > 0 && (
        <p>
          <strong>{tr('Ataques:')}</strong> {rows('ataques').map((a) => `${String(a.nombre)} ${String(a.bono)} (${String(a.dano)})`).join(', ')}
        </p>
      )}
      {rows('conjuros').length > 0 && (
        <p>
          <strong>{tr('Conjuros:')}</strong> {rows('conjuros').map((s) => String(s.nombre)).join(', ')}
        </p>
      )}
      {rows('inventario').length > 0 && (
        <p className="muted">
          <strong>{tr('Inventario:')}</strong> {rows('inventario').map((i) => (Number(i.cantidad) > 1 ? `${String(i.objeto)} ×${String(i.cantidad)}` : String(i.objeto))).join(', ')}
        </p>
      )}
      {!template && <p className="muted">{tr('Cargando la plantilla de hoja…')}</p>}
    </>
  );
}
