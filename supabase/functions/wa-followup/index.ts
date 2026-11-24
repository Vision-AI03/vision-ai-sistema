// Fila "não deixe esfriar" (tela /hoje).
//   { acao: "sugerir", lead_id }         → IA redige a próxima mensagem do funil COT-AI
//   { acao: "enviar", lead_id, texto }   → envia pelo WhatsApp (UazAPI) com 1 clique
// A mensagem enviada volta pelo webhook (wa-webhook) como from_me e entra na conversa.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { donoDoBearer } from "../_shared/auth.ts";
import { callClaude, MODEL_SONNET } from "../_shared/anthropic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Objetivo da próxima mensagem em cada estágio do funil.
const OBJETIVO: Record<string, string> = {
  contatado: "O lead foi abordado e não respondeu. Retome de forma leve e curta, oferecendo cotar 2 ou 3 rotas dele de graça com a COT-AI para ele comparar com o que paga hoje.",
  respondeu: "O lead respondeu, mas ainda não mandou rotas. Conduza para ele enviar 2 ou 3 rotas (origem, destino e tipo de carga) para você cotar com a COT-AI.",
  rotas_recebidas: "O lead já mandou as rotas. Confirme o recebimento e diga quando a cotação chega, ou entregue a cotação se ela já estiver na conversa.",
  cotacao_enviada: "As cotações já foram entregues. Pergunte o que ele achou dos valores e proponha uma call rápida de onboarding para implantar a COT-AI.",
  onboarding_agendado: "A call de onboarding foi combinada. Confirme dia e horário e diga o que ele precisa ter em mãos.",
};

async function conversa(leadId: string) {
  const { data: convs } = await supabase.from("wa_conversas").select("id, telefone").eq("lead_id", leadId);
  const ids = (convs ?? []).map((c) => c.id);
  if (ids.length === 0) return { telefone: null, mensagens: [] as any[] };
  const { data: msgs } = await supabase
    .from("wa_mensagens")
    .select("from_me, conteudo, tipo, enviada_em")
    .in("conversa_id", ids)
    .order("enviada_em", { ascending: false })
    .limit(25);
  return { telefone: convs![0].telefone as string, mensagens: (msgs ?? []).reverse() };
}

async function sugerir(leadId: string) {
  const { data: lead } = await supabase
    .from("leads").select("nome, empresa, status, resumo_empresa, dores_identificadas").eq("id", leadId).maybeSingle();
  if (!lead) return json({ ok: false, error: "lead não encontrado" });

  const { mensagens } = await conversa(leadId);
  if (mensagens.length === 0) return json({ ok: false, error: "lead sem conversa no WhatsApp" });

  const historico = mensagens.map((m) => {
    const quem = m.from_me ? "VOCÊ" : "CLIENTE";
    const quando = new Date(m.enviada_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    return `[${quem}] (${quando}): ${m.conteudo || `[${m.tipo}]`}`;
  }).join("\n");

  const system = `Você escreve mensagens de WhatsApp comercial para o Wesley, fundador da Vision AI.
A porta de entrada é a COT-AI: cotação de frete com IA para transportadoras. O funil é: abordar → receber 2 ou 3 rotas do cliente → devolver as cotações feitas na COT-AI → call de onboarding com implantação.

Regras:
- Português do Brasil, tom de conversa entre pessoas, sem cara de robô ou de marketing.
- Curta: 1 a 3 frases. Uma pergunta ou chamada clara no final.
- Responda ao que o cliente disse por último, se ele falou por último.
- Sem emojis em excesso (no máximo 1), sem markdown, sem saudação longa, sem assinatura.
- Nunca invente preço, prazo ou cotação que não esteja na conversa.
Devolva APENAS o texto da mensagem.`;

  const prompt = `Lead: ${lead.nome}${lead.empresa ? ` (${lead.empresa})` : ""}
Estágio: ${lead.status}
Objetivo desta mensagem: ${OBJETIVO[lead.status ?? ""] ?? "Avance a conversa para o próximo passo do funil."}
${lead.resumo_empresa ? `Sobre a empresa: ${lead.resumo_empresa}\n` : ""}
Conversa (mais antiga → mais recente):
${historico}

Escreva a próxima mensagem do Wesley.`;

  try {
    const texto = (await callClaude({ model: MODEL_SONNET, system, prompt, maxTokens: 400 })).trim();
    return json({ ok: true, texto });
  } catch (e) {
    console.error("sugerir:", e);
    return json({ ok: false, error: "falha ao gerar a mensagem com IA" });
  }
}

async function enviar(leadId: string, texto: string) {
  if (!texto?.trim()) return json({ ok: false, error: "mensagem vazia" });
  const base = Deno.env.get("UAZAPI_URL");
  const token = Deno.env.get("UAZAPI_TOKEN");
  if (!base || !token) return json({ ok: false, error: "UAZAPI_URL/UAZAPI_TOKEN não configurados" });

  let { telefone } = await conversa(leadId);
  if (!telefone) {
    const { data: lead } = await supabase.from("leads").select("telefone").eq("id", leadId).maybeSingle();
    telefone = (lead?.telefone ?? "").replace(/\D/g, "") || null;
  }
  if (!telefone) return json({ ok: false, error: "lead sem telefone" });

  const res = await fetch(`${base}/send/text`, {
    method: "POST",
    headers: { token, "Content-Type": "application/json" },
    body: JSON.stringify({ number: telefone, text: texto.trim() }),
  });
  if (!res.ok) {
    const corpo = await res.text();
    console.error("uazapi send/text:", res.status, corpo);
    return json({ ok: false, error: `UazAPI recusou o envio (${res.status})` });
  }

  await supabase.from("leads").update({
    followup_adiado_ate: null,
    whatsapp_enviado: true,
    whatsapp_enviado_em: new Date().toISOString(),
  }).eq("id", leadId);
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!(await donoDoBearer(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  if (!body.lead_id) return json({ ok: false, error: "lead_id obrigatório" });
  if (body.acao === "sugerir") return sugerir(body.lead_id);
  if (body.acao === "enviar") return enviar(body.lead_id, body.texto);
  return json({ ok: false, error: "acao inválida" });
});
