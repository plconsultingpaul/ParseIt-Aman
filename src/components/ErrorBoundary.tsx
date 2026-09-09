import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 border border-gray-200 dark:border-gray-700">
            <div className="text-center mb-6">
              <h1 className="text-3xl font-bold text-red-600 dark:text-red-400 mb-2">
                Something went wrong
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                The application encountered an unexpected error
              </p>
            </div>

            {this.state.error && (
              <div className="bg-gray-100 dark:bg-gray-900/50 rounded-lg p-4 mb-6">
                <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Error Details:</h2>
                <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap overflow-auto">
                  {this.state.error.message}
                </pre>
                {this.state.error.stack && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                      Stack Trace
                    </summary>
                    <pre className="mt-2 text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap overflow-auto">
                      {this.state.error.stack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="flex gap-4 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-2 bg-purple-600 dark:bg-purple-500 text-white rounded-lg hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors"
              >
                Reload Page
              </button>
              <button
                onClick={() => {
                  localStorage.clear();
                  window.location.reload();
                }}
                className="px-6 py-2 bg-gray-600 dark:bg-gray-700 text-white rounded-lg hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
              >
                Clear Cache & Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
