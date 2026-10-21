import { useEffect } from 'react';
import type { Character, SheetTemplate } from '@vtt/shared';
import { api } from '../../core/api';
import { getSocket } from '../../core/socket';
import { useSheets } from './store';

/** Carga la plantilla y los personajes visibles de la partida y los mantiene al día. */
export function useSheetsSync(campaignId: string) {
  useEffect(() => {
    const s = useSheets.getState;
    const loadTemplate = () =>
      api.get<{ template: SheetTemplate }>(`/campaigns/${campaignId}/sheet-template`).then((r) => s().setTemplate(r.template));
    const loadCharacters = () =>
      api.get<{ characters: Character[] }>(`/campaigns/${campaignId}/characters`).then((r) => s().setCharacters(r.characters));
    void loadTemplate();
    void loadCharacters();

    const socket = getSocket();
    const onTemplate = (p: { campaignId: string }) => p.campaignId === campaignId && void loadTemplate();
    const onUpsert = ({ character }: { character: Character }) => character.campaignId === campaignId && s().upsert(character);
    const onRemove = (p: { campaignId: string; id: string }) => p.campaignId === campaignId && s().remove(p.id);
    // Al reconectar puede haberse perdido algún cambio: recargar.
    const onConnect = () => void loadCharacters();
    socket.on('template:updated', onTemplate);
    socket.on('character:upserted', onUpsert);
    socket.on('character:removed', onRemove);
    socket.on('connect', onConnect);
    return () => {
      socket.off('template:updated', onTemplate);
      socket.off('character:upserted', onUpsert);
      socket.off('character:removed', onRemove);
      socket.off('connect', onConnect);
      s().reset();
    };
  }, [campaignId]);
}
