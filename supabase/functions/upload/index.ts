import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_KEY") || "";
const NVIDIA_API_KEY = Deno.env.get("NVIDIA_API_KEY") || "";
const NVIDIA_MODEL = Deno.env.get("NVIDIA_MODEL") || "meta/llama-3.2-90b-vision-instruct";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-User-Id",
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

    // AI parse — with mock fallback when NVIDIA_API_KEY is not configured
    let problemText = "(AI解析に失敗しました)";
    let solutionSteps: string | null = null;
    let finalAnswer: string | null = null;
    let studyTime: number | null = null;
    let aiError: string | null = null;

    if (!NVIDIA_API_KEY) {
      const mockData: Record<number, { text: string; steps: string; answer: string; time: number }> = {
        1: { text: "次の計算をしなさい。\n① 3 + 5 = ?\n② 12 - 7 = ?\n③ 4 × 6 = ?", steps: "① 3 + 5 = 8\n② 12 - 7 = 5\n③ 4 × 6 = 24", answer: "① 8, ② 5, ③ 24", time: 5 },
        2: { text: "次の漢字の読みがなを書きなさい。\n① 学校\n② 先生\n③ 友達", steps: "① がっこう\n② せんせい\n③ ともだち", answer: "① がっこう ② せんせい ③ ともだち", time: 3 },
        3: { text: "身の回りにあるものについて答えなさい。\n① 水が氷になるときの温度は？\n② 空気中に一番多く含まれる気体は？", steps: "① 水は0℃で氷になります。\n② 空気の約78%は窒素です。", answer: "① 0℃ ② 窒素", time: 5 },
        4: { text: "次の都道府県の県庁所在地を答えなさい。\n① 北海道\n② 大阪府\n③ 福岡県", steps: "① 札幌市\n② 大阪市\n③ 福岡市", answer: "① 札幌市 ② 大阪市 ③ 福岡市", time: 4 },
        5: { text: "次の英単語を日本語に訳しなさい。\n① apple\n② book\n③ cat", steps: "① apple = りんご\n② book = 本\n③ cat = 猫", answer: "① りんご ② 本 ③ 猫", time: 3 },
      };
      const m = mockData[subjectId] || mockData[1];
      problemText = m.text;
      solutionSteps = m.steps;
      finalAnswer = m.answer;
      studyTime = m.time;
    } else {
      try {
        const bytes = new Uint8Array(fileBytes);
        let binary = "";
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.slice(i, i + chunkSize);
          binary += String.fromCharCode(...chunk);
        }
        const base64 = btoa(binary);
        binary = "";
        const resp = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${NVIDIA_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: NVIDIA_MODEL,
            messages: [{
              role: "user",
              content: [
                { type: "text", text: `Analyze this ${subjectName} homework problem image in detail. Provide a comprehensive solution including the problem statement, clear step-by-step solution (numbered if applicable), the final numerical or textual answer, and an estimated study time in minutes. Return ONLY JSON: {"problem_text":"...","solution_steps":"...","final_answer":"...","estimated_study_time":N}. All output should be in Japanese.` },
                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}`, detail: "high" } },
              ],
            }],
            temperature: 0.1,
            max_tokens: 2048,
          }),
        });
        if (resp.ok) {
          const result = await resp.json();
          const content = result.choices?.[0]?.message?.content || "";
          const parsed = JSON.parse(content.replace(/```json|```/g, "").trim());
          problemText = parsed.problem_text || problemText;
          solutionSteps = parsed.solution_steps || null;
          finalAnswer = parsed.final_answer || null;
          studyTime = parsed.estimated_study_time || null;
        } else {
          aiError = `AI API ${resp.status}: ${await resp.text()}`;
        }
      } catch (e) {
        aiError = String(e);
      }
    }

    // Create problem + review schedule
    const intervals = [1, 2, 4, 7, 15, 30];
    const scheduledDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const { data: problem, error: pErr } = await sb.from("problems").insert({
      user_id: userId,
      subject_id: subjectId,
      original_image_url: imageUrl,
      problem_text: problemText,
      solution_steps: solutionSteps,
      final_answer: finalAnswer,
      estimated_study_time: studyTime,
    }).select().single();

    if (pErr) return new Response(JSON.stringify({ error: pErr.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });

    const { data: review } = await sb.from("review_schedules").insert({
      problem_id: problem.id,
      user_id: userId,
      review_stage: 0,
      scheduled_date: scheduledDate,
      completed: false,
      next_review_interval: intervals[0],
    }).select().single();

    if (aiError) {
      await sb.from("ai_error_logs").insert({
        user_id: userId,
        image_url: imageUrl,
        error_message: aiError,
      });
    }

    return new Response(JSON.stringify({
      problem_id: problem.id,
      subject_id: subjectId,
      subject_name: subjectName,
      original_image_url: imageUrl,
      problem_text: problemText,
      solution_steps: solutionSteps,
      final_answer: finalAnswer,
      estimated_study_time: studyTime,
      review_schedule: review,
      created_at: problem.created_at,
    }), { status: 201, headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
