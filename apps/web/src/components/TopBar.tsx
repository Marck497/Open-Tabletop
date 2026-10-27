import { Link } from 'react-router-dom';
import { useAuth } from '../modules/auth/store';
import { tr } from '../core/i18n';
import { LangSelect } from './LangSelect';

export function TopBar() {
  const { user, logout } = useAuth();
  return (
    <header className="topbar">
      <Link to="/" className="brand">
        <img src="/d20.svg" alt="" width={24} /> Mesa de Rol
      </Link>
      <div className="row">
        <LangSelect />
        {user && (
          <>
            <span className="muted">{user.displayName}</span>
            <button className="ghost small" onClick={() => void logout()}>
              {tr('Salir')}
            </button>
          </>
        )}
      </div>
    </header>
  );
}
