import { z } from 'zod';
import { tr } from '../i18n/index.js';

export const usernameSchema = z
  .string()
  .trim()
  .min(3, tr('Mínimo 3 caracteres'))
  .max(32, tr('Máximo 32 caracteres'))
  .regex(/^[a-zA-Z0-9_.-]+$/, tr('Solo letras, números, "_", "." y "-"'));

export const registerSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().min(1).max(48),
  password: z.string().min(8, tr('Mínimo 8 caracteres')).max(200),
  registrationCode: z.string().optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
}
