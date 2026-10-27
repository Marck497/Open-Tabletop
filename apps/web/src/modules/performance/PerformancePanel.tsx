import { useState } from 'react';
import { formatBytes, type CleanupResult, type PerformanceReport } from '@vtt/shared';
import { api } from '../../core/api';
import { tr } from '../../core/i18n';

/**
 * Panel de rendimiento para la Pi (DM, pestaña Ajustes): cómo va el servidor, cuánto ocupa la partida,
 * avisos de lo que pesa demasiado y limpieza de los archivos que no usa nada.
 */
export function PerformancePanel({ campaignId }: { campaignId: string }) {
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const { report } = await api.get<{ report: PerformanceReport }>(`/campaigns/${campaignId}/performance`);
      setReport(report);
      setChosen(report.unused.map((u) => u.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function cleanup() {
    if (!report) return;
    const orphans = report.orphanFiles > 0;
    if (!chosen.length && !orphans) return;
    if (!confirm(tr('¿Borrar {length} {1}{2}? No se puede deshacer.', { length: chosen.length, '1': chosen.length === 1 ? tr('archivo') : tr('archivos'), '2': orphans ? tr(' y los restos de subidas') : '' }))) return;
    setBusy(true);
    setError(null);
    try {
      const { result } = await api.post<{ result: CleanupResult }>(`/campaigns/${campaignId}/performance/cleanup`, { assetIds: chosen, orphans });
      setDone(tr('🧹 {removed} borrados, {1} liberados.', { removed: result.removed, '1': formatBytes(result.freed) }));
      await load();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const s = report?.server;
  return (
    <div className="panel perf">
      <div className="row spread">
        <h3>{tr('Rendimiento')}</h3>
        <button className="ghost small" onClick={() => void load()} disabled={busy}>
          {report ? tr('↻ Actualizar') : tr('📊 Analizar')}
        </button>
      </div>
      {!report && <p className="muted hint">{tr('Mira cómo va la Raspberry, qué ocupa la partida y qué archivos sobran.')}</p>}
      {error && <p className="error">{error}</p>}
      {done && <p className="hint">{done}</p>}
      {report && s && (
        <>
          <ul className="perf-stats">
            <li>
              {tr('Memoria del servidor:')}{' '}<strong>{formatBytes(s.rss)}</strong>{' '}{tr('· libre')}{' '}{formatBytes(s.freeMem)} {tr('de')} {formatBytes(s.totalMem)}
            </li>
            <li>
              {tr('CPU: carga')}{' '}{s.load} {tr('en')} {s.cpus}{' '}{tr('núcleos')}{s.cpuTemp !== null && <> · {s.cpuTemp} °C</>}
            </li>
            <li>
              {tr('Archivos de la partida:')}{' '}<strong>{formatBytes(report.disk.campaignFiles)}</strong> ({report.disk.campaignFileCount}{tr(') · base de datos')}{' '}{formatBytes(report.disk.database)}
              {report.disk.free !== null && <>{' '}{tr('· libre en disco')}{' '}{formatBytes(report.disk.free)}</>}
            </li>
            <li>
              {tr('Chat:')}{' '}{report.chatMessages}{' '}{tr('mensajes · escenas:')}{' '}{report.scenes.map((sc) => `${sc.name} (${sc.items})`).join(', ') || '—'}
            </li>
          </ul>

          {report.warnings.length ? (
            <ul className="perf-warnings">
              {report.warnings.map((w, i) => (
                <li key={i} className={w.level}>
                  {w.level === 'bad' ? '⛔' : '⚠'} {w.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">{tr('✅ Todo en orden: nada pesa demasiado.')}</p>
          )}

          {report.heavyAssets.length > 0 && (
            <details>
              <summary>{tr('Archivos pesados (')}{report.heavyAssets.length})</summary>
              <ul className="perf-list">
                {report.heavyAssets.map((a) => (
                  <li key={a.id}>
                    <span className="member-name">{a.name}</span> <span className="muted">{a.why}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {(report.unused.length > 0 || report.orphanFiles > 0) && (
            <details open>
              <summary>
                {tr('Sin usar (')}{report.unused.length}
                {report.orphanFiles ? tr(' + {orphanFiles} restos', { orphanFiles: report.orphanFiles }) : ''})
              </summary>
              <ul className="perf-list">
                {report.unused.map((a) => (
                  <li key={a.id}>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={chosen.includes(a.id)}
                        onChange={(e) => setChosen((l) => (e.target.checked ? [...l, a.id] : l.filter((x) => x !== a.id)))}
                      />
                      <span className="member-name">{a.name}</span>
                      <span className="muted">{formatBytes(a.size)}</span>
                    </label>
                  </li>
                ))}
                {report.orphanFiles > 0 && (
                  <li className="muted">
                    {report.orphanFiles}{' '}{tr('restos de subidas fallidas (')}{formatBytes(report.orphanBytes)}{tr('): se borran siempre.')}
                  </li>
                )}
              </ul>
              <p className="muted hint">{tr('Ningún token, hoja, documento, música ni mensaje los usa. Mira antes si quieres guardar alguno para más adelante.')}</p>
              <button className="small" onClick={() => void cleanup()} disabled={busy || (!chosen.length && !report.orphanFiles)}>
                {tr('🧹 Borrar lo marcado')}
              </button>
            </details>
          )}
        </>
      )}
    </div>
  );
}
