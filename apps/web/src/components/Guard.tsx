import { Component, type ErrorInfo, type ReactNode } from 'react';
import { tr } from '../core/i18n';

interface Props {
  /** Qué zona protege, para el aviso («la hoja», «el chat»…). Sin nombre, es la página entera. */
  area?: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Si algo de dentro falla al dibujarse, enseña un aviso en su sitio en vez de dejar la pantalla en
 * blanco: el resto de la mesa sigue funcionando. «Reintentar» lo vuelve a dibujar.
 */
export class Guard extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Fallo en ${this.props.area ?? 'la página'}:`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // Tras actualizar el servidor, las partes de la web que aún no se habían cargado ya no existen: hay que recargar.
    const stale = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(error.message);
    return (
      <div className="guard-error" role="alert">
        <p>
          {stale
            ? tr('Hay una versión nueva de la mesa. Recarga la página para usarla.')
            : this.props.area
              ? tr('Algo ha fallado en {area}. El resto de la mesa sigue funcionando.', { area: this.props.area })
              : tr('Algo ha fallado.')}
        </p>
        {!stale && <small className="muted">{error.message}</small>}
        <div className="row">
          {!stale && this.props.area && (
            <button className="small" onClick={() => this.setState({ error: null })}>
              {tr('Reintentar')}
            </button>
          )}
          <button className="small ghost" onClick={() => location.reload()}>
            {tr('Recargar la página')}
          </button>
        </div>
      </div>
    );
  }
}
