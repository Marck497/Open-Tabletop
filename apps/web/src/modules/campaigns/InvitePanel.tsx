import { useState } from 'react';
import { api } from '../../core/api';

export function InvitePanel({ campaignId, inviteCode }: { campaignId: string; inviteCode: string }) {
  const [code, setCode] = useState(inviteCode);
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/join/${code}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      prompt('Copia este enlace:', link);
    }
  }

  async function regenerate() {
    if (!confirm('El enlace actual dejará de funcionar. ¿Seguro?')) return;
    const res = await api.post<{ inviteCode: string }>(`/campaigns/${campaignId}/invite`);
    setCode(res.inviteCode);
  }

  return (
    <div className="panel">
      <h3>Invitar jugadores</h3>
      <p className="muted">Comparte este enlace o el código:</p>
      <code className="invite-code">{code}</code>
      <div className="row">
        <button className="small" onClick={copy}>
          {copied ? '¡Copiado!' : 'Copiar enlace'}
        </button>
        <button className="ghost small" onClick={regenerate}>
          Nuevo código
        </button>
      </div>
    </div>
  );
}
