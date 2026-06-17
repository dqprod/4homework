"use client";

import { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
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

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 max-w-md w-full mx-4 text-center space-y-4">
            <div className="flex justify-center">
              <div className="bg-red-100 p-3 rounded-full">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
            </div>
            <h2 className="text-lg font-bold text-gray-900">エラーが発生しました</h2>
            <p className="text-sm text-gray-500">
              予期しないエラーが発生しました。ページをリロードしてください。
            </p>
            <p className="text-xs text-gray-400 font-mono bg-gray-50 p-2 rounded line-clamp-2">
              {this.state.error?.message || "Unknown error"}
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                <RefreshCw className="w-4 h-4" /> リロード
              </button>
              <button
                onClick={() => (window.location.href = "/dashboard")}
                className="flex items-center gap-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
              >
                <Home className="w-4 h-4" /> ホーム
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
