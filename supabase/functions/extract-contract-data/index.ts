import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callClaudeWithTool, MODEL_HAIKU } from "../_shared/anthropic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
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

  try {
    const { pdf_base64, file_name } = await req.json();
    if (!pdf_base64) {
      return new Response(JSON.stringify({ error: "Missing pdf_base64" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const system = `Você é um assistente especializado em extrair dados de contratos de prestação de serviços de tecnologia, automação e IA.
Analise o PDF do contrato e extraia as informações relevantes.
Se algum campo não estiver presente no documento, retorne null para ele.
Valores monetários devem ser números (sem formatação).
O tipo_servico deve ser um de: agente_ia, automacao, sistema, manutencao.
Para num_parcelas, conte quantas parcelas de pagamento existem (excluindo entrada/sinal).
O valor_entrada é um pagamento inicial/sinal, se houver.
O valor_recorrencia é um valor mensal recorrente (mensalidade), se houver.`;

    const extracted = await callClaudeWithTool({
      model: MODEL_HAIKU,
      system,
      content: [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: pdf_base64,
          },
        },
        {
          type: "text",
          text: `Extraia os dados deste contrato (arquivo: ${file_name || "contrato.pdf"}):`,
        },
      ],
      tool: {
        name: "extract_contract_data",
        description: "Extrair dados estruturados de um contrato",
        input_schema: {
          type: "object",
          properties: {
            cliente_nome: { type: "string", description: "Nome completo do cliente/contratante" },
            cliente_email: { type: ["string", "null"], description: "Email do cliente" },
            cliente_telefone: { type: ["string", "null"], description: "Telefone do cliente" },
            tipo_servico: {
              type: "string",
              enum: ["agente_ia", "automacao", "sistema", "manutencao"],
              description: "Tipo de serviço contratado",
            },
            valor_total: { type: ["number", "null"], description: "Valor total do contrato em reais" },
            num_parcelas: { type: ["number", "null"], description: "Número de parcelas do pagamento" },
            valor_entrada: { type: ["number", "null"], description: "Valor da entrada/sinal" },
            valor_recorrencia: { type: ["number", "null"], description: "Valor da recorrência mensal" },
            dia_vencimento: { type: ["number", "null"], description: "Dia do mês para vencimento" },
          },
          required: ["cliente_nome", "tipo_servico"],
        },
      },
    });

    return new Response(JSON.stringify({ success: true, data: extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-contract-data error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
