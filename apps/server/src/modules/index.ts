import type { ServerModule } from '../core/module.js';
import { authModule } from './auth/index.js';
import { campaignsModule } from './campaigns/index.js';
import { presenceModule } from './presence/index.js';

/**
 * Registro de módulos del servidor. Para añadir una funcionalidad nueva
 * (tablero, hojas, dados...), crea su carpeta en `modules/` y añádela aquí.
 */
export const modules: ServerModule[] = [authModule, campaignsModule, presenceModule];
