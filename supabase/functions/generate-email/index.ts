import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callClaude, MODEL_SONNET } from "../_shared/anthropic.ts";

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
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { lead_id } = await req.json();
  if (!lead_id) {
    return new Response(JSON.stringify({ error: "lead_id is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", lead_id)
    .maybeSingle();

  if (leadError || !lead) {
    return new Response(JSON.stringify({ error: "Lead not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const prompt = `Você é um especialista em vendas da Vision AI, uma agência de inteligência artificial que cria agentes IA, automações e sistemas personalizados para empresas.

Gere um email de prospecção frio e personalizado para este lead, usando todos os dados enriquecidos disponíveis.

DADOS DO LEAD:
- Nome: ${lead.nome}
- Empresa: ${lead.empresa || "Não informado"}
- Cargo: ${lead.linkedin_cargo || "Não informado"}
- Segmento: ${lead.segmento || "Não informado"}
- Porte: ${lead.porte_empresa || "Não informado"}
- Maturidade Digital: ${lead.nivel_maturidade_digital || "Não informado"}
- Dores: ${lead.dores_identificadas || "Não informado"}
- Oportunidades: ${lead.oportunidades || "Não informado"}
- Resumo da Empresa: ${lead.resumo_empresa || "Não informado"}
- Site: ${lead.site_empresa || "Não informado"}
- Mensagem original: ${lead.mensagem_original || "Não informou"}

REGRAS:
1. O email deve ser personalizado com informações específicas da empresa/lead
2. Mencione como a Vision AI pode resolver as dores identificadas
3. Use tom profissional mas acessível
4. Inclua uma CTA clara (agendar reunião)
5. Máximo 200 palavras no corpo do email
6. Não use linguagem genérica — seja específico sobre o negócio do lead

Retorne um JSON com:
{
  "assunto": "Linha de assunto do email (max 60 chars, sem emojis)",
  "conteudo": "Corpo do email em texto puro (sem HTML)"
}

Retorne APENAS o JSON, sem markdown.`;

  try {
    const aiContent = await callClaude({
      model: MODEL_SONNET,
      prompt,
      temperature: 0.7,
    });

    const cleaned = aiContent.replace(/```json\s*/gi, "").replace(/```/g, "");
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const emailDraft = JSON.parse(jsonMatch[0]);

      return new Response(JSON.stringify({
        success: true,
        data: {
          assunto: emailDraft.assunto || "Proposta Vision AI",
          conteudo: emailDraft.conteudo || "",
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      throw new Error("AI did not return valid JSON");
    }
  } catch (e) {
    console.error("Email generation error:", e);
    return new Response(JSON.stringify({ error: "Failed to generate email", details: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
