import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

type Props = { children: ReactNode };

type State = { hasError: boolean; message?: string };

class ErrorBoundaryClass extends Component<Props & { errorTitle: string; reloadLabel: string }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
          <div className="df-card df-card--elevated max-w-lg p-8">
            <h1 className="text-lg font-black text-slate-900">{this.props.errorTitle}</h1>
            <p className="mt-2 text-sm text-slate-600">{this.state.message ?? ''}</p>
            <button
              type="button"
              className="df-btn df-btn--primary mt-6 w-full"
              onClick={() => window.location.reload()}
            >
              {this.props.reloadLabel}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const ErrorBoundary: React.FC<Props> = ({ children }) => {
  const { t } = useTranslation();
  return (
    <ErrorBoundaryClass errorTitle={t('common.error')} reloadLabel={t('shell.reload')}>
      {children}
    </ErrorBoundaryClass>
  );
};
