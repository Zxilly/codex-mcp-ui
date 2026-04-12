import type { ErrorInfo, ReactNode } from "react"
import { Component } from "react"

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("codex-mcp-ui: unhandled error", error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background p-8 text-foreground"
        >
          <div className="max-w-xl space-y-3">
            <h1 className="text-lg font-semibold">Dashboard stopped rendering</h1>
            <p className="text-sm text-muted-foreground">
              An unexpected error occurred. The hub may still be running — open
              the browser console for details or retry.
            </p>
            <pre className="max-h-60 overflow-auto rounded-md border bg-muted p-3 font-mono text-xs">
              {this.state.error.message}
            </pre>
            <button
              type="button"
              onClick={this.reset}
              className="rounded-md border px-3 py-1 text-sm font-medium hover:bg-muted"
            >
              Retry
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
