import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_KEY") || "";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-User-Id" };

const INTERVALS = [1, 2, 4, 7, 15, 30];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function advanceStage(currentStage: number): { stage: number; interval: number; nextDate: string } {
  const nextStage = currentStage + 1;
  const interval = INTERVALS[Math.min(nextStage, INTERVALS.length - 1)];
  const nextDate = new Date(Date.now() + interval * 86400000).toISOString().slice(0, 10);
  return { stage: nextStage, interval, nextDate };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = createClient(SB_URL, SB_KEY);
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/reviews\/?/, "");
  const userId = req.headers.get("X-User-Id") || "";
  if (!userId) return json({ error: "Unauthorized" }, 401);

  try {
    // GET /reviews — list
    if (req.method === "GET" && !path) {
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const targetUserId = url.searchParams.get("user_id") || userId;
      const scheduledDate = url.searchParams.get("scheduled_date");
      const rangeStart = url.searchParams.get("range_start");
      const rangeEnd = url.searchParams.get("range_end");
      const completed = url.searchParams.get("completed");

      let query = sb.from("review_schedules").select("*", { count: "exact" }).eq("user_id", targetUserId).order("scheduled_date");
      if (scheduledDate) query = query.eq("scheduled_date", scheduledDate);
      if (rangeStart) query = query.gte("scheduled_date", rangeStart);
      if (rangeEnd) query = query.lte("scheduled_date", rangeEnd);
      if (completed !== null) query = query.eq("completed", completed === "true");

      const { data, count, error } = await query.range((page - 1) * limit, page * limit - 1);
      if (error) return json({ error: error.message }, 500);
      return json({ reviews: data || [], total: count || 0, page, limit });
    }

    // PUT /reviews/:id/status
    const statusMatch = path.match(/^([^/]+)\/status$/);
    if (req.method === "PUT" && statusMatch) {
      const rid = statusMatch[1];
      const body = await req.json();

      const { data: review, error: fetchError } = await sb.from("review_schedules").select("*").eq("id", rid).single();
      if (fetchError || !review) return json({ error: "Not found" }, 404);
      // Allow owner or parent
      if (review.user_id !== userId) {
        const { data: parentLink } = await sb.from("parent_child")
          .select("*")
          .eq("parent_id", userId)
          .eq("child_id", review.user_id)
          .maybeSingle();
        if (!parentLink) return json({ error: "Not your review" }, 403);
      }

      if (body.completed) {
        const adv = advanceStage(review.review_stage);
        const { data: updated } = await sb.from("review_schedules").update({
          completed: true,
          completed_at: new Date().toISOString(),
          review_stage: adv.stage,
          scheduled_date: adv.nextDate,
          next_review_interval: adv.interval,
          updated_at: new Date().toISOString(),
        }).eq("id", rid).select().single();

        // Write review record
        await sb.from("review_records").insert({
          review_schedule_id: rid,
          problem_id: review.problem_id,
          user_id: userId,
          reviewed_at: new Date().toISOString(),
        });

        return json(updated || review);
      } else {
        const { data: updated } = await sb.from("review_schedules").update({
          completed: false,
          completed_at: null,
          updated_at: new Date().toISOString(),
        }).eq("id", rid).select().single();
        return json(updated || review);
      }
    }

    // POST /reviews/:id/feedback
    const feedbackMatch = path.match(/^([^/]+)\/feedback$/);
    if (req.method === "POST" && feedbackMatch) {
      const rid = feedbackMatch[1];
      const body = await req.json();

      // Find most recent review record
      const { data: records } = await sb.from("review_records").select("*").eq("review_schedule_id", rid).order("reviewed_at", { ascending: false }).limit(1);
      let record = records?.[0];
      if (!record) {
        const { data: review } = await sb.from("review_schedules").select("*").eq("id", rid).single();
        if (!review) return json({ error: "Not found" }, 404);
        const { data: newRec } = await sb.from("review_records").insert({
          review_schedule_id: rid, problem_id: review.problem_id, user_id: userId,
        }).select().single();
        record = newRec;
      }

      const updates: Record<string, unknown> = {};
      if (body.difficulty_rating !== undefined) updates.difficulty_rating = body.difficulty_rating;
      if (body.notes !== undefined) updates.notes = body.notes;

      await sb.from("review_records").update(updates).eq("id", record.id);
      return json({ ok: true, record_id: record.id });
    }

    // POST /notifications/run-digest
    if (req.method === "POST" && path === "run-digest") {
      // Get user's children
      const { data: links } = await sb.from("parent_child").select("child_id").eq("parent_id", userId);
      const targetIds = [...new Set([...(links || []).map((l: any) => l.child_id), userId])];

      const dueReviews = await sb.from("review_schedules")
        .select("*, problems!inner(problem_text,subject_id), subjects!inner(name)")
        .in("user_id", targetIds)
        .eq("completed", false)
        .lte("scheduled_date", new Date().toISOString().slice(0, 10));

      // Notification service logs the digest (email sending via SMTP not in EF scope)
      console.log(`[digest] targets=${targetIds.length} due=${(dueReviews.data || []).length}`);

      return json({ queued: true, targets: targetIds, due_count: (dueReviews.data || []).length });
    }

    return json({ error: "Not found" }, 404);

  } catch (err) {
    console.error(err);
    return json({ error: "Internal error" }, 500);
  }
});
