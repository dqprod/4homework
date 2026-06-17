import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-User-Id" };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_KEY") || "";

  // If env vars not available, return debug info
  if (!supabaseUrl || !supabaseKey) {
    return json({
      error: "Missing env vars",
      has_url: !!supabaseUrl,
      has_key: !!supabaseKey,
      keys_available: Object.keys(Deno.env.toObject()),
    }, 500);
  }

  const sb = createClient(supabaseUrl, supabaseKey);
  const userId = req.headers.get("X-User-Id") || "";
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const fullPath = new URL(req.url).pathname;

  try {
    // Check role
    const { data: profile, error: profErr } = await sb.from("profiles").select("role").eq("id", userId).single();
    if (profErr || !profile) return json({ error: "Profile error: " + (profErr?.message || "not found"), userId }, 404);
    if (profile.role !== "parent") return json({ error: "Only parents", role: profile.role }, 403);

    // GET children
    if (req.method === "GET" && fullPath.endsWith("/parent/children")) {
      const { data: links } = await sb.from("parent_child").select("child_id").eq("parent_id", userId);
      const childIds = (links || []).map((l: any) => l.child_id);

      const children = await Promise.all(childIds.map(async (cid: string) => {
        const { data: prof } = await sb.from("profiles").select("id, full_name").eq("id", cid).single();
        const { count: totalProblems } = await sb.from("problems").select("*", { count: "exact", head: true }).eq("user_id", cid);
        const { count: totalReviews } = await sb.from("review_schedules").select("*", { count: "exact", head: true }).eq("user_id", cid);
        const { count: completedReviews } = await sb.from("review_schedules").select("*", { count: "exact", head: true }).eq("user_id", cid).eq("completed", true);
        const { count: dueReviews } = await sb.from("review_schedules").select("*", { count: "exact", head: true }).eq("user_id", cid).eq("completed", false).lt("scheduled_date", new Date().toISOString().slice(0, 10));
        const { data: studyData } = await sb.from("problems").select("estimated_study_time").eq("user_id", cid);
        const studyTime = (studyData || []).reduce((sum: number, p: any) => sum + (p.estimated_study_time || 0), 0);

        return {
          child_id: cid,
          child_name: prof?.full_name || cid.slice(0, 8),
          total_problems: totalProblems || 0,
          study_time_minutes: studyTime,
          due_reviews: dueReviews || 0,
          completed_reviews: completedReviews || 0,
          completion_rate: totalReviews ? Math.round((completedReviews || 0) / totalReviews * 100) / 100 : 0,
        };
      }));

      return json({ children });
    }

    return json({ error: "Not found", path: fullPath }, 404);

  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});
