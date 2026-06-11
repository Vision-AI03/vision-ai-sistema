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
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { contato_ids, template_id } = await req.json();

    if (!contato_ids?.length || !template_id) {
      return new Response(JSON.stringify({ error: "contato_ids and template_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch template
    const { data: template, error: tErr } = await supabase
      .from("email_templates_nicho")
      .select("*")
      .eq("id", template_id)
      .single();

    if (tErr || !template) {
      return new Response(JSON.stringify({ error: "Template not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch contacts
    const { data: contatos, error: cErr } = await supabase
      .from("email_contatos")
      .select("*")
      .in("id", contato_ids);

    if (cErr || !contatos?.length) {
      return new Response(JSON.stringify({ error: "Contacts not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { id: string; success: boolean; error?: string }[] = [];

    // Process in batches of 5
    for (let i = 0; i < contatos.length; i += 5) {
      const batch = contatos.slice(i, i + 5);
      const promises = batch.map(async (contato) => {
        try {
          // Replace placeholders in prompt
          let prompt = template.prompt_ia
            .replace(/\{\{nome\}\}/g, contato.nome || "")
            .replace(/\{\{empresa\}\}/g, contato.empresa || "")
            .replace(/\{\{cargo\}\}/g, contato.cargo || "")
            .replace(/\{\{email\}\}/g, contato.email || "");

          let assuntoBase = (template.assunto_base || "")
            .replace(/\{\{nome\}\}/g, contato.nome || "")
            .replace(/\{\{empresa\}\}/g, contato.empresa || "");

          const systemPrompt = `Você é um copywriter especialista em cold emails B2B. Gere um email personalizado seguindo as instruções do prompt.

${template.exemplo_email ? `EXEMPLO DE REFERÊNCIA:\n${template.exemplo_email}\n` : ""}

REGRAS:
1. Email máximo 200 palavras
2. Tom profissional mas acessível
3. Personalizar com os dados do contato
4. CTA clara (agendar reunião/demonstração)
5. Não usar linguagem genérica

Retorne um JSON com:
{
  "assunto": "Linha de assunto personalizada (max 80 chars)",
  "conteudo": "Corpo do email em texto puro"
}

Retorne APENAS o JSON.`;

          const userPrompt = `PROMPT DO TEMPLATE: ${prompt}

DADOS DO CONTATO:
- Nome: ${contato.nome || "Não informado"}
- Email: ${contato.email}
- Empresa: ${contato.empresa || "Não informada"}
- Cargo: ${contato.cargo || "Não informado"}
${assuntoBase ? `\nASSUNTO BASE PARA ADAPTAR: ${assuntoBase}` : ""}`;

          const aiContent = await callClaude({
            model: MODEL_SONNET,
            system: systemPrompt,
            prompt: userPrompt,
            temperature: 0.7,
          });

          const cleaned = aiContent.replace(/```json\s*/gi, "").replace(/```/g, "");
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

          if (!jsonMatch) throw new Error("AI did not return valid JSON");

          const emailDraft = JSON.parse(jsonMatch[0]);

          // Update contact with generated email
          await supabase
            .from("email_contatos")
            .update({
              email_gerado: emailDraft.conteudo,
              email_assunto: emailDraft.assunto,
              status_envio: "gerado",
            })
            .eq("id", contato.id);

          results.push({ id: contato.id, success: true });
        } catch (e: any) {
          console.error(`Error generating for ${contato.id}:`, e);
          results.push({ id: contato.id, success: false, error: e.message });
        }
      });

      await Promise.all(promises);
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-niche-emails error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
