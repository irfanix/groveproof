// Safety net: if one part of a page crashes, show a friendly message instead of a blank website.
import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("GroveProof page error:", error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="panel p-6 max-w-xl mx-auto text-center space-y-3">
        <h2 className="text-2xl font-bold">Something went wrong on this page</h2>
        <p className="muted">The rest of GroveProof still works. Try again, or go back to the home page.</p>
        <p className="text-xs muted mono break-all">{String(this.state.error?.message || this.state.error)}</p>
        <div className="flex justify-center gap-3">
          <button className="btn-main" onClick={() => this.setState({ error: null })}>Try again</button>
          <a className="btn-quiet" href="/">Home</a>
        </div>
      </section>
    );
  }
}
