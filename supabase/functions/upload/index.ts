import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

console.log("[upload] function loaded");

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

// Clean invalid escape sequences from AI-generated JSON before parsing
function cleanJsonString(s: string): string {
  s = s.replace(/```json|```/g, "").trim();
  // Replace invalid JSON escape sequences: \x where x is not a valid escape char
  const validEscapes = new Set(["\\", '"', "/", "b", "f", "n", "r", "t", "u"]);
  let result = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && i + 1 < s.length && !validEscapes.has(s[i + 1])) {
      result += "\\\\";
    } else {
      result += s[i];
    }
  }
  return result;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_KEY") || "";
const NVIDIA_API_KEY = Deno.env.get("NVIDIA_API_KEY") || "";
const NVIDIA_MODEL = Deno.env.get("NVIDIA_MODEL") || "meta/llama-3.2-90b-vision-instruct";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, X-User-Id, Content-Type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...CORS, "Content-Type": "application/json" } });

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const subjectId = parseInt(formData.get("subject_id") as string, 10);
    const userId = req.headers.get("X-User-Id") || "";

    if (!file || !subjectId || !userId) {
      return new Response(JSON.stringify({ error: "file, subject_id, and X-User-Id required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Upload to Storage
    const fileBytes = await file.arrayBuffer();
    const fileName = `${userId}/${crypto.randomUUID()}.jpg`;
    const { error: uploadError } = await sb.storage.from("problems")
      .upload(fileName, new Uint8Array(fileBytes), { contentType: "image/jpeg", upsert: true });
    if (uploadError) return new Response(JSON.stringify({ error: `Upload: ${uploadError.message}` }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

    const imageUrl = sb.storage.from("problems").getPublicUrl(fileName).data.publicUrl;

    // Get subject
    const { data: subject } = await sb.from("subjects").select("name").eq("id", subjectId).single();
    const subjectName = subject?.name || "unknown";

    // AI parse via NVIDIA Vision API
    let aiItems: Array<{
      problem_text: string;
      solution_method?: string;
      solution_steps?: string;
      knowledge_points?: string;
      final_answer?: string;
      estimated_study_time?: number;
    }> = [];
    let aiError: string | null = null;

    if (!NVIDIA_API_KEY) {
      return new Response(JSON.stringify({ error: "NVIDIA_API_KEY is not configured" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const controller = new AbortController();
    const aiTimeout = setTimeout(() => controller.abort(), 55000);

    try {
      const imgSize = fileBytes.byteLength;
      const maxSize = 512 * 1024;
      const fileForAI = imgSize > maxSize ? fileBytes.slice(0, maxSize) : fileBytes;
      const base64 = bytesToBase64(new Uint8Array(fileForAI));
      const mimeType = file.type || "image/jpeg";

      const resp = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${NVIDIA_API_KEY}`, "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: NVIDIA_MODEL,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: `この${subjectName}の宿題の画像を解析してください。画像内の**すべての問題**を漏れなく抽出してください。

各問題について以下を日本語で出力：
- problem_text: 問題文
- solution_method: 解き方・考え方（このタイプの問題を解くためのアプローチ）
- solution_steps: 解题步骤（番号付きで詳細に）
- knowledge_points: 知識要点（この問題で使う公式や概念）
- final_answer: 最終的な答え
- estimated_study_time: 所要時間（分）

画像内に問題が複数ある場合は**必ずすべて**含めてください。
必ずJSON配列のみを返してください。例：
[
  {
    "problem_text": "...",
    "solution_method": "...",
    "solution_steps": "...",
    "knowledge_points": "...",
    "final_answer": "...",
    "estimated_study_time": 5
  }
]` },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
            ],
          }],
          temperature: 0.1,
          max_tokens: 4096,
        }),
      });
      clearTimeout(aiTimeout);

      if (resp.ok) {
        const result = await resp.json();
        const content = result.choices?.[0]?.message?.content || "";
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error(`No JSON array in AI response: ${content.slice(0, 300)}`);
        aiItems = JSON.parse(cleanJsonString(jsonMatch[0]));
        if (!Array.isArray(aiItems) || aiItems.length === 0) throw new Error("AI returned empty items array");
      } else {
        const errText = await resp.text();
        console.error("[upload] NVIDIA error:", resp.status, errText.slice(0, 500));
        aiError = `AI API ${resp.status}: ${errText.slice(0, 200)}`;
      }
    } catch (e) {
      clearTimeout(aiTimeout);
      console.error("[upload] AI call exception:", String(e).slice(0, 500));
      aiError = String(e);
    }

    if (aiError || aiItems.length === 0) {
      const errMsg = aiError || "AI analysis returned empty result";
      console.error("[upload] AI error:", errMsg);
      await sb.from("ai_error_logs").insert({
        user_id: userId,
        image_url: imageUrl,
        error_message: errMsg,
      });
      await sb.storage.from("problems").remove([fileName]);
      return new Response(JSON.stringify({ error: errMsg }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Create problem + review schedule
    const intervals = [1, 2, 4, 7, 15, 30];
    const scheduledDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const summaryText = aiItems.map((it, i) => `【${i + 1}】${it.problem_text}`).join("\n");
    const totalTime = aiItems.reduce((s, it) => s + (it.estimated_study_time || 0), 0);

    const { data: problem, error: pErr } = await sb.from("problems").insert({
      user_id: userId,
      subject_id: subjectId,
      original_image_url: imageUrl,
      problem_text: summaryText,
      estimated_study_time: totalTime || null,
    }).select().single();

    if (pErr) return new Response(JSON.stringify({ error: pErr.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });

    // Insert problem items
    for (let i = 0; i < aiItems.length; i++) {
      const it = aiItems[i];
      await sb.from("problem_items").insert({
        problem_id: problem.id,
        user_id: userId,
        item_number: i + 1,
        problem_text: it.problem_text,
        solution_steps: it.solution_steps || null,
        solution_method: it.solution_method || null,
        knowledge_points: it.knowledge_points || null,
        final_answer: it.final_answer || null,
        estimated_study_time: it.estimated_study_time || null,
      });
    }

    const { data: review } = await sb.from("review_schedules").insert({
      problem_id: problem.id,
      user_id: userId,
      review_stage: 0,
      scheduled_date: scheduledDate,
      completed: false,
      next_review_interval: intervals[0],
    }).select().single();

    return new Response(JSON.stringify({
      problem_id: problem.id,
      subject_id: subjectId,
      subject_name: subjectName,
      original_image_url: imageUrl,
      problem_text: summaryText,
      items: aiItems,
      item_count: aiItems.length,
      review_schedule: review,
      created_at: problem.created_at,
    }), { status: 201, headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
