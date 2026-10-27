import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { CHAT_HELP, parseTutorialCommand, type CampaignMember, type ChatMessage } from '@vtt/shared';
import { api } from '../../core/api';
import { emitAck } from '../../core/socket';
import { RollDetail } from '../dice/RollDetail';
import { useSheets } from '../sheets/store';
import { useTutorial } from '../tutorial/store';
import { useChat } from './useChat';
import { tr } from '../../core/i18n';

interface Props {
  campaignId: string;
  isGm: boolean;
  meId: string;
  members: CampaignMember[];
}

export function ChatPanel({ campaignId, isGm, meId, members }: Props) {
  const { messages, hasMore, loadOlder } = useChat(campaignId);
  const characters = useSheets((s) => s.characters);
  const mine = Object.values(characters).filter((c) => isGm || c.controlledBy.includes(meId));
  const [text, setText] = useState('');
  const [as, setAs] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const history = useRef<string[]>([]);
  const historyIdx = useRef(-1);

  // Bajar al último mensaje salvo que el usuario esté leyendo más arriba.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);
  useEffect(() => {
    if (as && !characters[as]) setAs('');
  }, [as, characters]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    // /tutorial no es un mensaje: abre el recorrido guiado aquí mismo.
    const tour = parseTutorialCommand(value);
    if (tour) {
      setText('');
      setError(null);
      useTutorial.getState().start(isGm && tour.role !== 'player' ? 'gm' : 'player');
      return;
    }
    try {
      await emitAck('chat:send', { campaignId, text: value, asCharacterId: as || null });
      history.current = [value, ...history.current.slice(0, 30)];
      historyIdx.current = -1;
      setText((t) => (t === value || t.trim() === value ? '' : t));
      setError(null);
      stick.current = true;
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const nameOf = (id: string) => members.find((m) => m.id === id)?.displayName ?? '¿?';

  return (
    <div className="chat">
      <div
        className="chat-list"
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {hasMore && messages.length > 0 && (
          <button className="ghost small load-older" onClick={() => void loadOlder()}>
            {tr('Cargar anteriores')}
          </button>
        )}
        {messages.length === 0 && <p className="muted hint">{tr('Aún no hay mensajes. Prueba con')}{' '}<code>/r 1d20</code>.</p>}
        {messages.map((m) => (
          <Message key={m.id} m={m} meId={meId} isGm={isGm} nameOf={nameOf} />
        ))}
      </div>
      {showHelp && (
        <ul className="chat-help">
          {CHAT_HELP.map(([cmd, desc]) => (
            <li key={cmd}>
              <code onClick={() => setText(cmd.split(' ')[0] + ' ')}>{cmd}</code> {desc}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error chat-error">{error}</p>}
      <form className="chat-form" onSubmit={send}>
        <div className="row">
          {mine.length > 0 && (
            <select value={as} onChange={(e) => setAs(e.target.value)} title={tr('Hablar como')}>
              <option value="">{tr('Yo')}</option>
              {mine.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="ghost small" onClick={() => setShowHelp((v) => !v)} title={tr('Comandos')}>
            ?
          </button>
          {isGm && (
            <button
              type="button"
              className="ghost small danger"
              title={tr('Vaciar chat')}
              onClick={() => confirm(tr('¿Borrar todo el historial del chat?')) && void api.delete(`/campaigns/${campaignId}/chat`)}
            >
              {tr('Vaciar')}
            </button>
          )}
        </div>
        <input
          value={text}
          placeholder={tr('Escribe o tira: /r 1d20+3')}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Flechas: recorrer lo enviado antes.
            if (e.key === 'ArrowUp' && history.current.length) {
              historyIdx.current = Math.min(historyIdx.current + 1, history.current.length - 1);
              setText(history.current[historyIdx.current]!);
              e.preventDefault();
            } else if (e.key === 'ArrowDown' && historyIdx.current >= 0) {
              historyIdx.current -= 1;
              setText(historyIdx.current >= 0 ? history.current[historyIdx.current]! : '');
              e.preventDefault();
            }
          }}
        />
      </form>
    </div>
  );
}

function Message({ m, meId, isGm, nameOf }: { m: ChatMessage; meId: string; isGm: boolean; nameOf: (id: string) => string }) {
  const who = m.characterName ?? m.userName;
  const time = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (m.kind === 'roll' && m.roll)
    return (
      <div className={`chat-msg roll-msg ${m.secret ? 'secret' : ''}`} title={time}>
        <RollDetail message={m} roll={m.roll} isGm={isGm} />
      </div>
    );
  if (m.kind === 'emote')
    return (
      <div className={`chat-msg emote ${m.secret ? 'secret' : ''}`} title={time}>
        <em>
          {who} {m.text}
        </em>
      </div>
    );
  return (
    <div className={`chat-msg ${m.whisperTo ? 'whisper' : ''}`} title={time}>
      <strong>{who}</strong>
      {m.characterName && <small className="muted"> ({m.userName})</small>}
      {m.whisperTo && (
        <small className="muted"> {m.userId === meId ? tr('susurra a {0}', { '0': m.whisperTo.map(nameOf).join(', ') }) : tr('te susurra')}</small>
      )}
      : <span className="chat-text">{m.text}</span>
    </div>
  );
}
