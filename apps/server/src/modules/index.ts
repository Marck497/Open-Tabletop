import type { ServerModule } from '../core/module.js';
import { assetsModule } from './assets/index.js';
import { authModule } from './auth/index.js';
import { boardModule } from './board/index.js';
import { campaignsModule } from './campaigns/index.js';
import { chatModule } from './chat/index.js';
import { initiativeModule } from './initiative/index.js';
import { presenceModule } from './presence/index.js';
import { sheetsModule } from './sheets/index.js';

/**
 * Registro de módulos del servidor. Para añadir una funcionalidad nueva
 * (tablero, hojas, dados...), crea su carpeta en `modules/` y añádela aquí.
 */
export const modules: ServerModule[] = [authModule, campaignsModule, presenceModule, assetsModule, boardModule, sheetsModule, chatModule, initiativeModule];
