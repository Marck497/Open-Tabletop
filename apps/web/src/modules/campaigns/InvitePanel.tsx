import { useState } from 'react';
import { api } from '../../core/api';
import { tr } from '../../core/i18n';

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
      prompt(tr('Copia este enlace:'), link);
    }
  }

  async function regenerate() {
    if (!confirm(tr('El enlace actual dejará de funcionar. ¿Seguro?'))) return;
    const res = await api.post<{ inviteCode: string }>(`/campaigns/${campaignId}/invite`);
    setCode(res.inviteCode);
  }

  return (
    <div className="panel">
      <h3>{tr('Invitar jugadores')}</h3>
      <p className="muted">{tr('Comparte este enlace o el código:')}</p>
      <code className="invite-code">{code}</code>
      <div className="row">
        <button className="small" onClick={copy}>
          {copied ? tr('¡Copiado!') : tr('Copiar enlace')}
        </button>
        <button className="ghost small" onClick={regenerate}>
          {tr('Nuevo código')}
        </button>
      </div>
    </div>
  );
}
