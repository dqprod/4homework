import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-User-Id" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!supabaseUrl || !supabaseKey) {
    // Fallback: static subjects
    const data = [
      { id: 1, name: "算数", icon: "🔢" },
      { id: 2, name: "国语", icon: "📖" },
      { id: 3, name: "理科", icon: "🔬" },
      { id: 4, name: "社会", icon: "🌏" },
      { id: 5, name: "英语", icon: "🅰️" },
    ];
    return new Response(JSON.stringify(data), { headers: { ...CORS, "Content-Type": "application/json" } });
  }

  const sb = createClient(supabaseUrl, supabaseKey);
  const { data } = await sb.from("subjects").select("*").order("id");
  return new Response(JSON.stringify(data || [
    { id: 1, name: "算数", icon: "🔢" },
    { id: 2, name: "国语", icon: "📖" },
    { id: 3, name: "理科", icon: "🔬" },
    { id: 4, name: "社会", icon: "🌏" },
    { id: 5, name: "英语", icon: "🅰️" },
  ]), { headers: { ...CORS, "Content-Type": "application/json" } });
});
