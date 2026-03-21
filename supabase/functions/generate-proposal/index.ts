import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const TIPO_SERVICO_LABELS: Record<string, string> = {
  agente_ia: "Agente de IA (automação com LLMs, chatbots inteligentes, assistentes virtuais)",
  automacao: "Automação de Processos (n8n, Make, Zapier, integrações entre sistemas)",
  sistema: "Sistema Personalizado (desenvolvimento de software sob medida com IA embarcada)",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
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

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { lead_id, tipo_servico, contexto_cliente, titulo } = await req.json();
  if (!tipo_servico || !contexto_cliente) {
    return new Response(JSON.stringify({ error: "tipo_servico and contexto_cliente are required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Busca dados do lead se fornecido
  let leadInfo = "";
  if (lead_id) {
    const { data: lead } = await supabase.from("leads").select("*").eq("id", lead_id).maybeSingle();
    if (lead) {
      leadInfo = `
**Dados do Lead:**
- Nome: ${lead.nome}
- Empresa: ${lead.empresa || "Não informado"}
- Segmento: ${lead.segmento || "Não informado"}
- Cargo: ${lead.linkedin_cargo || "Não informado"}
- Dores Identificadas: ${lead.dores_identificadas || "Não mapeadas"}
- Oportunidades: ${lead.oportunidades || "Não mapeadas"}
- Resumo da Empresa: ${lead.resumo_empresa || "Não disponível"}
- Maturidade Digital: ${lead.nivel_maturidade_digital || "Não avaliada"}
`;
    }
  }

  const tipoLabel = TIPO_SERVICO_LABELS[tipo_servico] || tipo_servico;

  const prompt = `Você é especialista em propostas comerciais B2B de tecnologia da **Vision AI**, uma agência brasileira de inteligência artificial que entrega soluções de alto impacto para empresas.

**Tipo de Solução:** ${tipoLabel}

**Contexto do Cliente (fornecido pelo consultor):**
${contexto_cliente}

${leadInfo}

**Instruções:**
Gere uma proposta comercial completa, profissional e persuasiva em português brasileiro. A proposta deve ser específica para este cliente — evite linguagem genérica. Use dados e contexto fornecidos para personalizar cada seção.

A Vision AI é uma agência especializada em:
- Agentes de IA com LLMs (GPT, Claude, Gemini) para automação de atendimento, vendas e operações
- Automações inteligentes com n8n, Make e integrações via API
- Sistemas personalizados com IA embarcada para resolver problemas específicos do negócio

**Estrutura obrigatória (use markdown com headers ##):**

## Proposta Comercial — [Nome da Empresa/Cliente]

## 1. Resumo Executivo
(2-3 parágrafos impactantes que sintetizam o problema e a solução)

## 2. Entendimento do Cenário Atual
(Descreva o problema ou oportunidade identificado de forma específica)

## 3. Solução Proposta
(Descreva a solução de forma detalhada e técnica mas acessível. Seja específico sobre o que será entregue)

## 4. Como Funciona — Metodologia
(Explique o processo de trabalho, etapas e como será a parceria)

## 5. Cronograma de Entrega
(Fases com estimativas de tempo. Exemplo: Semana 1-2: Discovery e mapeamento)

## 6. Investimento
(Apresente o valor de forma clara. Se não souber o valor exato, use faixas ou "a definir conforme escopo final")

## 7. O Que Está Incluído
(Lista de entregáveis claros com bullet points)

## 8. Próximos Passos
(CTA claro: o que acontece após aceitar esta proposta)

## 9. Sobre a Vision AI
(Breve apresentação da agência, diferenciais e proposta de valor)

---
*Proposta válida por 30 dias | Vision AI — Inteligência que transforma negócios*

Retorne APENAS o markdown da proposta, sem comentários adicionais.`;

  try {
    const aiRes = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.6,
      }),
    });

    const aiData = await aiRes.json();
    const conteudo = aiData.choices?.[0]?.message?.content || "";

    if (!conteudo) {
      throw new Error("AI returned empty response");
    }

    return new Response(JSON.stringify({ success: true, conteudo }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("AI error:", e);
    return new Response(JSON.stringify({ error: "AI generation failed", details: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  } catch (e) {
    console.error("Unhandled error:", e);
    return new Response(JSON.stringify({ error: "Internal server error", details: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
