import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callClaudeMessages, callClaudeWithTool, MODEL_SONNET } from "../_shared/anthropic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, template_content, action } = await req.json();

    let systemPrompt = "";

    if (action === "fill_contract") {
      systemPrompt = `Você é um assistente jurídico especializado em contratos de tecnologia e IA da Vision AI, uma agência brasileira de IA.

Seu papel é ajudar a preencher contratos a partir de templates. O usuário vai fornecer dados do cliente de forma livre (nome, CNPJ, valores, parcelas, etc.) e você deve:

1. Extrair todos os dados mencionados pelo usuário
2. Preencher os placeholders do template com os dados extraídos
3. Retornar o contrato completo e preenchido
4. Aceitar ajustes posteriores via chat

TEMPLATE DO CONTRATO:
${template_content}

REGRAS:
- Substitua TODOS os placeholders ({{nome_cliente}}, {{cnpj}}, {{valor_total}}, etc.) pelos dados fornecidos
- Se algum dado não foi fornecido, mantenha o placeholder e pergunte ao usuário
- Formate valores monetários no padrão brasileiro (R$ 1.000,00)
- Formate datas no padrão dd/MM/yyyy
- Responda SEMPRE em português brasileiro
- Quando retornar o contrato preenchido, envolva-o em tags <contrato> e </contrato>
- Fora das tags, explique o que foi preenchido e o que está faltando

IMPORTANTE: Ao extrair dados de uma mensagem do usuário, use tool calling para retornar os dados estruturados junto com o contrato preenchido.`;
    } else if (action === "extract_data") {
      systemPrompt = `Você é um assistente que extrai dados estruturados de mensagens sobre contratos. Extraia todos os dados possíveis da mensagem do usuário e retorne usando a função extract_contract_data. Responda em português brasileiro.`;
    }

    if (action === "extract_data") {
      const extractedData = await callClaudeWithTool({
        model: MODEL_SONNET,
        system: systemPrompt,
        messages,
        tool: {
          name: "extract_contract_data",
          description: "Extrai dados estruturados de uma mensagem sobre contrato",
          input_schema: {
            type: "object",
            properties: {
              nome_cliente: { type: "string", description: "Nome completo do cliente" },
              cnpj_cpf: { type: "string", description: "CNPJ ou CPF do cliente" },
              email_cliente: { type: "string", description: "Email do cliente" },
              telefone_cliente: { type: "string", description: "Telefone do cliente" },
              empresa: { type: "string", description: "Nome da empresa do cliente" },
              endereco: { type: "string", description: "Endereço do cliente" },
              valor_total: { type: "number", description: "Valor total do contrato" },
              numero_parcelas: { type: "integer", description: "Número de parcelas" },
              valor_parcela: { type: "number", description: "Valor de cada parcela" },
              valor_recorrente: { type: "number", description: "Valor da mensalidade recorrente" },
              tipo_pagamento: { type: "string", enum: ["avista", "parcelado", "recorrente"] },
              descricao_servico: { type: "string", description: "Descrição do serviço contratado" },
              data_inicio: { type: "string", description: "Data de início do contrato" },
              prazo_meses: { type: "integer", description: "Prazo do contrato em meses" },
            },
            required: ["nome_cliente"],
          },
        },
      });
      return new Response(JSON.stringify({ data: extractedData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const content = await callClaudeMessages({
      model: MODEL_SONNET,
      system: systemPrompt,
      messages,
      maxTokens: 8192,
    });
    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fill-contract error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
