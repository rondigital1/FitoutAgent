import { Component, type ReactNode } from 'react';

export class AppBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="wk-stage">
      <div className="wk-stage__head">
        <span className="wk-label">Recovery</span>
        <h1>Let’s reopen your project</h1>
      </div>
      <div className="wk-panel">
        <p role="alert">This view could not load. Your saved project is still on this device.</p>
        <div className="wk-panel__actions">
          <button className="primary" onClick={() => window.location.reload()}>Reload project</button>
          <button onClick={() => { localStorage.removeItem('fitoutagent-thread'); window.location.reload(); }}>Start a new project</button>
        </div>
      </div>
    </main>;
  }
}
