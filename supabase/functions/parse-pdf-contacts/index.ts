import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callClaude, MODEL_HAIKU } from "../_shared/anthropic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { pdf_text } = await req.json();

    if (!pdf_text) {
      return new Response(JSON.stringify({ error: "pdf_text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `Extraia todos os contatos do seguinte texto de PDF. Para cada contato, identifique:
- nome (se disponível)
- email (obrigatório)
- empresa (se disponível)
- cargo (se disponível)
- telefone (se disponível)

Texto do PDF:
${pdf_text.substring(0, 15000)}

Retorne um JSON array:
[
  { "nome": "...", "email": "...", "empresa": "...", "cargo": "...", "telefone": "..." }
]

Se não encontrar contatos, retorne [].
Retorne APENAS o JSON array.`;

    const content = await callClaude({
      model: MODEL_HAIKU,
      prompt,
      temperature: 0.1,
    });

    // Strip eventuais cercas ```json antes de extrair o array
    const cleaned = content.replace(/```json\s*/gi, "").replace(/```/g, "");
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);

    if (!jsonMatch) {
      return new Response(JSON.stringify({ success: true, contatos: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contatos = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify({ success: true, contatos }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("parse-pdf-contacts error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
