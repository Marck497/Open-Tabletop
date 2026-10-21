import { Link } from 'react-router-dom';
import { useAuth } from '../modules/auth/store';

export function TopBar() {
  const { user, logout } = useAuth();
  return (
    <header className="topbar">
      <Link to="/" className="brand">
        <img src="/d20.svg" alt="" width={24} /> Mesa de Rol
      </Link>
      {user && (
        <div className="row">
          <span className="muted">{user.displayName}</span>
          <button className="ghost small" onClick={() => void logout()}>
            Salir
          </button>
        </div>
      )}
    </header>
  );
}
