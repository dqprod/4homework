"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ChevronLeft, Trash2, Edit2, Loader2, Plus, CheckCircle2 } from "lucide-react";
import { buildHeaders } from "@/lib/auth";

interface ProblemDetail {
  id: string;
  subject_name: string;
  original_image_url: string;
  problem_text: string;
  solution_steps: string | null;
  final_answer: string | null;
  memo: string | null;
}

export default function ProblemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string | undefined;

  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingMemo, setEditingMemo] = useState(false);
  const [memoDraft, setMemoDraft] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const fetchDetail = async () => {
      try {
        const res = await fetch(`/api/problems/${id}`, { headers: buildHeaders() });
        if (!res.ok) {
          setProblem(null);
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setProblem(data);
        setMemoDraft(data.memo || "");
        setLoading(false);
      } catch {
        setLoading(false);
      }
    };
    fetchDetail();
    return () => { cancelled = true; };
  }, [id]);

  const saveMemo = async () => {
    if (!id || !problem) return;
    await fetch(`/api/problems/${id}`, {
      method: "PATCH",
      headers: { ...buildHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ memo: memoDraft }),
    });
    setProblem({ ...problem, memo: memoDraft });
    setEditingMemo(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center">
        <p className="text-gray-500">問題が見つかりません</p>
        <button onClick={() => router.push("/dashboard")} className="mt-4 text-sm text-blue-600">
          ← 戻る
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-3 md:p-4 space-y-4 md:space-y-6">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
        <ChevronLeft className="w-4 h-4" /> ダッシュボード
      </button>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-3 md:p-4 bg-gray-50 border-b flex justify-between items-center">
          <span className="text-xs md:text-sm font-medium text-gray-600">{problem.subject_name}</span>
          <button onClick={async () => {
            if (confirm("削除しますか？")) {
              await fetch(`/api/problems/${id}`, { method: "DELETE", headers: buildHeaders() });
              router.push("/dashboard");
            }
          }} className="text-gray-400 hover:text-red-500">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 md:p-6 space-y-4 md:space-y-6">
          {problem.original_image_url && (
            <img src={problem.original_image_url} alt="Problem" className="w-full rounded-xl border" />
          )}

          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-400 uppercase">問題</label>
            <p className="text-base md:text-lg text-gray-800 leading-relaxed whitespace-pre-wrap">{problem.problem_text}</p>
          </div>

          {problem.solution_steps && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase">解き方</label>
              <div className="bg-blue-50 p-3 md:p-4 rounded-xl text-sm md:text-base text-gray-700 whitespace-pre-wrap">{problem.solution_steps}</div>
            </div>
          )}

          {problem.final_answer && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase">答え</label>
              <p className="text-xl md:text-2xl font-bold text-blue-600">{problem.final_answer}</p>
            </div>
          )}

          <div className="pt-4 md:pt-6 border-t space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-400 uppercase">📝 メモ</label>
              {!editingMemo && problem.memo !== undefined && (
                <button onClick={() => setEditingMemo(true)} className="text-blue-500 text-xs flex items-center gap-1">
                  <Edit2 className="w-3 h-3" /> 編集
                </button>
              )}
            </div>
            {editingMemo ? (
              <div className="flex gap-2">
                <textarea value={memoDraft} onChange={e => setMemoDraft(e.target.value)} className="flex-1 border rounded-lg p-2 text-sm" rows={3} />
                <div className="flex flex-col gap-2">
                  <button onClick={saveMemo} className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs">保存</button>
                  <button onClick={() => setEditingMemo(false)} className="bg-gray-100 px-3 py-1 rounded-lg text-xs">取消</button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-600 italic">{problem.memo || "メモはまだありません"}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}