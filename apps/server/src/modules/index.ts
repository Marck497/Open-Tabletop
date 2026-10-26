import type { ServerModule } from '../core/module.js';
import { aiModule } from './ai/index.js';
import { assetsModule } from './assets/index.js';
import { authModule } from './auth/index.js';
import { backupModule } from './backup/index.js';
import { boardModule } from './board/index.js';
import { campaignsModule } from './campaigns/index.js';
import { chatModule } from './chat/index.js';
import { damageModule } from './damage/index.js';
import { concentrationModule } from './concentration/index.js';
import { durationsModule } from './durations/index.js';
import { initiativeModule } from './initiative/index.js';
import { journalModule } from './journal/index.js';
import { jukeboxModule } from './jukebox/index.js';
import { lootModule } from './loot/index.js';
import { macrosModule } from './macros/index.js';
import { performanceModule } from './performance/index.js';
import { homebrewModule } from './homebrew/index.js';
import { presenceModule } from './presence/index.js';
import { sceneLibraryModule } from './scenelib/index.js';
import { sheetsModule } from './sheets/index.js';

/**
 * Registro de módulos del servidor. Para añadir una funcionalidad nueva
 * (tablero, hojas, dados...), crea su carpeta en `modules/` y añádela aquí.
 */
export const modules: ServerModule[] = [authModule, campaignsModule, presenceModule, assetsModule, boardModule, sheetsModule, chatModule, initiativeModule, aiModule, journalModule, macrosModule, homebrewModule, concentrationModule, durationsModule, lootModule, damageModule, jukeboxModule, backupModule, sceneLibraryModule, performanceModule];
