import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-User-Id, apikey, X-Client-Info",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const sb = createClient(SB_URL, SB_KEY);
  const url = new URL(req.url);
  const path = url.pathname.split("/functions/v1/profiles")[1]?.replace(/^\//, "") || "";
  const userId = req.headers.get("X-User-Id") || "";
  if (!userId) return json({ error: "Unauthorized" }, 401);

  try {
    // GET /profiles/me — also handle root path
    if (req.method === "GET" && (path === "me" || path === "")) {
      const { data: profile, error } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!profile) return json({ error: "Profile not found" }, 404);
      return json(profile);
    }

    // PATCH /profiles
    if (req.method === "PATCH" && path === "") {
      const body = await req.json();
      const updates: Record<string, unknown> = {};
      if (body.full_name !== undefined) updates.full_name = body.full_name;
      if (body.username !== undefined) updates.username = body.username;
      if (body.avatar_url !== undefined) updates.avatar_url = body.avatar_url;

      const { data, error } = await sb.from("profiles").update(updates).eq("id", userId).select().single();
      if (error) return json({ error: error.message }, 500);
      return json(data);
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    console.error(err);
    return json({ error: "Internal error" }, 500);
  }
});
