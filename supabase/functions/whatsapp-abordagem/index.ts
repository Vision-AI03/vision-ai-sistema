import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callClaude, MODEL_SONNET } from "../_shared/anthropic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { lead_id } = await req.json();
    if (!lead_id) throw new Error("lead_id obrigatório");

    const { data: lead, error } = await supabase
      .from("leads")
      .select("id, nome, empresa, segmento, origem_metadata, enriquecimento_site_raw, enriquecimento_instagram_raw")
      .eq("id", lead_id)
      .single();
    if (error || !lead) throw new Error("Lead não encontrado");

    const cidade = lead.origem_metadata?.cidade || "";
    const categoria = lead.origem_metadata?.categoria || lead.segmento || "";
    const empresa = lead.empresa || lead.nome || "vocês";

    // Sinais de operação extraídos do enriquecimento (se houver)
    const sinais: string[] = [];
    const siteRaw = lead.enriquecimento_site_raw as any;
    const igRaw = lead.enriquecimento_instagram_raw as any;
    if (siteRaw?.descricao) sinais.push(`Site: ${String(siteRaw.descricao).slice(0, 200)}`);
    if (siteRaw?.servicos) sinais.push(`Serviços: ${JSON.stringify(siteRaw.servicos).slice(0, 200)}`);
    if (igRaw?.biography) sinais.push(`Bio IG: ${String(igRaw.biography).slice(0, 200)}`);

    const system = `Você escreve mensagens curtas de primeiro contato no WhatsApp para prospecção B2B.

TOM (estilo Hormozi): direto, sem rodeio, específico da operação do lead, jamais soar como template.

REGRAS RÍGIDAS:
- Português do Brasil, voz natural de quem está digitando no celular.
- Máximo 4 linhas curtas. Nada de parágrafos longos.
- 1 saudação curtinha + 1 observação específica do negócio + oferta condensada + 1 pergunta fácil de responder no final.
- NUNCA: "tudo bem?", "espero que esteja bem", "sou da Vision AI e ofereço...", emojis, link, preço.
- A pergunta final é SIM/NÃO ou "tem [X] no fluxo de vocês?" — algo que respondem em 5 segundos.
- Mencionar empresa pelo nome quando possível.

OFERTA Vision AI: IA que automatiza atendimento por WhatsApp + qualificação de leads. Reduz o tempo manual em 60–80%.`;

    const user_prompt = `Lead:
- Empresa: ${empresa}
- Cidade: ${cidade}
- Categoria/segmento: ${categoria}
${sinais.length ? "- Sinais: " + sinais.join(" | ") : ""}

Escreva a mensagem de WhatsApp de primeiro contato. Apenas o texto da mensagem, sem aspas, sem cabeçalhos, sem nada antes ou depois.`;

    const mensagem = await callClaude({
      model: MODEL_SONNET,
      system,
      prompt: user_prompt,
      temperature: 0.85,
      maxTokens: 400,
    });

    return new Response(JSON.stringify({ mensagem: mensagem.trim() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("whatsapp-abordagem error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
