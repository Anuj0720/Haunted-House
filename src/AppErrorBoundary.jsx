import { Component } from "react";

// Without this, any error thrown while the 3D scene renders unmounts the whole
// page and leaves a plain dark screen with no clue why. This shows the actual
// error (and a reload button) instead.
export default class AppErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[AppErrorBoundary]", error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="hh-fatal" role="alert">
        <h1>The scene could not start</h1>
        <p>Something failed while loading. Details (also in the browser console):</p>
        <pre>{String(error?.message || error)}</pre>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
