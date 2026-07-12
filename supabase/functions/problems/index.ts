import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_KEY") || "";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, PATCH, DELETE, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-User-Id" };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function getProblemOwner(sb: any, pid: string): Promise<string | null> {
  const { data } = await sb.from("problems").select("user_id").eq("id", pid).single();
  return data?.user_id || null;
}

async function isOwnerOrParent(sb: any, userId: string, problemUserId: string): Promise<boolean> {
  if (problemUserId === userId) return true;
  const { data: link } = await sb.from("parent_child")
    .select("*")
    .eq("parent_id", userId)
    .eq("child_id", problemUserId)
    .maybeSingle();
  return !!link;
}

serve(async (req: Request) => {
  // DEBUG_MARKER_12345 - Deployed at 2026-07-11 22:56:11
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = createClient(SB_URL, SB_KEY);
  const url = new URL(req.url);
  
  // Supabase gateway strips /functions/v1/ prefix, path starts with /problems
  const prefix = "/problems";
  let relativePath = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : "";
  relativePath = relativePath.replace(/^\/+|\/+$/g, "").split("?")[0];
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

      const problemsWithReview = await Promise.all((data || []).map(async (p: any) => {
        const { data: rev } = await sb.from("review_schedules").select("*").eq("problem_id", p.id).order("created_at", { ascending: false }).limit(1).single();
        return { ...p, subject_name: (p as any).subjects?.name, latest_review: rev || null };
      }));

      // Include target user's display name for parent view
      let userName: string | null = null;
      if (targetUserId !== userId) {
        const { data: profile } = await sb.from("profiles").select("full_name, username").eq("id", targetUserId).single();
        userName = profile?.full_name || profile?.username || null;
      }
      return json({ problems: problemsWithReview, total: count || 0, page, limit, user_name: userName });
    }

    // GET /problems/:id — detail
    if (req.method === "GET" && segments.length === 1) {
      const pid = segments[0];
      const { data: problem, error } = await sb.from("problems").select("*, subjects(name)").eq("id", pid).single();
      if (error || !problem) return json({ error: "Not found" }, 404);

      if (!(await isOwnerOrParent(sb, userId, problem.user_id))) {
        return json({ error: "Not your problem" }, 403);
      }

      const { data: reviews } = await sb.from("review_schedules").select("*").eq("problem_id", pid).order("scheduled_date");
      const { data: manualReviews } = await sb.from("manual_reviews").select("*").eq("problem_id", pid).order("scheduled_date");
      const { data: problemItems } = await sb.from("problem_items").select("*").eq("problem_id", pid).order("item_number");

      return json({
        ...problem,
        subject_name: (problem as any).subjects?.name,
        review_schedules: reviews || [],
        manual_reviews: manualReviews || [],
        problem_items: problemItems || [],
      });
    }

    // PATCH /problems/:id/memo
    if (req.method === "PATCH" && segments.length === 2 && segments[1] === "memo") {
      const pid = segments[0];
      const ownerId = await getProblemOwner(sb, pid);
      if (!ownerId) return json({ error: "Not found" }, 404);
      if (!(await isOwnerOrParent(sb, userId, ownerId))) return json({ error: "Not your problem" }, 403);

      const body = await req.json();
      const { error } = await sb.from("problems").update({ memo: body.memo }).eq("id", pid);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // DELETE /problems/:id
    if (req.method === "DELETE" && segments.length === 1) {
      const pid = segments[0];
      const ownerId = await getProblemOwner(sb, pid);
      if (!ownerId) return json({ error: "Not found" }, 404);
      if (!(await isOwnerOrParent(sb, userId, ownerId))) return json({ error: "Not your problem" }, 403);

      await sb.from("problem_items").delete().eq("problem_id", pid);
      await sb.from("manual_reviews").delete().eq("problem_id", pid);
      await sb.from("review_schedules").delete().eq("problem_id", pid);
      const { error } = await sb.from("problems").delete().eq("id", pid);
      if (error) return json({ error: error.message }, 500);
      return new Response(null, { status: 204, headers: CORS });
    }

    // POST /problems/:id/manual-reviews
    if (req.method === "POST" && segments.length === 2 && segments[1] === "manual-reviews") {
      const pid = segments[0];
      const ownerId = await getProblemOwner(sb, pid);
      if (!ownerId) return json({ error: "Not found" }, 404);
      if (!(await isOwnerOrParent(sb, userId, ownerId))) return json({ error: "Not your problem" }, 403);

      const body = await req.json();
      const { data } = await sb.from("manual_reviews").insert({
        problem_id: pid, user_id: ownerId,
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
