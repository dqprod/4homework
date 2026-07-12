"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, Search, Loader2, Trash2, X } from "lucide-react";
import { getChildViewId, clearAuth } from "@/lib/auth";
import {
  getProblems,
  getSubjects,
  uploadProblem,
  getProblem,
  deleteProblem,
} from "@/lib/api";
import { SkeletonCard, SkeletonStats } from "@/components/Skeletons";

interface Subject { id: number; name: string; icon: string; }
interface Problem {
  id: string; user_id: string; subject_id: number; subject_name: string;
  original_image_url: string; problem_text: string; solution_steps: string | null;
  final_answer: string | null; estimated_study_time: number | null;
  memo: string | null; created_at: string; latest_review: any | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const [problems, setProblems] = useState<Problem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processingSubject, setProcessingSubject] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [viewingChildName, setViewingChildName] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const childViewId = getChildViewId();
  const show = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = useCallback(async () => {
    try {
      const [subData, probData] = await Promise.all([
        getSubjects(),
        getProblems(1, 100),
      ]);
      setSubjects(Array.isArray(subData) ? subData : []);
      setProblems((probData.problems || []) as Problem[]);
      setViewingChildName(probData.user_name || null);
    } catch {
      // Network error — leave empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
  };

  const startPolling = useCallback(async (problemId: string) => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    const poll = async () => {
      try {
        const data = await getProblem(problemId);
        if (data.status === "completed") {
          if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
          setProcessingId(null);
          setUploading(false);
          clearFile();
          router.push(`/problems/${problemId}`);
        } else if (data.status === "error") {
          if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
          setProcessingId(null);
          setUploading(false);
          show("AI解析エラー");
        }
      } catch {
        // Ignore poll errors
      }
    };
    await poll();
    pollingRef.current = setInterval(poll, 10000);
  }, [router, clearFile, show]);

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const result = await uploadProblem(selectedFile, selectedSubject);
      setProcessingId(result.problem_id);
      setProcessingSubject(result.subject_name || "");
      show("AI解析を開始しました...");
      const subject = subjects.find(s => s.id === selectedSubject);
      await startPolling(result.problem_id);
    } catch (err: any) {
      show(err.message || "アップロード失敗");
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    try {
      await deleteProblem(id);
      await loadData();
    } catch (err: any) {
      show(err.message || "削除失敗");
    }
  };

  const filtered = problems.filter((p) =>
    (subjectFilter === null || p.subject_id === subjectFilter) &&
    (!searchQuery || p.problem_text.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const dueCount = problems.filter((p) =>
    p.latest_review && !p.latest_review.completed &&
    p.latest_review.scheduled_date < new Date().toISOString().slice(0, 10)
  ).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-3 md:p-4 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg md:text-2xl font-bold">
          📚 学習記録
          {viewingChildName && <span className="ml-2 text-sm font-normal text-gray-500">({viewingChildName})</span>}
        </h1>
        <button onClick={() => { clearAuth(); router.push("/login"); }} className="text-xs md:text-sm text-gray-400 hover:text-red-500">
          ログアウト
        </button>
      </div>

      {/* Upload area (only for own view) */}
      {!childViewId && (
        <div className="bg-white rounded-xl border-2 border-dashed border-blue-200 p-3 md:p-4">
          <div className="flex flex-col sm:flex-row gap-2 md:gap-3">
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="text-xs file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs md:text-sm"
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
              ))}
            </select>
            <button
              onClick={handleUpload}
              disabled={uploading || !selectedFile}
              className="bg-blue-600 text-white rounded-lg px-3 py-1.5 text-xs md:text-sm hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
            >
              {uploading ? "解析中..." : "アップロード"}
            </button>
          </div>
          {previewUrl && (
            <div className="relative mt-3 inline-block">
              <img src={previewUrl} alt="Preview" className="h-32 w-auto rounded-lg border border-gray-200 object-cover" />
              <button onClick={clearFile} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow hover:bg-red-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Upload progress overlay */}
      {processingId && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center space-y-6">
            <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto" />
            <div>
              <h2 className="text-lg font-bold">AI解析中...</h2>
              <p className="text-sm text-gray-500 mt-1">{processingSubject}</p>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
              <div className="bg-blue-600 h-full rounded-full animate-pulse" style={{ width: "60%" }} />
            </div>
            <p className="text-xs text-gray-400">画像を解析して問題を抽出しています</p>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-xl text-sm shadow-lg z-50 animate-bounce">
          {toast}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { l: "学習", v: problems.length },
          { l: "超過", v: dueCount },
          { l: "完了", v: problems.filter((p) => p.latest_review?.completed).length },
          { l: "新規", v: problems.filter((p) => !p.latest_review).length },
        ].map((x) => (
          <div key={x.l} className="bg-white border border-gray-200 rounded-xl p-2 md:p-3 text-center">
            <div className="text-lg md:text-2xl font-bold">{x.v}</div>
            <div className="text-[10px] md:text-xs text-gray-400">{x.l}</div>
          </div>
        ))}
      </div>

      {/* Subject filter */}
      <div className="flex gap-1.5 overflow-x-auto flex-wrap">
        <button
          onClick={() => setSubjectFilter(null)}
          className={`px-2 md:px-3 py-1 rounded-full text-[10px] md:text-xs ${subjectFilter === null ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600"}`}
        >
          すべて
        </button>
        {subjects.map((s) => (
          <button
            key={s.id}
            onClick={() => setSubjectFilter(s.id === subjectFilter ? null : s.id)}
            className={`px-2 md:px-3 py-1 rounded-full text-[10px] md:text-xs ${subjectFilter === s.id ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600"}`}
          >
            {s.icon} {s.name}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          placeholder="問題を検索..."
        />
      </div>

      {/* Problem list */}
      <div className="grid grid-cols-1 gap-3">
        {filtered.map((p) => (
          <div
            key={p.id}
            className="bg-white p-3 md:p-4 rounded-xl border border-gray-200 hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0" onClick={() => router.push(`/problems/${p.id}`)}>
                <div className="text-[10px] md:text-xs text-gray-400 mb-1">
                  {p.subject_name} · {p.created_at?.slice(0, 10)} · ⏱{p.estimated_study_time || "?"}分
                </div>
                <p className="text-xs md:text-sm text-gray-800 line-clamp-2">{p.problem_text}</p>
                {p.memo && <p className="text-[10px] md:text-xs text-yellow-600 mt-1 truncate">📝 {p.memo}</p>}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                  className="text-gray-300 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                {p.latest_review && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    p.latest_review.completed ? "bg-green-100 text-green-700"
                    : p.latest_review.scheduled_date < new Date().toISOString().slice(0, 10) ? "bg-red-100 text-red-700"
                    : "bg-blue-100 text-blue-700"
                  }`}>
                    {p.latest_review.completed ? "✅"
                    : p.latest_review.scheduled_date < new Date().toISOString().slice(0, 10) ? "⚠️"
                    : `S${p.latest_review.review_stage}`}
                  </span>
                )}
                <span className="text-[10px] text-blue-500">→</span>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm">
            {!childViewId ? "学習記録がありません。画像をアップロードして始めましょう！" : "この子供の記録はありません"}
          </div>
        )}
      </div>
    </div>
  );
}
