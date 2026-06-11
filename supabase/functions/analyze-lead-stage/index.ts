import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callClaude, MODEL_HAIKU } from "../_shared/anthropic.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const STAGE_ORDER: Record<string, number> = {
  novo: 1,
  enriquecido: 2,
  contatado: 3,
  reuniao_agendada: 4,
  perdido: 99,
};

Deno.serve(async (req) => {
  const { lead_id, user_id } = await req.json();
  if (!lead_id || !user_id) {
    return new Response(JSON.stringify({ error: "lead_id e user_id são obrigatórios" }), { status: 400 });
  }

  // Fetch lead
  const { data: lead } = await supabase
    .from("leads")
    .select("id, nome, empresa, status, ultima_mensagem_whatsapp")
    .eq("id", lead_id)
    .maybeSingle();

  if (!lead) {
    return new Response(JSON.stringify({ error: "Lead não encontrado" }), { status: 404 });
  }

  // Fetch last 20 messages
  const { data: mensagens } = await supabase
    .from("whatsapp_mensagens")
    .select("direcao, conteudo, timestamp_whatsapp, tipo_mensagem")
    .eq("lead_id", lead_id)
    .order("timestamp_whatsapp", { ascending: true })
    .limit(20);

  if (!mensagens || mensagens.length === 0) {
    return new Response(JSON.stringify({ error: "Sem mensagens para analisar" }), { status: 200 });
  }

  // Build conversation history
  const historico = mensagens.map((m) => {
    const role = m.direcao === "enviada" ? "VENDEDOR" : "CLIENTE";
    const ts = new Date(m.timestamp_whatsapp).toLocaleString("pt-BR");
    const texto = m.conteudo || `[${m.tipo_mensagem}]`;
    return `[${role}] (${ts}): ${texto}`;
  }).join("\n");

  // Days without lead response
  const ultimaResposta = mensagens.filter(m => m.direcao === "recebida").pop();
  const diasSemResposta = ultimaResposta
    ? Math.floor((Date.now() - new Date(ultimaResposta.timestamp_whatsapp).getTime()) / 86400000)
    : 999;

  const prompt = `Você é um classificador de leads comerciais especializado em vendas B2B de serviços.

Analise a conversa abaixo entre um VENDEDOR e um CLIENTE POTENCIAL.
Classifique em qual estágio do funil de vendas essa negociação está.

ESTÁGIOS POSSÍVEIS:
- "novo": Primeiro contato enviado, sem resposta do cliente ainda
- "enriquecido": Lead tem dados enriquecidos, ainda não foi contatado efetivamente
- "contatado": O cliente respondeu, mas sem demonstrar interesse claro no serviço
- "reuniao_agendada": Foi combinada uma reunião, call, visita ou demonstração
- "perdido": O cliente recusou, disse que não quer, ou está sem responder há mais de 14 dias

REGRAS:
1. Baseie-se APENAS no conteúdo das mensagens
2. Se houver dúvida entre dois estágios, escolha o ANTERIOR (mais conservador)
3. Mensagens de saudação simples ("oi", "olá") do cliente = "contatado"
4. Confirmação de reunião/call = "reuniao_agendada"
5. Recusa explícita ou sem resposta há mais de 14 dias = "perdido"

INFORMAÇÕES DO LEAD:
- Nome: ${lead.nome}
- Empresa: ${lead.empresa || "N/A"}
- Estágio atual: ${lead.status || "novo"}
- Dias sem resposta do cliente: ${diasSemResposta}

CONVERSA:
${historico}

Responda APENAS com JSON válido, sem markdown, sem backticks:
{"estagio": "string", "confianca": number, "motivo": "string", "acoes_sugeridas": "string"}`;

  let aiResult: { estagio: string; confianca: number; motivo: string; acoes_sugeridas: string };
  try {
    const rawText = await callClaude({
      model: MODEL_HAIKU,
      prompt,
      temperature: 0.1,
      maxTokens: 500,
    });
    // Strip eventuais cercas ```json antes do parse (prompt já pede sem markdown, defensivo)
    const cleaned = rawText.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
    aiResult = JSON.parse(cleaned);
  } catch (err) {
    return new Response(JSON.stringify({ error: "Erro ao chamar IA: " + String(err) }), { status: 500 });
  }

  const { estagio, confianca, motivo, acoes_sugeridas } = aiResult;
  const estagioAtual = lead.status || "novo";
  const ordemAtual = STAGE_ORDER[estagioAtual] || 1;
  const ordemSugerido = STAGE_ORDER[estagio] || 1;

  // Log the analysis
  await supabase.from("analise_lead_ia").insert({
    user_id,
    lead_id,
    estagio_anterior: estagioAtual,
    estagio_sugerido: estagio,
    confianca,
    motivo,
    acoes_sugeridas,
    mensagens_analisadas: mensagens.length,
    aplicado: false,
  });

  // Mark messages as analyzed
  await supabase
    .from("whatsapp_mensagens")
    .update({ analisado: true })
    .eq("lead_id", lead_id)
    .eq("analisado", false);

  // Apply if confidence >= 70 and it's a valid progression
  const isValidProgression =
    estagio === "perdido" || // perdido sempre válido
    (ordemSugerido > ordemAtual); // só avançar

  if (confianca >= 70 && isValidProgression) {
    await supabase.from("leads").update({
      status: estagio,
      estagio_fonte: "ia_whatsapp",
    }).eq("id", lead_id);

    await supabase.from("analise_lead_ia").update({ aplicado: true })
      .eq("lead_id", lead_id)
      .eq("aplicado", false);

    // Create notification
    const { data: { user } } = await supabase.auth.admin.getUserById(user_id) as any;
    await supabase.from("notificacoes").insert({
      user_id,
      tipo: "estagio_mudou_ia",
      titulo: `IA moveu "${lead.nome}" para "${estagio}"`,
      descricao: motivo,
      link: "/crm",
      metadata: { lead_id, estagio_anterior: estagioAtual, estagio_novo: estagio, confianca },
    }).catch(() => {});
  } else if (confianca < 70 && isValidProgression) {
    // Low confidence — create suggestion notification
    await supabase.from("notificacoes").insert({
      user_id,
      tipo: "sugestao_estagio_ia",
      titulo: `IA sugere mover "${lead.nome}" para "${estagio}" (${confianca}% confiança)`,
      descricao: `${motivo} — Acesse o CRM para aceitar ou recusar.`,
      link: "/crm",
      metadata: { lead_id, estagio_anterior: estagioAtual, estagio_sugerido: estagio, confianca, analise_id: null },
    }).catch(() => {});
  }

  return new Response(JSON.stringify({
    estagio_sugerido: estagio,
    confianca,
    motivo,
    acoes_sugeridas,
    aplicado: confianca >= 70 && isValidProgression,
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
