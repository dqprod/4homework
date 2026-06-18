"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 max-w-md w-full text-center space-y-4">
        <div className="flex justify-center">
          <div className="bg-red-100 p-3 rounded-full">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
        </div>
        <h2 className="text-lg font-bold text-gray-900">ページエラー</h2>
        <p className="text-sm text-gray-500">
          このページの読み込み中に問題が発生しました。
        </p>
        <p className="text-xs text-gray-400 font-mono bg-gray-50 p-2 rounded line-clamp-2">
          {error.message || "Unknown"}
        </p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={reset}
            className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            <RefreshCw className="w-4 h-4" /> 再試行
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
