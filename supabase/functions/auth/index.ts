import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-User-Id",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/.*\/auth/, "");

  try {
    // Debug: log the path
    console.log("Path:", path, "URL:", url.pathname);

    if (req.method === "POST" && (path === "/login" || path === "" || path.endsWith("/login"))) {
      const { email, password } = await req.json();
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });

      const uid = data.user!.id;
      const meta = data.user!.user_metadata || {};
      const userEmail = data.user!.email || "";

      const { data: existing } = await sb.from("profiles").select("id").eq("id", uid).single();
      if (!existing) {
        await sb.from("profiles").insert({
          id: uid,
          full_name: meta.full_name || userEmail.split("@")[0],
          role: meta.role || "student",
        });
      }

      return new Response(JSON.stringify({
        access_token: data.session!.access_token,
        token_type: "bearer",
        user_id: uid,
        user: { id: uid, email: userEmail, full_name: meta.full_name || userEmail.split("@")[0], role: meta.role || "student" },
      }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    if (req.method === "POST" && path === "/register") {
      const { email, password, full_name, role } = await req.json();
      const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name, role } });
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

      await sb.from("profiles").insert({ id: data.user!.id, full_name, role: role || "student" });
      return new Response(JSON.stringify({ user_id: data.user!.id, email }), { status: 201, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    if (req.method === "GET" && path === "/me") {
      const authHeader = req.headers.get("Authorization") || "";
      const anonSb = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || SERVICE_KEY);
      const { data: userData, error } = await anonSb.auth.getUser(authHeader.replace("Bearer ", ""));
      if (error || !userData.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });

      const { data: profile } = await sb.from("profiles").select("*").eq("id", userData.user.id).single();
      return new Response(JSON.stringify(profile || userData.user), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
