"use client";

import { getUserId, getChildViewId, buildHeaders } from "@/lib/auth";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Calendar, CheckCircle2, XCircle, ChevronLeft, ChevronRight } from "lucide-react";

interface Review {
  id: string; problem_id: string; user_id: string;
  review_stage: number; scheduled_date: string; completed: boolean;
  completed_at: string | null; next_review_interval: number | null;
  created_at: string; updated_at: string | null;
}

interface Problem { id: string; problem_text: string; subject_name: string; }

const MONTHS = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
const DAYS = ["日","月","火","水","木","金","土"];

export default function ReviewsPage() {
  const router = useRouter();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [problems, setProblems] = useState<Record<string, Problem>>({});
  const [filter, setFilter] = useState("all");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());

  const childId = getChildViewId();

  const fetchReviews = async () => {
    const uid = getUserId();
    if (!uid) return;
    const params = new URLSearchParams({ limit: "200" });
    if (childId) params.set("user_id", childId);
    const res = await fetch(`/api/reviews?${params}`, { headers: buildHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    setReviews(data.reviews);
    const probs: Record<string, Problem> = {};
    const pParams = new URLSearchParams({ limit: "200" });
    if (childId) pParams.set("user_id", childId);
    const pRes = await fetch(`/api/problems?${pParams}`, { headers: buildHeaders() });
    if (pRes.ok) {
      const pData = await pRes.json();
      pData.problems.forEach((p: Problem) => { probs[p.id] = p; });
    }
    setProblems(probs);
  };

  useEffect(() => { fetchReviews().then(() => setLoading(false)); }, [childId]);

  const toggleReview = async (id: string, completed: boolean) => {
    const uid = getUserId();
    if (!uid) return;
    await fetch(`/api/reviews/${id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...buildHeaders() },
      body: JSON.stringify({ completed: !completed }),
    });
    await fetchReviews();
  };

  const handleDateClick = (dateStr: string) => {
    if (selectedDate === dateStr) {
      setSelectedDate(null);
      setFilter("all");
    } else {
      setSelectedDate(dateStr);
      setFilter("day");
    }
  };

  const filtered = reviews.filter(r => {
    if (filter === "day" && selectedDate) return r.scheduled_date === selectedDate;
    if (filter === "today") return r.scheduled_date === new Date().toISOString().slice(0,10);
    if (filter === "due") return !r.completed && r.scheduled_date < new Date().toISOString().slice(0,10);
    if (filter === "completed") return r.completed;
    return true;
  });

  const todayStr = new Date().toISOString().slice(0,10);
  const reviewMap = new Map<string, number>();
  reviews.forEach(r => { if (!r.completed) reviewMap.set(r.scheduled_date, (reviewMap.get(r.scheduled_date) || 0) + 1); });
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;

  const calCells: React.ReactNode[] = [];
  for (let i = 0; i < 7; i++) calCells.push(<div key={`h${i}`} className="text-center text-[10px] md:text-xs text-gray-400 py-1">{DAYS[i]}</div>);
  for (let i = 0; i < firstDay; i++) calCells.push(<div key={`e${i}`} />);
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const cnt = reviewMap.get(ds) || 0;
    const isToday = ds === todayStr;
    const isSelected = ds === selectedDate;
    calCells.push(
      <div
        key={d}
        onClick={() => handleDateClick(ds)}
        className={`relative p-1 rounded-lg text-xs md:text-sm text-center cursor-pointer transition-colors hover:bg-blue-50
          ${isSelected ? "bg-blue-600 text-white ring-2 ring-blue-300" : isToday && !isSelected ? "bg-blue-50 border border-blue-200" : ""}`}
      >
        <span className={isSelected ? "font-bold text-white" : isToday ? "font-bold text-blue-600" : ""}>{d}</span>
        {cnt > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 text-[8px] rounded-full w-3.5 h-3.5 flex items-center justify-center
            ${isSelected ? "bg-white text-blue-600" : "bg-red-500 text-white"}`}>{cnt}</span>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-3 md:p-4 space-y-4 md:space-y-6">
      <h1 className="text-lg md:text-2xl font-bold flex items-center gap-2"><Calendar className="w-6 h-6 text-blue-600" /> 復習計画</h1>

      {/* Calendar */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 md:p-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => calMonth === 0 ? (setCalYear(y => y-1), setCalMonth(11)) : setCalMonth(m => m-1)} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft className="w-4 h-4" /></button>
          <span className="font-medium text-sm md:text-base">{calYear}年 {MONTHS[calMonth]}</span>
          <button onClick={() => calMonth === 11 ? (setCalYear(y => y+1), setCalMonth(0)) : setCalMonth(m => m+1)} className="p-1 hover:bg-gray-100 rounded"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 md:gap-1">{calCells}</div>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 md:gap-2 overflow-x-auto flex-wrap">
        {[
          { k: "all", l: "📋 すべて" },
          { k: "today", l: "📌 今日" },
          { k: "due", l: "⚠️ 超過" },
          { k: "completed", l: "✅ 完了" },
        ].map(({ k, l }) => (
          <button key={k} onClick={() => { setFilter(k); setSelectedDate(null); }}
            className={`px-2 md:px-3 py-1 rounded-full text-[10px] md:text-xs whitespace-nowrap transition-colors ${filter === k ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600"}`}>{l}</button>
        ))}
        {selectedDate && (
          <button onClick={() => { setSelectedDate(null); setFilter("all"); }}
            className="px-2 md:px-3 py-1 rounded-full text-[10px] md:text-xs bg-gray-200 text-gray-600 hover:bg-gray-300">
            ✕ {selectedDate}
          </button>
        )}
      </div>

      {/* Review list */}
      <div className="space-y-2">
        {filtered.sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)).slice(0, 100).map(r => {
          const p = problems[r.problem_id];
          const isDue = !r.completed && r.scheduled_date < todayStr;
          const isToday = !r.completed && r.scheduled_date === todayStr;
          return (
            <div key={r.id} className={`bg-white rounded-xl border p-3 flex items-center justify-between gap-2 ${r.completed ? "border-green-200 opacity-60" : isDue ? "border-red-200" : "border-gray-200"}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${r.completed ? "bg-green-100 text-green-700" : isDue ? "bg-red-100 text-red-700" : isToday ? "bg-yellow-100 text-yellow-700" : "bg-blue-100 text-blue-700"}`}>
                    {r.completed ? "✅" : isDue ? "⚠️" : isToday ? "📌" : `S${r.review_stage}`}
                  </span>
                  <span className="text-[10px] text-gray-400">{r.scheduled_date}</span>
                  {r.next_review_interval && <span className="text-[10px] text-gray-400">+{r.next_review_interval}d</span>}
                </div>
                <p className="text-xs text-gray-700 line-clamp-1">{p?.problem_text || p?.subject_name || r.problem_id.slice(0, 8)}</p>
              </div>
              <button onClick={() => toggleReview(r.id, r.completed)}
                className={`px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-medium transition-colors ${r.completed ? "bg-gray-100 text-gray-500 hover:bg-gray-200" : "bg-green-100 text-green-700 hover:bg-green-200"}`}>
                {r.completed ? <><XCircle className="w-3.5 h-3.5 inline mr-1" />戻</> : <><CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />済</>}
              </button>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="text-center py-16 text-gray-400 text-sm">復習タスクはありません 🎉</div>}
      </div>
    </div>
  );
}
