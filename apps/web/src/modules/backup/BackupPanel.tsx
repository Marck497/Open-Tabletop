import { useState } from 'react';
import { tr } from '../../core/i18n';

/** Descarga de la copia de seguridad de la partida (DM, en la pestaña Ajustes). */
export function BackupPanel({ campaignId }: { campaignId: string }) {
  const [files, setFiles] = useState(true);
  return (
    <div className="panel">
      <h3>{tr('Copia de seguridad')}</h3>
      <p className="muted hint">{tr('Guarda escenas, tokens, paredes, hojas, diario, macros y música en un archivo. Se restaura desde la lista de partidas.')}</p>
      <label className="switch">
        <input type="checkbox" checked={files} onChange={(e) => setFiles(e.target.checked)} />
        {tr('Incluir imágenes y música')}
      </label>
      <a className="button-like" href={`/api/campaigns/${campaignId}/export?files=${files ? 1 : 0}`} download>
        {tr('⬇ Descargar copia')}
      </a>
    </div>
  );
}
