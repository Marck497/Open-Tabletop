import { tokenStatsFor, type BoardItem, type CampaignRole, type Character, type SheetTemplate } from '@vtt/shared';
import type { AppContext } from '../../core/module.js';
import { createSheetService } from '../sheets/service.js';

/**
 * Añade a los tokens vinculados a una hoja su vida y CA, filtradas para quien las recibe
 * (`tokenStatsFor`). Cada llamada a `forCampaign` lee la plantilla y las hojas una sola vez.
 */
export function createStatsDecorator(ctx: AppContext) {
  const sheets = createSheetService(ctx);
  return (campaignId: string) => {
    let template: SheetTemplate | undefined;
    const characters = new Map<string, Character | null>();
    const characterOf = (id: string) => {
      if (!characters.has(id)) {
        let c: Character | null = null;
        try {
          c = sheets.row(id);
        } catch {
          /* hoja borrada */
        }
        characters.set(id, c && c.campaignId === campaignId ? c : null);
      }
      return characters.get(id)!;
    };
    return (item: BoardItem, role: CampaignRole, userId: string): BoardItem => {
      if (!item.characterId || item.drawing) return item;
      const character = characterOf(item.characterId);
      if (!character) return item;
      template ??= sheets.getTemplate(campaignId);
      return { ...item, stats: tokenStatsFor(item, template, character.values, { gm: role === 'gm', userId }) };
    };
  };
}
