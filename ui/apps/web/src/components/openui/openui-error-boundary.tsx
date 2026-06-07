"use client";

// The report dashboard is MODEL-authored openui-lang, so it can be malformed in
// ways the <Renderer> can't absorb. This boundary keeps a bad report from
// blanking/crashing the canvas — it falls back to the markdown report (passed in
// by the caller) or a friendly note. Keyed on the source upstream so a fresh
// (valid) report resets the error state.

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

export class OpenUIErrorBoundary extends Component<
  Props,
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Degrade gracefully; surface for debugging without breaking the page.
    console.error("OpenUI report failed to render:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            The interactive dashboard couldn&apos;t be rendered. The report text
            is available in the file switcher above.
          </div>
        )
      );
    }
    return this.props.children;
  }
}
