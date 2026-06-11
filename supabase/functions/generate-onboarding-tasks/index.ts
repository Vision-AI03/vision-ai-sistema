import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callClaudeMessages, MODEL_HAIKU } from "../_shared/anthropic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIPO_LABELS: Record<string, string> = {
  agente_ia: "Agente de IA",
  automacao: "Automação de Processos",
  sistema: "Sistema Web/App",
  manutencao: "Manutenção e Suporte",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { contrato_id, user_id } = await req.json();
    if (!contrato_id || !user_id) {
      return new Response(JSON.stringify({ error: "contrato_id and user_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch contract + installments
    const [contratoRes, parcelasRes] = await Promise.all([
      supabase.from("contratos").select("*").eq("id", contrato_id).single(),
      supabase.from("parcelas").select("*").eq("contrato_id", contrato_id).order("data_vencimento"),
    ]);

    if (contratoRes.error || !contratoRes.data) {
      return new Response(JSON.stringify({ error: "Contrato não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contrato = contratoRes.data;
    const parcelas = parcelasRes.data || [];

    // Try to read PDF content from storage for richer AI context
    let pdfText = "";
    if (contrato.pdf_url) {
      try {
        const { data: fileData, error: fileError } = await supabase.storage
          .from("contratos-pdf")
          .download(contrato.pdf_url);
        if (!fileError && fileData) {
          // Pass the PDF as base64 for Gemini multimodal
          const arrayBuffer = await fileData.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binary = "";
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          pdfText = btoa(binary);
        }
      } catch (_) {
        // Continue without PDF
      }
    }

    const today = new Date().toISOString().split("T")[0];

    const systemPrompt = `Você é um gerente de projetos especialista em entregas de soluções de IA e automação para empresas brasileiras.
Seu papel é gerar um plano de onboarding detalhado e prático para um novo contrato que acabou de ser ativado.

REGRAS OBRIGATÓRIAS:
- Gere entre 5 e 8 tarefas de onboarding específicas e acionáveis
- As datas devem ser realistas para o tipo e valor do projeto (projetos maiores = mais tempo)
- Alinhe marcos importantes com as datas de pagamento quando houver
- A primeira tarefa deve ser sempre o kick-off (1-3 dias após hoje)
- A última tarefa deve ser um check-in de satisfação após a entrega
- Responda APENAS com JSON válido, sem texto extra, sem markdown

FORMATO DE RESPOSTA:
{"tarefas":[{"titulo":"string","descricao":"string","prioridade":"alta"|"media"|"baixa","data_vencimento":"YYYY-MM-DD"}]}`;

    const parcelasText = parcelas.length > 0
      ? parcelas.map(p => `- ${p.descricao || "Parcela"}: R$ ${Number(p.valor).toFixed(2)} vence em ${p.data_vencimento}`).join("\n")
      : "Sem parcelas cadastradas";

    const userMessageContent: any[] = [
      {
        type: "text",
        text: `Gere as tarefas de onboarding para o seguinte contrato ativado hoje (${today}):

Cliente: ${contrato.cliente_nome}
Tipo de Serviço: ${TIPO_LABELS[contrato.tipo_servico] || contrato.tipo_servico}
Valor Total: R$ ${Number(contrato.valor_total).toFixed(2)}
Data de Ativação: ${today}

Parcelas / Cronograma de Pagamentos:
${parcelasText}

${pdfText ? "Um PDF do contrato está disponível para análise de escopo e prazos." : ""}

Gere tarefas de onboarding com datas precisas e adequadas para este projeto.`,
      },
    ];

    // Include PDF as multimodal input if available (formato Anthropic: document block)
    if (pdfText) {
      userMessageContent.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: pdfText,
        },
      });
    }

    const content = await callClaudeMessages({
      model: MODEL_HAIKU,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessageContent }],
    });

    // Parse AI JSON response
    let tarefasData: { tarefas: Array<{ titulo: string; descricao: string; prioridade: string; data_vencimento: string }> };
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      tarefasData = JSON.parse(cleaned);
    } catch (_) {
      console.error("Failed to parse AI response:", content);
      return new Response(JSON.stringify({ error: "IA retornou formato inválido" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Array.isArray(tarefasData.tarefas) || tarefasData.tarefas.length === 0) {
      return new Response(JSON.stringify({ error: "IA não gerou tarefas" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert tasks into database
    const tarefasInsert = tarefasData.tarefas.map((t) => ({
      titulo: t.titulo,
      descricao: t.descricao || null,
      prioridade: ["alta", "media", "baixa"].includes(t.prioridade) ? t.prioridade : "media",
      data_vencimento: t.data_vencimento || null,
      contrato_id: contrato_id,
      user_id: user_id,
      status: "todo",
      concluida: false,
    }));

    const { error: insertError } = await supabase.from("tarefas").insert(tarefasInsert);
    if (insertError) {
      console.error("Insert tarefas error:", insertError);
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, count: tarefasInsert.length, tarefas: tarefasData.tarefas }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-onboarding-tasks error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
