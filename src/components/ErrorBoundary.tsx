import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Nom de l'écran/section pour le message. */
  label?: string;
  /** Callback pour revenir à un écran sûr (ex. Swipe). */
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Capture les crashs de rendu d'un sous-arbre React et affiche un écran de
 * secours (esthétique Citizen) au lieu d'un écran blanc total.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // Log console pour diagnostic (pas de télémétrie externe en mono-user)
    console.error('[Constellation] Crash capturé :', error, info);
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="citizen" style={{ width: '100%', minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{
          maxWidth: 540, width: '100%',
          background: 'var(--cit-cream)',
          border: '3px solid var(--cit-navy-dk)',
          boxShadow: '8px 8px 0 var(--cit-navy-dk)',
          padding: '24px 28px',
          position: 'relative', zIndex: 3,
        }}>
          <div className="cit-condensed" style={{ fontSize: 11, color: 'var(--cit-brick)' }}>
            ★ INCIDENT TECHNIQUE
          </div>
          <h2 className="cit-h1" style={{ fontSize: 34, lineHeight: 0.95, margin: '4px 0 12px' }}>
            LE BUREAU A TRÉBUCHÉ<span style={{ color: 'var(--cit-brick)' }}>!</span>
          </h2>
          <p className="cit-typed" style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--cit-navy-dk)', margin: 0 }}>
            {this.props.label ? `L'écran « ${this.props.label} » ` : 'Cet écran '}
            a rencontré une erreur inattendue. Vos données sont en sécurité (stockées
            localement, rien n'a été perdu).
          </p>
          <pre style={{
            marginTop: 12, padding: '10px 12px',
            background: 'var(--cit-paper-dk)',
            border: '2px solid var(--cit-navy-dk)',
            fontFamily: "'Special Elite', monospace", fontSize: 11,
            color: 'var(--cit-navy-dk)', whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: 120,
          }}>{this.state.error.message}</pre>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button onClick={this.reset} style={{
              background: 'var(--cit-brick)', color: 'var(--cit-cream)',
              border: '3px solid var(--cit-navy-dk)',
              padding: '10px 18px',
              fontFamily: "'Alfa Slab One', serif", fontSize: 15,
              letterSpacing: '.04em', cursor: 'pointer',
              boxShadow: '4px 4px 0 var(--cit-navy-dk)',
              textTransform: 'uppercase',
            }}>★ Réessayer</button>
            <button onClick={() => location.reload()} style={{
              background: 'var(--cit-cream)', color: 'var(--cit-navy-dk)',
              border: '3px solid var(--cit-navy-dk)',
              padding: '10px 18px',
              fontFamily: "'Alfa Slab One', serif", fontSize: 15,
              letterSpacing: '.04em', cursor: 'pointer',
              boxShadow: '4px 4px 0 var(--cit-navy-dk)',
              textTransform: 'uppercase',
            }}>↻ Recharger l'app</button>
          </div>
        </div>
      </div>
    );
  }
}
