"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Loader2, AlertCircle, Zap } from "lucide-react";
import { setAuth } from "@/lib/auth";
import { loginSchema, signupSchema } from "@/lib/validations";

const USERS = [
  { id: "test-user-0000-0000-0000-000000000001", name: "Taro (学生)", role: "student" },
  { id: "d853df1d-dcb7-407c-a9f8-0538aa70ee42", name: "お父さん (保護者)", role: "parent" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"supabase" | "demo">("demo");

  const handleRealLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      setError(result.error.issues.map(ee => ee.message).join(" / "));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Try our backend single-step login first (handles API-key compatibility)
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, full_name: "", role: "student" }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Invalid credentials");
      }
      const data = await res.json();
      setAuth(data.access_token, data.user_id);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = (userId: string) => {
    setAuth("demo-tok_***", userId);
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-100 p-3 rounded-full">
              <BookOpen className="w-8 h-8 text-blue-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome Back</h1>
          <p className="text-gray-500 text-sm">ログインして学習を始めましょう</p>
        </div>

        <div className="flex bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setMode("demo")}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition ${mode === "demo" ? "bg-white shadow text-blue-600" : "text-gray-500"}`}
          >
            <Zap className="w-3 h-3 inline mr-1" /> Demo
          </button>
          <button
            onClick={() => setMode("supabase")}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition ${mode === "supabase" ? "bg-white shadow text-blue-600" : "text-gray-500"}`}
          >
            Supabase Login
          </button>
        </div>

        {mode === "demo" ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 text-center">
              ローカル DB の既存テストユーザーでログイン
            </p>
            {USERS.map(u => (
              <button
                key={u.id}
                onClick={() => handleDemoLogin(u.id)}
                className="w-full p-3 border border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition flex items-center justify-between text-left"
              >
                <div>
                  <p className="font-medium text-sm">{u.name}</p>
                  <p className="text-[10px] text-gray-400 font-mono">{u.id.slice(0, 16)}...</p>
                </div>
                <span className={`text-[10px] px-2 py-1 rounded-full ${u.role === "parent" ? "bg-yellow-100 text-yellow-700" : "bg-blue-100 text-blue-700"}`}>
                  {u.role}
                </span>
              </button>
            ))}
            <div className="flex items-start gap-2 text-xs text-yellow-700 bg-yellow-50 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p>Demo モードは認証をバイパスして既存データを表示します。Supabase ログインは登録フローをスキップします（本番はメール確認が必要）。</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleRealLogin} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700 ml-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="email@example.com"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700 ml-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-red-500 text-xs text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign In"}
            </button>
          </form>
        )}

        <div className="text-center">
          <p className="text-sm text-gray-500">
            Don't have an account?{" "}
            <a href="/signup" className="text-blue-600 font-medium hover:underline">Sign up</a>
          </p>
        </div>
      </div>
    </div>
  );
}