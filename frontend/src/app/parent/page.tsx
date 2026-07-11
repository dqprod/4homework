"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Users, Clock, CheckCircle2, AlertTriangle, TrendingUp, Loader2 } from "lucide-react";
import { buildHeaders, getUserId, setChildViewId, clearAuth } from "@/lib/auth";
import { getProfile, getParentChildren } from "@/lib/api";

interface ChildSummary {
  child_id: string;
  child_name: string;
  total_problems: number;
  study_time_minutes: number;
  due_reviews: number;
  completed_reviews: number;
  completion_rate: number;
}

export default function ParentPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const uid = getUserId();
      if (!uid) { router.push("/login"); return; }

      try {
        const p = await getProfile();
        setProfile(p);
        if (p.role !== "parent") { router.push("/dashboard"); return; }

        const data = await getParentChildren();
        setChildren(data.children || []);
      } catch (err: any) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [router]);

  const viewChild = (childId: string) => {
    setChildViewId(childId);
    router.push("/dashboard");
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );

  const totalStudyTime = children.reduce((s, c) => s + c.study_time_minutes, 0);
  const totalDue = children.reduce((s, c) => s + c.due_reviews, 0);
  const avgCompletion = children.length > 0
    ? Math.round(children.reduce((s, c) => s + c.completion_rate, 0) / children.length * 100)
    : 0;

  return (
    <div className="max-w-5xl mx-auto p-3 md:p-4 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg md:text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-blue-600" /> 学習概況
        </h1>
        <button onClick={() => { clearAuth(); router.push("/login"); }} className="text-xs md:text-sm text-gray-400 hover:text-red-500">
          ログアウト
        </button>
      </div>

      {/* Overall stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { l: "子供", v: children.length, icon: <Users className="w-4 h-4" />, color: "text-blue-600 bg-blue-100" },
          { l: "学習時間", v: `${Math.round(totalStudyTime / 60)}h`, icon: <Clock className="w-4 h-4" />, color: "text-green-600 bg-green-100" },
          { l: "平均完了率", v: `${avgCompletion}%`, icon: <TrendingUp className="w-4 h-4" />, color: "text-purple-600 bg-purple-100" },
          { l: "期限超過", v: totalDue, icon: <AlertTriangle className="w-4 h-4" />, color: "text-red-600 bg-red-100" },
        ].map((x) => (
          <div key={x.l} className="bg-white border border-gray-200 rounded-xl p-3">
            <div className={`inline-flex p-1.5 rounded-lg ${x.color} mb-2`}>{x.icon}</div>
            <div className="text-lg md:text-2xl font-bold">{x.v}</div>
            <div className="text-[10px] md:text-xs text-gray-400">{x.l}</div>
          </div>
        ))}
      </div>

      {/* Per-child cards */}
      {children.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm bg-white rounded-2xl border border-gray-200">
          <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>子供がまだ追加されていません</p>
          <p className="text-xs mt-1">設定ページから子供を追加できます</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {children.map((c) => (
            <div key={c.child_id} onClick={() => viewChild(c.child_id)}
              className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden cursor-pointer">
              <div className="p-4 md:p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-sm md:text-base text-gray-800">{c.child_name}</h3>
                  <span className="text-[10px] text-blue-500">詳細 →</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                    <div className="text-lg font-bold text-blue-600">{c.total_problems}</div>
                    <div className="text-[10px] text-gray-400">学習数</div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                    <div className="text-lg font-bold text-green-600">{Math.round(c.study_time_minutes / 60 * 10) / 10}h</div>
                    <div className="text-[10px] text-gray-400">学習時間</div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                    <div className="text-lg font-bold text-purple-600">{Math.round(c.completion_rate * 100)}%</div>
                    <div className="text-[10px] text-gray-400">完了率</div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                    <div className={`text-lg font-bold ${c.due_reviews > 0 ? "text-red-600" : "text-gray-500"}`}>{c.due_reviews}</div>
                    <div className="text-[10px] text-gray-400">期限超過</div>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>復習進捗</span>
                    <span>{c.completed_reviews} / {c.total_problems}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(100, c.completion_rate * 100)}%` }} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-center">
        <p className="text-[10px] text-gray-400">各子供のカードをクリックすると詳細な学習記録を表示できます</p>
      </div>
    </div>
  );
}
