import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_KEY") || "";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, PATCH, DELETE, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-User-Id" };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = createClient(SB_URL, SB_KEY);
  const url = new URL(req.url);
  
  // Robust path parsing: extract everything after /functions/v1/problems
  const prefix = "/functions/v1/problems";
  let relativePath = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : "";
  // Remove leading/trailing slashes and query params
  relativePath = relativePath.replace(/^\/+|\/+$/g, "").split("?")[0];
  // Split into segments for routing
  const segments = relativePath.split("/").filter(Boolean);
  
  const userId = req.headers.get("X-User-Id") || "";
  if (!userId) return json({ error: "X-User-Id required" }, 401);

  try {
    // GET /problems — list
    if (req.method === "GET" && segments.length === 0) {
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const subjectId = url.searchParams.get("subject_id");
      const targetUserId = url.searchParams.get("user_id") || userId;

      let query = sb.from("problems").select("*, subjects!inner(name)", { count: "exact" }).eq("user_id", targetUserId).order("created_at", { ascending: false });
      if (subjectId) query = query.eq("subject_id", parseInt(subjectId));
      const { data, count, error } = await query.range((page - 1) * limit, page * limit - 1);
      if (error) return json({ error: error.message }, 500);

      // Fetch latest review per problem
      const problemsWithReview = await Promise.all((data || []).map(async (p: any) => {
        const { data: rev } = await sb.from("review_schedules").select("*").eq("problem_id", p.id).order("created_at", { ascending: false }).limit(1).single();
        return { ...p, subject_name: (p as any).subjects?.name, latest_review: rev || null };
      }));

      return json({ problems: problemsWithReview, total: count || 0, page, limit });
    }

    // GET /problems/:id — detail (single segment)
    if (req.method === "GET" && segments.length === 1) {
      const pid = segments[0];
      const { data: problem, error } = await sb.from("problems").select("*, subjects(name)").eq("id", pid).single();
      if (error || !problem) return json({ error: "Not found" }, 404);
      if (problem.user_id !== userId) return json({ error: "Not your problem" }, 403);

      const { data: reviews } = await sb.from("review_schedules").select("*").eq("problem_id", pid).order("scheduled_date");
      const { data: manualReviews } = await sb.from("manual_reviews").select("*").eq("problem_id", pid).order("scheduled_date");

      return json({
        ...problem,
        subject_name: (problem as any).subjects?.name,
        review_schedules: reviews || [],
        manual_reviews: manualReviews || [],
      });
    }

    // PATCH /problems/:id/memo — update memo (two segments, second is "memo")
    if (req.method === "PATCH" && segments.length === 2 && segments[1] === "memo") {
      const pid = segments[0];
      const body = await req.json();
      const { error } = await sb.from("problems").update({ memo: body.memo }).eq("id", pid).eq("user_id", userId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // DELETE /problems/:id — delete problem (single segment, DELETE method)
    if (req.method === "DELETE" && segments.length === 1) {
      const pid = segments[0];
      await sb.from("problems").delete().eq("id", pid).eq("user_id", userId);
      return new Response(null, { status: 204, headers: CORS });
    }

    // POST /problems/:id/manual-reviews
    if (req.method === "POST" && segments.length === 2 && segments[1] === "manual-reviews") {
      const pid = segments[0];
      const body = await req.json();
      const { data } = await sb.from("manual_reviews").insert({
        problem_id: pid, user_id: userId,
        scheduled_date: body.scheduled_date, note: body.note || null,
      }).select().single();
      return json(data, 201);
    }

    return json({ error: "Not found" }, 404);

  } catch (err) {
    console.error(err);
    return json({ error: "Internal error" }, 500);
  }
});
