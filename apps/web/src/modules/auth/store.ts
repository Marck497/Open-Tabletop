import { create } from 'zustand';
import type { LoginInput, PublicUser, RegisterInput } from '@vtt/shared';
import { api } from '../../core/api';
import { disconnectSocket } from '../../core/socket';

interface AuthState {
  user: PublicUser | null;
  loading: boolean;
  registrationCodeRequired: boolean;
  init: () => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,
  registrationCodeRequired: false,
  async init() {
    const [{ user }, cfg] = await Promise.all([
      api.get<{ user: PublicUser | null }>('/auth/me'),
      api.get<{ registrationCodeRequired: boolean }>('/auth/config'),
    ]);
    set({ user, loading: false, registrationCodeRequired: cfg.registrationCodeRequired });
  },
  async login(input) {
    const { user } = await api.post<{ user: PublicUser }>('/auth/login', input);
    set({ user });
  },
  async register(input) {
    const { user } = await api.post<{ user: PublicUser }>('/auth/register', input);
    set({ user });
  },
  async logout() {
    await api.post('/auth/logout');
    disconnectSocket();
    set({ user: null });
  },
}));
