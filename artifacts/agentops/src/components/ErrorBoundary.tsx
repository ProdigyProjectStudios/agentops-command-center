import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "@/components/ErrorState";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info);
  }

  handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="px-4 sm:px-6 lg:px-8 py-12 max-w-2xl mx-auto">
          <ErrorState
            title={this.props.fallbackTitle ?? "This view crashed"}
            description={
              this.state.error.message ||
              "An unexpected error interrupted the page. Reload to try again."
            }
            onRetry={this.handleReset}
            testId="error-boundary"
          />
        </div>
      );
    }
    return this.props.children;
  }
}
