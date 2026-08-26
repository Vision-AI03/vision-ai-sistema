import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callClaude, MODEL_HAIKU } from "../_shared/anthropic.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, x-cron-secret" };

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// respondeu (4) fica entre contatado e reuniao — setado pelo bridge do WhatsApp
const STAGE_ORDER: Record<string, number> = {
  novo: 1, enriquecido: 2, contatado: 3, respondeu: 4, reuniao_agendada: 5, perdido: 99,
};

let ownerCache: string | null = null;
async function resolverDono(fallback?: string): Promise<string | null> {
  if (fallback) return fallback;
  if (ownerCache) return ownerCache;
  // Single-tenant: dono canônico via RPC owner_id()
  const { data } = await supabase.rpc("owner_id");
  ownerCache = (data as string | null) ?? null;
  return ownerCache;
}

async function analisarLead(leadId: string, userId: string): Promise<{ ok: boolean; motivo?: string }> {
  const { data: lead } = await supabase
    .from("leads")
    .select("id, nome, empresa, status")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { ok: false, motivo: "lead nao encontrado" };

  // Conversas do lead no canal UazAPI (wa_*)
  const { data: convs } = await supabase.from("wa_conversas").select("id").eq("lead_id", leadId);
  const convIds = (convs ?? []).map((c) => c.id);
  if (convIds.length === 0) return { ok: false, motivo: "sem conversa" };

  const { data: mensagens } = await supabase
    .from("wa_mensagens")
    .select("from_me, conteudo, enviada_em, tipo")
    .in("conversa_id", convIds)
    .order("enviada_em", { ascending: true })
    .limit(20);
  if (!mensagens || mensagens.length === 0) return { ok: false, motivo: "sem mensagens" };

  const historico = mensagens.map((m) => {
    const role = m.from_me ? "VENDEDOR" : "CLIENTE";
    const ts = new Date(m.enviada_em).toLocaleString("pt-BR");
    const texto = m.conteudo || `[${m.tipo}]`;
    return `[${role}] (${ts}): ${texto}`;
  }).join("\n");

  const ultimaResposta = [...mensagens].reverse().find((m) => !m.from_me);
  const diasSemResposta = ultimaResposta
    ? Math.floor((Date.now() - new Date(ultimaResposta.enviada_em).getTime()) / 86400000)
    : 999;

  const prompt = `Você é um classificador de leads comerciais especializado em vendas B2B de serviços.

Analise a conversa abaixo entre um VENDEDOR e um CLIENTE POTENCIAL.
Classifique em qual estágio do funil de vendas essa negociação está.

ESTÁGIOS POSSÍVEIS:
- "contatado": O cliente respondeu, mas sem demonstrar interesse claro no serviço
- "reuniao_agendada": Foi combinada uma reunião, call, visita ou demonstração
- "perdido": O cliente recusou, disse que não quer, ou está sem responder há mais de 14 dias

REGRAS:
1. Baseie-se APENAS no conteúdo das mensagens
2. Se houver dúvida, escolha o estágio mais conservador
3. Confirmação de reunião/call = "reuniao_agendada"
4. Recusa explícita ou sem resposta há mais de 14 dias = "perdido"

INFORMAÇÕES DO LEAD:
- Nome: ${lead.nome}
- Empresa: ${lead.empresa || "N/A"}
- Estágio atual: ${lead.status || "novo"}
- Dias sem resposta do cliente: ${diasSemResposta}

CONVERSA:
${historico}

Responda APENAS com JSON válido, sem markdown, sem backticks:
{"estagio": "string", "confianca": number, "motivo": "string", "acoes_sugeridas": "string"}`;

  let ai: { estagio: string; confianca: number; motivo: string; acoes_sugeridas: string };
  try {
    const raw = await callClaude({ model: MODEL_HAIKU, prompt, temperature: 0.1, maxTokens: 500 });
    ai = JSON.parse(raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim());
  } catch (err) {
    return { ok: false, motivo: "erro IA: " + String(err) };
  }

  const { estagio, confianca, motivo, acoes_sugeridas } = ai;
  const estagioAtual = lead.status || "novo";
  const ordemAtual = STAGE_ORDER[estagioAtual] || 1;
  const ordemSugerido = STAGE_ORDER[estagio] || 1;

  await supabase.from("analise_lead_ia").insert({
    user_id: userId, lead_id: leadId,
    estagio_anterior: estagioAtual, estagio_sugerido: estagio,
    confianca, motivo, acoes_sugeridas,
    mensagens_analisadas: mensagens.length, aplicado: false,
  });

  const isValidProgression = estagio === "perdido" || ordemSugerido > ordemAtual;

  if (confianca >= 70 && isValidProgression) {
    await supabase.from("leads").update({ status: estagio, estagio_fonte: "ia_whatsapp", status_mudou_em: new Date().toISOString() }).eq("id", leadId);
    await supabase.from("analise_lead_ia").update({ aplicado: true }).eq("lead_id", leadId).eq("aplicado", false);
    await supabase.from("notificacoes").insert({
      user_id: userId, tipo: "estagio_mudou_ia",
      titulo: `IA moveu "${lead.nome}" para "${estagio}"`,
      descricao: motivo, link: "/crm",
      metadata: { lead_id: leadId, estagio_anterior: estagioAtual, estagio_novo: estagio, confianca },
    }).then(() => {}, () => {});
  } else if (confianca < 70 && isValidProgression) {
    await supabase.from("notificacoes").insert({
      user_id: userId, tipo: "sugestao_estagio_ia",
      titulo: `IA sugere mover "${lead.nome}" para "${estagio}" (${confianca}% confiança)`,
      descricao: `${motivo} — Acesse o CRM para aceitar ou recusar.`, link: "/crm",
      metadata: { lead_id: leadId, estagio_anterior: estagioAtual, estagio_sugerido: estagio, confianca },
    }).then(() => {}, () => {});
  }

  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Autorização: X-Cron-Secret (cron) OU Bearer (invocação autenticada do CRM)
  const cronSecret = req.headers.get("X-Cron-Secret");
  const auth = req.headers.get("Authorization");
  const cronOk = Deno.env.get("CRON_SECRET") && cronSecret === Deno.env.get("CRON_SECRET");
  if (!cronOk && !auth?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const body = await req.json().catch(() => ({}));
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  // Modo 1: análise de um lead específico (invocação manual/CRM)
  if (body.lead_id) {
    const userId = await resolverDono(body.user_id);
    if (!userId) return new Response(JSON.stringify({ error: "dono não resolvido" }), { status: 500, headers: jsonHeaders });
    const r = await analisarLead(body.lead_id, userId);
    return new Response(JSON.stringify(r), { status: r.ok ? 200 : 200, headers: jsonHeaders });
  }

  // Modo 2: batch (cron) — leads que responderam e têm conversa nova desde a última análise
  const userId = await resolverDono();
  if (!userId) return new Response(JSON.stringify({ error: "dono não resolvido" }), { status: 500, headers: jsonHeaders });

  const { data: conversas } = await supabase.rpc("wa_conversas_para_estagio", { p_limite: 25 });
  let analisados = 0;
  for (const conv of (conversas ?? []) as Array<{ id: string; lead_id: string }>) {
    if (!conv.lead_id) continue;
    const r = await analisarLead(conv.lead_id, userId);
    await supabase.from("wa_conversas").update({ estagio_analisado_ate: new Date().toISOString() }).eq("id", conv.id);
    if (r.ok) analisados++;
  }

  return new Response(JSON.stringify({ ok: true, analisados }), { status: 200, headers: jsonHeaders });
});
