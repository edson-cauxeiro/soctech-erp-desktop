import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportLovableError } from "../lib/lovable-error-reporting";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
    reportLovableError(error, { boundary: "app_error_boundary" });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    // `HashRouter`: recarregar tem de ir para o fragmento, não para o
    // `pathname` — em `file:` o `pathname` é o caminho do ficheiro e
    // resultaria numa página em branco.
    window.location.hash = "#/";
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <div className="max-w-md text-center">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Esta página não carregou
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Algo correu mal. Pode tentar recarregar ou regressar ao início.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button
                onClick={this.handleRetry}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Tentar novamente
              </button>
              <button
                onClick={this.handleReset}
                className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Ir para o início
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
