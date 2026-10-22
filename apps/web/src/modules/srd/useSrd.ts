import { useEffect, useState } from 'react';
import { loadSrd, type SrdData } from '@vtt/shared';

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
  acrobacias: 'Acrobacias', atletismo: 'Atletismo', c_arcano: 'C. Arcano', engano: 'Engaño', historia: 'Historia', interpretacion: 'Interpretación',
  intimidacion: 'Intimidación', investigacion: 'Investigación', juego_manos: 'Juego de manos', medicina: 'Medicina', naturaleza: 'Naturaleza',
  percepcion: 'Percepción', perspicacia: 'Perspicacia', persuasion: 'Persuasión', religion: 'Religión', sigilo: 'Sigilo', supervivencia: 'Supervivencia',
  trato_animales: 'Trato con animales',
};

export const ABILITY_LABELS: Record<string, string> = { fue: 'Fuerza', des: 'Destreza', con: 'Constitución', int: 'Inteligencia', sab: 'Sabiduría', car: 'Carisma' };
