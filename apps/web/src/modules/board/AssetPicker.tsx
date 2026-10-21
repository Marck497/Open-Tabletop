import { useEffect, useRef, useState } from 'react';
import { assetUrl, type Asset } from '@vtt/shared';
import { api } from '../../core/api';
import { uploadAsset } from './assets';

interface Props {
  campaignId: string;
  onPick: (asset: Asset) => void;
  onClose: () => void;
}

/** Biblioteca de imágenes de la partida: subir nuevas o elegir una ya subida. */
export function AssetPicker({ campaignId, onPick, onClose }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Aquí solo imágenes (el audio se gestiona en la música).
    api.get<{ assets: Asset[] }>(`/campaigns/${campaignId}/assets`).then((r) => setAssets(r.assets.filter((a) => a.mime.startsWith('image/'))), (e) => setError(e.message));
  }, [campaignId]);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      const uploaded: Asset[] = [];
      for (const f of Array.from(files)) uploaded.push(await uploadAsset(campaignId, f));
      setAssets((a) => [...uploaded, ...a]);
      if (uploaded.length === 1) onPick(uploaded[0]!);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(asset: Asset) {
    if (!confirm(`¿Borrar "${asset.name}"? Los elementos que la usen se quedarán sin imagen.`)) return;
    await api.delete(`/assets/${asset.id}`);
    setAssets((a) => a.filter((x) => x.id !== asset.id));
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="row spread">
          <h2>Imágenes</h2>
          <button className="ghost small" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div
          className="dropzone"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void onFiles(e.dataTransfer.files);
          }}
        >
          {busy ? 'Subiendo…' : 'Arrastra imágenes aquí o haz clic para subir (PNG, JPG, WEBP, GIF, SVG)'}
          <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.target.files)} />
        </div>
        {error && <p className="error">{error}</p>}
        <ul className="asset-grid">
          {assets.map((a) => (
            <li key={a.id}>
              <button className="asset-thumb" onClick={() => onPick(a)} title={a.name}>
                <img src={assetUrl(a.id)} alt={a.name} loading="lazy" />
              </button>
              <button className="ghost small danger" onClick={() => void remove(a)} title="Borrar">
                ✕
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
