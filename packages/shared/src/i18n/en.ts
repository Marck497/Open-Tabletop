import { PART1 } from './en/part1.js';
import { PART2 } from './en/part2.js';
import { PART3 } from './en/part3.js';
import { PART4 } from './en/part4.js';
import { PART5 } from './en/part5.js';
import { PART6 } from './en/part6.js';
import { PART7 } from './en/part7.js';
import { MONSTERS_EN } from './en/monsters.js';
import { SRD_EN } from './en/srd.js';

/** Español → inglés, por zonas del programa. Los nombres del SRD van primero: lo escrito a mano manda. */
export const EN: Record<string, string> = { ...SRD_EN, ...PART1, ...PART2, ...PART3, ...PART4, ...PART5, ...PART6, ...PART7, ...MONSTERS_EN };
