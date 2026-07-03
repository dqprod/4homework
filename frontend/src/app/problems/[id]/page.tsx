"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { ChevronLeft, Trash2, Edit2, Loader2, Plus, CheckCircle2, XCircle, Calendar, Star } from "lucide-react";
import { buildHeaders } from "@/lib/auth";

interface ReviewSchedule {
  id: string;
  review_stage: number;
  scheduled_date: string;
  completed: boolean;
  completed_at: string | null;
  next_review_interval: number | null;
}

interface ManualReview {
  id: string;
  scheduled_date: string;
  note: string | null;
  completed: boolean;
}

interface ProblemDetail {
  id: string;
  subject_name: string;
  original_image_url: string;
  problem_text: string;
  solution_steps: string | null;
  final_answer: string | null;
  memo: string | null;
  review_schedules: ReviewSchedule[];
  manual_reviews: ManualReview[];
}

function StarRating({ value, onChange, size = "sm" }: { value: number; onChange: (v: number) => void; size?: string }) {
  const sizeClass = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className={`${sizeClass} transition-colors ${star <= value ? "text-yellow-400" : "text-gray-200 hover:text-yellow-300"}`}
        >
          <Star className="w-full h-full fill-current" />
        </button>
      ))}
    </div>
  );
}

export default function ProblemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string | undefined;

  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingMemo, setEditingMemo] = useState(false);
  const [memoDraft, setMemoDraft] = useState("");
  const [manualDate, setManualDate] = useState("");
  const [addingManual, setAddingManual] = useState(false);
  const [feedbackReviewId, setFeedbackReviewId] = useState<string | null>(null);
  const [feedbackRating, setFeedbackRating] = useState(0);

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/problems/${id}`, { headers: buildHeaders() });
      if (!res.ok) { setProblem(null); setLoading(false); return; }
      const data = await res.json();
      setProblem(data);
      setMemoDraft(data.memo || "");
      setLoading(false);
    } catch { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

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

  const toggleReviewStatus = async (reviewId: string, completed: boolean) => {
    await fetch(`/api/reviews/${reviewId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...buildHeaders() },
      body: JSON.stringify({ completed: !completed }),
    });
    if (!completed) {
      // Just marked as complete — show feedback dialog
      setFeedbackReviewId(reviewId);
      setFeedbackRating(0);
    } else {
      fetchDetail();
    }
  };

  const submitFeedback = async () => {
    if (feedbackReviewId && feedbackRating > 0) {
      await fetch(`/api/reviews/${feedbackReviewId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildHeaders() },
        body: JSON.stringify({ difficulty_rating: feedbackRating }),
      });
    }
    setFeedbackReviewId(null);
    setFeedbackRating(0);
    fetchDetail();
  };

  const addManualReview = async () => {
    if (!id || !manualDate) return;
    setAddingManual(true);
    await fetch(`/api/problems/${id}/manual-reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...buildHeaders() },
      body: JSON.stringify({ scheduled_date: manualDate }),
    });
    setManualDate("");
    setAddingManual(false);
    fetchDetail();
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

  const todayStr = new Date().toISOString().slice(0, 10);
  const stageNames = ["S0", "S1", "S2", "S3", "S4", "S5", "S6"];

  return (
    <div className="max-w-3xl mx-auto p-3 md:p-4 space-y-4 md:space-y-6">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
        <ChevronLeft className="w-4 h-4" /> ダッシュボード
      </button>

      {/* Problem detail card */}
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

          {/* Memo */}
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

      {/* Review schedules */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-3 md:p-4 bg-gray-50 border-b flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-600" />
          <span className="text-xs md:text-sm font-semibold text-gray-600">復習計画（エビングハウス）</span>
        </div>
        <div className="p-4 md:p-6">
          {(!problem.review_schedules || problem.review_schedules.length === 0) ? (
            <p className="text-sm text-gray-400 text-center py-4">復習計画がまだ作成されていません</p>
          ) : (
            <div className="space-y-2">
              {problem.review_schedules.map((r) => {
                const isDue = !r.completed && r.scheduled_date < todayStr;
                const isToday = !r.completed && r.scheduled_date === todayStr;
                return (
                  <div key={r.id} className={`flex items-center justify-between p-3 rounded-xl border ${r.completed ? "border-green-200 bg-green-50/30" : isDue ? "border-red-200 bg-red-50/30" : "border-gray-100"}`}>
                    <div className="flex items-center gap-3">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${r.completed ? "bg-green-100 text-green-700" : isDue ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                        {stageNames[r.review_stage] || `S${r.review_stage}`}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium ${r.completed ? "line-through text-gray-400" : ""}`}>
                            {r.scheduled_date}
                          </span>
                          {isToday && <span className="text-[10px] text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded-full">📌 今日</span>}
                          {isDue && <span className="text-[10px] text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full">⚠️ 超過</span>}
                        </div>
                        {r.next_review_interval && (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            次回復習: +{r.next_review_interval}日
                            {r.completed_at && ` · ${new Date(r.completed_at).toLocaleDateString("ja-JP")} 完了`}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleReviewStatus(r.id, r.completed)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${r.completed ? "bg-gray-100 text-gray-500 hover:bg-gray-200" : "bg-green-100 text-green-700 hover:bg-green-200"}`}
                    >
                      {r.completed ? "戻す" : "完了"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Manual reviews */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-3 md:p-4 bg-gray-50 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-green-600" />
            <span className="text-xs md:text-sm font-semibold text-gray-600">手動復習</span>
          </div>
        </div>
        <div className="p-4 md:p-6 space-y-3">
          <div className="flex gap-2 items-center">
            <input
              type="date"
              value={manualDate}
              onChange={e => setManualDate(e.target.value)}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              onClick={addManualReview}
              disabled={addingManual || !manualDate}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> 追加
            </button>
          </div>

          {problem.manual_reviews && problem.manual_reviews.length > 0 ? (
            <div className="space-y-2 mt-2">
              {problem.manual_reviews.map(m => (
                <div key={m.id} className="flex items-center justify-between p-2.5 rounded-xl border border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${m.completed ? "line-through text-gray-400" : ""}`}>
                      {m.scheduled_date}
                    </span>
                    {m.note && <span className="text-[10px] text-gray-400">({m.note})</span>}
                    {m.completed && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-2">
              任意の日に復習を追加できます。試験前に便利です。
            </p>
          )}
        </div>
      </div>

      {/* Feedback dialog */}
      {feedbackReviewId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full mx-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 text-center">復習完了！難易度は？</h3>
            <div className="flex justify-center">
              <StarRating value={feedbackRating} onChange={setFeedbackRating} size="lg" />
            </div>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => { setFeedbackReviewId(null); fetchDetail(); }}
                className="px-4 py-2 text-xs text-gray-500 hover:text-gray-700"
              >
                スキップ
              </button>
              <button
                onClick={submitFeedback}
                disabled={feedbackRating === 0}
                className="bg-blue-600 text-white px-5 py-2 rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                送信
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
