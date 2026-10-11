import { Component } from "react";

export default class SafeBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.warn(`Skipped "${this.props.name ?? "scene part"}":`, error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
