"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { BookOpen, Calendar, Settings, LayoutDashboard, Users, LogOut } from "lucide-react";

interface ChildSummary {
  child_id: string;
  child_name: string;
  total_problems: number;
  completion_rate: number;
  due_reviews: number;
}

export default function AppNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string>("student");
  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [childViewId, setChildViewId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setUser(data.user);
      fetch(`/api/profiles/me`, { headers: { "X-User-Id": data.user.id } })
        .then(r => r.json())
        .then(p => { setRole(p.role || "student"); })
        .catch(() => {});
      if (data.user.id) {
        fetch(`/api/parent/children`, { headers: { "X-User-Id": data.user.id } })
          .then(r => r.json())
          .then(d => setChildren(d.children || []))
          .catch(() => {});
      }
    });
  }, []);

  const switchChild = (childId: string) => {
    setChildViewId(childId);
    // Store child context in sessionStorage for child pages
    sessionStorage.setItem("childViewId", childId);
    router.push("/dashboard");
  };
  
  const exitChildView = () => {
    setChildViewId(null);
    sessionStorage.removeItem("childViewId");
    router.push("/dashboard");
  };

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-3 md:px-4 h-12 md:h-14 flex items-center justify-between">
        <div className="flex items-center gap-1.5 md:gap-2 cursor-pointer shrink-0" onClick={() => router.push("/dashboard")}>
          <BookOpen className="w-5 h-5 text-blue-600" />
          <span className="font-bold text-sm md:text-lg hidden sm:inline">4homework</span>
        </div>

        {/* Child selector for parents */}
        {role === "parent" && children.length > 0 && (
          <div className="flex items-center gap-1 mx-2">
            {childViewId && (
              <button onClick={exitChildView} className="text-[10px] md:text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full flex items-center gap-1">
                <Users className="w-3 h-3" />
                <span className="hidden sm:inline">子供表示中</span> ✕
              </button>
            )}
            <select
              className="text-[10px] md:text-xs border border-gray-200 rounded-lg px-1.5 py-1"
              onChange={e => { if (e.target.value) switchChild(e.target.value); }}
              value=""
            >
              <option value="">👶 子供選択</option>
              {children.map(c => (
                <option key={c.child_id} value={c.child_id}>
                  {c.child_name} ({c.completion_rate > 0 ? Math.round(c.completion_rate * 100) + "%" : "0%"})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-0.5 md:gap-1">
          <button
            onClick={() => router.push("/dashboard")}
            className={`flex items-center gap-1 px-2 md:px-3 py-1 rounded-lg text-xs md:text-sm transition-colors ${pathname.startsWith("/dashboard") ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"}`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">学習</span>
          </button>
          <button
            onClick={() => router.push("/reviews")}
            className={`flex items-center gap-1 px-2 md:px-3 py-1 rounded-lg text-xs md:text-sm transition-colors ${pathname.startsWith("/reviews") ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"}`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">復習</span>
          </button>
          <button
            onClick={() => router.push("/settings")}
            className={`flex items-center gap-1 px-2 md:px-3 py-1 rounded-lg text-xs md:text-sm transition-colors ${pathname.startsWith("/settings") ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"}`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">設定</span>
          </button>
          <button
            onClick={() => { supabase.auth.signOut(); router.push("/login"); }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {childViewId && (
        <div className="bg-yellow-50 border-b border-yellow-200 text-center py-1 text-[10px] md:text-xs text-yellow-700">
          {children.find(c => c.child_id === childViewId)?.child_name} さんのデータを表示中
        </div>
      )}
    </nav>
  );
}