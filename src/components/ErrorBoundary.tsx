import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught error:", error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div
          data-testid="error-boundary-fallback"
          className="p-3 my-1 border border-red-900/50 bg-red-950/20 rounded-sm text-xs font-mono text-red-300 flex flex-col gap-2 items-start"
        >
          <span>{this.props.fallbackMessage ?? "Something went wrong in this tool"}</span>
          <button
            type="button"
            onClick={this.handleRetry}
            className="px-2 py-1 text-[10px] uppercase tracking-wider text-white border border-n-border hover:border-white rounded-sm transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
