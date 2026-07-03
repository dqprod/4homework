"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { buildHeaders, clearAuth, getUserId } from "@/lib/auth";
import { Settings, User, Baby, LogOut, Trash2, Plus, Mail, Info } from "lucide-react";

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [children, setChildren] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [newChildInput, setNewChildInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const uid = getUserId();
      if (!uid) { router.push("/login"); return; }
      try {
        const pRes = await fetch(`/api/profiles/me`, { headers: buildHeaders() });
        if (pRes.ok) {
          const p = await pRes.json();
          setProfile(p);
          setFullName(p.full_name || "");
          setUsername(p.username || "");
          if (p.role === "parent") {
            const cRes = await fetch(`/api/parent/children`, { headers: buildHeaders() });
            if (cRes.ok) setChildren((await cRes.json()).children || []);
          }
        }
      } catch {}
      setLoading(false);
    };
    init();
  }, []);

  const saveProfile = async () => {
    const uid = getUserId();
    if (!uid) return;
    setSaving(true);
    await fetch(`/api/profiles`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...buildHeaders() },
      body: JSON.stringify({ full_name: fullName, username }),
    });
    setSaving(false);
    alert("保存しました");
  };

  const addChild = async () => {
    if (!newChildInput.trim()) return;
    setAddError(null);
    setAddSuccess(null);
    const uid = getUserId();
    if (!uid) return;

    // Detect if input is email (contains @) or UUID
    const isEmail = newChildInput.includes("@");
    const body = isEmail ? { email: newChildInput.trim() } : { child_id: newChildInput.trim() };

    const res = await fetch(`/api/parent/child`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...buildHeaders() },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setNewChildInput("");
      const cRes = await fetch(`/api/parent/children`, { headers: buildHeaders() });
      if (cRes.ok) setChildren((await cRes.json()).children || []);
      setAddSuccess(`${isEmail ? "メール" : "ID"}で子供を追加しました`);
      setTimeout(() => setAddSuccess(null), 3000);
    } else {
      const err = await res.json();
      setAddError(err.error || "追加失敗");
    }
  };

  const removeChild = async (childId: string) => {
    if (!confirm("子供のリンクを解除しますか？")) return;
    const uid = getUserId();
    if (!uid) return;
    await fetch(`/api/parent/child/${childId}`, { method: "DELETE", headers: buildHeaders() });
    setChildren(children.filter(c => c.child_id !== childId));
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;

  return (
    <div className="max-w-2xl mx-auto p-3 md:p-4 space-y-6 md:space-y-8">
      <h1 className="text-lg md:text-2xl font-bold flex items-center gap-2"><Settings className="w-6 h-6 text-blue-600" /> 設定</h1>

      {/* Profile section */}
      <section className="bg-white p-4 md:p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase flex items-center gap-2"><User className="w-4 h-4" /> プロフィール</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">名前</label>
            <input value={fullName} onChange={e => setFullName(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">ユーザー名</label>
            <input value={username} onChange={e => setUsername(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">メール</label>
            <input value={profile?.id ? "●●●" : ""} disabled className="w-full border border-gray-100 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400" />
          </div>
          <button onClick={saveProfile} disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
            {saving ? "保存中..." : "保存する"}
          </button>
        </div>
      </section>

      {/* Child management (parent only) */}
      {profile?.role === "parent" && (
        <section className="bg-white p-4 md:p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase flex items-center gap-2"><Baby className="w-4 h-4" /> 子どもの管理</h2>

          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                value={newChildInput}
                onChange={e => setNewChildInput(e.target.value)}
                placeholder="子供のメールアドレス または ID (UUID)"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
              />
              <button onClick={addChild} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors flex items-center gap-1 shrink-0">
                <Plus className="w-4 h-4" /> 追加
              </button>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
              <Info className="w-3 h-3" />
              メールアドレスかUUIDを入力してください。例: hanako@homework.jp
            </div>
          </div>

          {addSuccess && (
            <div className="text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg">{addSuccess}</div>
          )}
          {addError && (
            <div className="text-xs text-red-700 bg-red-50 px-3 py-2 rounded-lg">{addError}</div>
          )}

          {children.length > 0 && (
            <div className="space-y-2 mt-3">
              <p className="text-xs text-gray-500 font-medium">登録済みの子供</p>
              {children.map(c => (
                <div key={c.child_id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{c.child_name}</p>
                    <p className="text-[10px] text-gray-400">
                      {c.total_problems}問 · 完了率 {Math.round(c.completion_rate * 100)}% · 期限超過 {c.due_reviews}件
                    </p>
                  </div>
                  <button onClick={() => removeChild(c.child_id)} className="text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="flex justify-center pt-4">
        <button onClick={() => { clearAuth(); router.push("/login"); }} className="flex items-center gap-2 text-red-500 text-sm font-medium hover:underline">
          <LogOut className="w-4 h-4" /> ログアウト
        </button>
      </div>
    </div>
  );
}
