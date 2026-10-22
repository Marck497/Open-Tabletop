import { useEffect, useState } from 'react';
import { assetUrl, type CampaignMember, type Handout, type UpdateHandoutInput } from '@vtt/shared';
import { api } from '../../core/api';
import { AssetPicker } from '../board/AssetPicker';
import { RichText } from './RichText';
import { useJournal } from './store';

interface Props {
  campaignId: string;
  isGm: boolean;
  members: CampaignMember[];
}

/** Documento abierto: lectura para todos y edición para el DM. */
export function HandoutWindow({ campaignId, isGm, members }: Props) {
  const handout = useJournal((s) => (s.openId ? s.handouts[s.openId] : undefined));
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [handout?.id]);
  if (!handout) return null;
  const close = () => useJournal.getState().open(null);

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="card modal handout" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={handout.title}>
        <div className="row spread">
          <h2>{handout.title}</h2>
          <span className="row">
            {isGm && (
              <button className="ghost small" onClick={() => setEditing((v) => !v)}>
                {editing ? 'Ver' : '✎ Editar'}
              </button>
            )}
            <button className="ghost small" onClick={close} title="Cerrar">
              ✕
            </button>
          </span>
        </div>
        {editing ? (
          <HandoutEditor key={handout.id} campaignId={campaignId} handout={handout} members={members} />
        ) : (
          <>
            {handout.imageAssetId && <img className="handout-image" src={assetUrl(handout.imageAssetId)} alt="" />}
            {handout.body ? <RichText text={handout.body} /> : !handout.imageAssetId && <p className="muted">(Vacío)</p>}
            {isGm && handout.gmNotes && (
              <div className="gm-notes">
                <strong>Notas del DM</strong>
                <RichText text={handout.gmNotes} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function HandoutEditor({ campaignId, handout, members }: { campaignId: string; handout: Handout; members: CampaignMember[] }) {
  const [form, setForm] = useState({ title: handout.title, body: handout.body, gmNotes: handout.gmNotes });
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const players = members.filter((m) => m.role === 'player');

  const save = (patch: UpdateHandoutInput) =>
    api.patch<{ handout: Handout }>(`/handouts/${handout.id}`, patch).then(
      (r) => {
        setError(null);
        useJournal.getState().upsert(r.handout);
      },
      (e: Error) => setError(e.message),
    );
  const saveText = (key: keyof typeof form) => form[key] !== handout[key] && (key !== 'title' || form.title.trim()) && void save({ [key]: form[key] });
  const toggle = (id: string) => void save({ sharedWith: handout.sharedWith.includes(id) ? handout.sharedWith.filter((x) => x !== id) : [...handout.sharedWith, id] });
  const shared = handout.visibleToAll || handout.sharedWith.length > 0;

  return (
    <div className="handout-editor">
      <label>
        Título
        <input value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} onBlur={() => saveText('title')} />
      </label>
      <div className="row">
        <button className="small" onClick={() => setPicker(true)}>
          {handout.imageAssetId ? 'Cambiar imagen' : 'Poner imagen'}
        </button>
        {handout.imageAssetId && (
          <button className="ghost small" onClick={() => void save({ imageAssetId: null })}>
            Quitar imagen
          </button>
        )}
      </div>
      <label>
        Texto <small className="muted"># título, **negrita**, *cursiva*, - lista</small>
        <textarea rows={8} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} onBlur={() => saveText('body')} />
      </label>
      <label>
        Notas del DM <small className="muted">(los jugadores nunca las reciben)</small>
        <textarea rows={3} value={form.gmNotes} onChange={(e) => setForm({ ...form, gmNotes: e.target.value })} onBlur={() => saveText('gmNotes')} />
      </label>
      <fieldset className="owners">
        <legend>Quién puede verlo</legend>
        <label className="switch">
          <input type="checkbox" checked={handout.visibleToAll} onChange={(e) => void save({ visibleToAll: e.target.checked })} />
          Todos los jugadores
        </label>
        {!handout.visibleToAll &&
          players.map((p) => (
            <label key={p.id} className="switch">
              <input type="checkbox" checked={handout.sharedWith.includes(p.id)} onChange={() => toggle(p.id)} />
              {p.displayName}
            </label>
          ))}
      </fieldset>
      {error && <p className="error">{error}</p>}
      <div className="row spread">
        <button
          className="ghost small danger"
          onClick={() => confirm(`¿Borrar "${handout.title}"?`) && void api.delete(`/handouts/${handout.id}`).then(() => useJournal.getState().remove(handout.id))}
        >
          Borrar
        </button>
        <button
          className="small primary"
          disabled={!shared}
          title={shared ? 'Se abre en la pantalla de quienes pueden verlo' : 'Compártelo antes con algún jugador'}
          onClick={() => void api.post(`/handouts/${handout.id}/show`, {}).catch((e: Error) => setError(e.message))}
        >
          👁 Enseñar a la mesa
        </button>
      </div>
      {picker && (
        <AssetPicker
          campaignId={campaignId}
          onClose={() => setPicker(false)}
          onPick={(a) => {
            setPicker(false);
            void save({ imageAssetId: a.id });
          }}
        />
      )}
    </div>
  );
}
