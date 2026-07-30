import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  info: ErrorInfo | null
}

/**
 * Renders the error instead of unmounting the tree.
 *
 * Without this, any render-time exception leaves a completely blank page with
 * no clue about what failed, which is indistinguishable from a routing bug.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info })
    // Surface the full stack in the browser console too.
    console.error('[ErrorBoundary] render failed:', error, info.componentStack)
  }

  render() {
    const { error, info } = this.state
    if (!error) return this.props.children

    return (
      <div
        role="alert"
        style={{
          padding: 24,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          color: '#7f1d1d',
          background: '#fef2f2',
          minHeight: '100vh',
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
          The app crashed while rendering
        </h1>
        <p style={{ marginBottom: 8 }}>
          <strong>{error.name}:</strong> {error.message}
        </p>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, marginBottom: 16 }}>{error.stack}</pre>
        {info?.componentStack && (
          <>
            <p style={{ fontWeight: 700 }}>Component stack</p>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{info.componentStack}</pre>
          </>
        )}
      </div>
    )
  }
}
