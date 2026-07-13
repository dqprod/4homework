import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

console.log("[upload] function loaded");

function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    const end = Math.min(i + 8192, bytes.length);
    let s = "";
    for (let j = i; j < end; j++) s += String.fromCharCode(bytes[j]);
    parts.push(s);
  }
  return btoa(parts.join(""));
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_KEY") || "";
const NVIDIA_API_KEY = Deno.env.get("NVIDIA_API_KEY") || "";
const NVIDIA_MODEL = Deno.env.get("NVIDIA_MODEL") || "meta/llama-3.2-90b-vision-instruct";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, X-User-Id, Content-Type",
};

const REST = { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
const URL = (path: string) => `${SUPABASE_URL}${path}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const subjectId = parseInt(formData.get("subject_id") as string, 10);
    const userId = req.headers.get("X-User-Id") || "";

    if (!file || !subjectId || !userId) {
      return new Response(JSON.stringify({ error: "file, subject_id, and X-User-Id required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const fileBytes = await file.arrayBuffer();

    // Upload image to storage (need BOTH apikey AND Authorization for storage API)
    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `${userId}/${crypto.randomUUID()}.${ext}`;
    console.log(`[upload] STORAGE_KEY_LEN=${(SERVICE_KEY||"").length} URL=${!!SUPABASE_URL}`);
    const uploadResp = await fetch(`${SUPABASE_URL}/storage/v1/object/problems/${fileName}`, {
      method: "POST",
      headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": file.type || "image/jpeg" },
      body: new Uint8Array(fileBytes),
    });
    if (!uploadResp.ok) {
      const errText = await uploadResp.text();
      console.error(`[upload] Storage error: ${uploadResp.status} ${errText.slice(0,500)}`);
      return new Response(JSON.stringify({ error: `Storage failed: ${uploadResp.status}` }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    const imageUrl = `${SUPABASE_URL}/storage/v1/object/public/problems/${fileName}`;

    // Get subject name
    const subResp = await fetch(URL(`/rest/v1/subjects?select=name&id=eq.${subjectId}`), { headers: REST });
    const subjects = await subResp.json();
    const subjectName = subjects?.[0]?.name || "unknown";

    // Create problem with status=processing (need Prefer header for return body)
    const probResp = await fetch(URL("/rest/v1/problems"), {
      method: "POST",
      headers: { ...REST, "Prefer": "return=representation" },
      body: JSON.stringify({
        user_id: userId,
        subject_id: subjectId,
        original_image_url: imageUrl,
        problem_text: "",
        status: "processing",
      }),
    });
    if (!probResp.ok) {
      const errBody = await probResp.text();
      return new Response(JSON.stringify({ error: `Problem insert: ${errBody.slice(0, 200)}` }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    const probData = await probResp.json();
    const problem = Array.isArray(probData) && probData.length > 0 ? probData[0] : null;
    if (!problem) {
      return new Response(JSON.stringify({ error: "Problem created but no data returned" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Return immediately with problem_id
    const sendResponse = () => new Response(JSON.stringify({
      problem_id: problem.id,
      status: "processing",
      subject_id: subjectId,
      subject_name: subjectName,
    }), { status: 201, headers: { ...CORS, "Content-Type": "application/json" } });

    // Background AI processing (fire-and-forget)
    (async () => {
      try {
        if (NVIDIA_API_KEY) {
          const base64 = bytesToBase64(new Uint8Array(fileBytes));
          const mimeType = file.type || "image/jpeg";

          const aiResp = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${NVIDIA_API_KEY}`, "Content-Type": "application/json" },
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
[{"problem_text":"...","solution_method":"...","solution_steps":"...","knowledge_points":"...","final_answer":"...","estimated_study_time":5}]` },
                  { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
                ],
              }],
              temperature: 0.1,
              max_tokens: 4096,
            }),
          });

          if (aiResp.ok) {
            const result = await aiResp.json();
            const content = result.choices?.[0]?.message?.content || "";
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const aiItems = JSON.parse(content.slice(jsonMatch.index, jsonMatch.index + jsonMatch[0].length));
              if (Array.isArray(aiItems) && aiItems.length > 0) {
                const summaryText = aiItems.map((it: any, i: number) => `【${i + 1}】${it.problem_text}`).join("\n");
                const totalTime = aiItems.reduce((s: number, it: any) => s + (it.estimated_study_time || 0), 0);

                // Update problem
                await fetch(URL(`/rest/v1/problems?id=eq.${problem.id}`), {
                  method: "PATCH",
                  headers: REST,
                  body: JSON.stringify({
                    problem_text: summaryText,
                    estimated_study_time: totalTime || null,
                    status: "completed",
                  }),
                });

                // Insert problem items
                for (let i = 0; i < aiItems.length; i++) {
                  const it = aiItems[i] as any;
                  await fetch(URL("/rest/v1/problem_items"), {
                    method: "POST",
                    headers: REST,
                    body: JSON.stringify({
                      problem_id: problem.id,
                      user_id: userId,
                      item_number: i + 1,
                      problem_text: it.problem_text,
                      solution_steps: it.solution_steps || null,
                      solution_method: it.solution_method || null,
                      knowledge_points: it.knowledge_points || null,
                      final_answer: it.final_answer || null,
                      estimated_study_time: it.estimated_study_time || null,
                    }),
                  });
                }

                // Create review schedule
                const intervals = [1, 2, 4, 7, 15, 30];
                await fetch(URL("/rest/v1/review_schedules"), {
                  method: "POST",
                  headers: REST,
                  body: JSON.stringify({
                    problem_id: problem.id,
                    user_id: userId,
                    review_stage: 0,
                    scheduled_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
                    completed: false,
                    next_review_interval: intervals[0],
                  }),
                });
              }
            }
          }
        }
      } catch (e) {
        console.error("[upload] background error:", String(e).slice(0, 500));
        await fetch(URL(`/rest/v1/problems?id=eq.${problem.id}`), {
          method: "PATCH",
          headers: REST,
          body: JSON.stringify({ status: "error", ai_response_raw: { error: String(e).slice(0, 500) } }),
        });
      }
    })();

    return sendResponse();

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
