import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './store';
import { tr } from '../../core/i18n';
import { LangSelect } from '../../components/LangSelect';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { login, register, registrationCodeRequired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';
  const [form, setForm] = useState({ username: '', displayName: '', password: '', registrationCode: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await login({ username: form.username, password: form.password });
      else await register({ ...form, registrationCode: form.registrationCode || undefined });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={onSubmit}>
        <h1>
          <img src="/d20.svg" alt="" width={32} /> Mesa de Rol
          <span className="auth-lang">
            <LangSelect />
          </span>
        </h1>
        <h2>{mode === 'login' ? tr('Iniciar sesión') : tr('Crear cuenta')}</h2>
        <label>
          {tr('Usuario')}
          <input autoComplete="username" required {...field('username')} />
        </label>
        {mode === 'register' && (
          <label>
            {tr('Nombre visible')}
            <input required maxLength={48} {...field('displayName')} />
          </label>
        )}
        <label>
          {tr('Contraseña')}
          <input
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={mode === 'register' ? 8 : undefined}
            {...field('password')}
          />
        </label>
        {mode === 'register' && registrationCodeRequired && (
          <label>
            {tr('Código de registro')}{' '}<small>{tr('(te lo da el DM)')}</small>
            <input required {...field('registrationCode')} />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>
          {mode === 'login' ? tr('Entrar') : tr('Crear cuenta')}
        </button>
        <p className="muted">
          {mode === 'login' ? (
            <>
              {tr('¿No tienes cuenta?')}{' '}<Link to="/register" state={location.state}>{tr('Regístrate')}</Link>
            </>
          ) : (
            <>
              {tr('¿Ya tienes cuenta?')}{' '}<Link to="/login" state={location.state}>{tr('Inicia sesión')}</Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
