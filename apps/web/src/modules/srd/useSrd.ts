import { useEffect, useState } from 'react';
import { loadSrd, type SrdData } from '@vtt/shared';
import { tr } from '../../core/i18n';

/** Datos del SRD (se descargan la primera vez que se necesitan). */
export function useSrd(): { data: SrdData | null; error: string | null } {
  const [data, setData] = useState<SrdData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadSrd().then(
      (d) => alive && setData(d),
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, []);
  return { data, error };
}

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Nombre en español de cada habilidad de la hoja de 5e. */
export const SKILL_LABELS: Record<string, string> = {
  acrobacias: tr('Acrobacias'), atletismo: tr('Atletismo'), c_arcano: tr('C. Arcano'), engano: tr('Engaño'), historia: tr('Historia'), interpretacion: tr('Interpretación'),
  intimidacion: tr('Intimidación'), investigacion: tr('Investigación'), juego_manos: tr('Juego de manos'), medicina: tr('Medicina'), naturaleza: tr('Naturaleza'),
  percepcion: tr('Percepción'), perspicacia: tr('Perspicacia'), persuasion: tr('Persuasión'), religion: tr('Religión'), sigilo: tr('Sigilo'), supervivencia: tr('Supervivencia'),
  trato_animales: tr('Trato con animales'),
};

export const ABILITY_LABELS: Record<string, string> = { fue: tr('Fuerza'), des: tr('Destreza'), con: tr('Constitución'), int: tr('Inteligencia'), sab: tr('Sabiduría'), car: tr('Carisma') };
