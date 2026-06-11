import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callClaude, MODEL_SONNET } from "../_shared/anthropic.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function getWeekBounds(date: Date) {
  const day = date.getDay(); // 0=Sun
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMon);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

function toDateStr(d: Date) {
  return d.toISOString().split("T")[0];
}

Deno.serve(async (req) => {
  let targetUserId: string | null = null;
  try {
    const body = await req.json();
    targetUserId = body?.user_id || null;
  } catch { /* cron call with empty body */ }

  // Get all active users (or single user)
  let userIds: string[] = [];
  if (targetUserId) {
    userIds = [targetUserId];
  } else {
    const { data: configs } = await supabase.from("whatsapp_config").select("user_id");
    userIds = (configs || []).map((c: any) => c.user_id);
  }

  const results: any[] = [];

  for (const userId of userIds) {
    try {
      const result = await generateForUser(userId);
      results.push({ user_id: userId, ...result });
    } catch (err) {
      results.push({ user_id: userId, error: String(err) });
    }
  }

  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

async function generateForUser(userId: string) {
  const { monday, sunday } = getWeekBounds(new Date());
  const weekStart = toDateStr(monday);
  const weekEnd = toDateStr(sunday);

  // Collect week data
  const [mensagensRes, leadsRes] = await Promise.all([
    supabase
      .from("whatsapp_mensagens")
      .select("lead_id, direcao, conteudo, timestamp_whatsapp, tipo_mensagem")
      .eq("user_id", userId)
      .gte("timestamp_whatsapp", monday.toISOString())
      .lte("timestamp_whatsapp", sunday.toISOString())
      .order("timestamp_whatsapp", { ascending: true }),
    supabase
      .from("leads")
      .select("id, nome, empresa, status, estagio_fonte, ultima_mensagem_whatsapp, total_mensagens_whatsapp")
      .eq("user_id", userId),
  ]);

  const mensagens = mensagensRes.data || [];
  const leads = leadsRes.data || [];

  // Group messages by lead
  const leadMap: Record<string, any[]> = {};
  for (const m of mensagens) {
    if (!m.lead_id) continue;
    if (!leadMap[m.lead_id]) leadMap[m.lead_id] = [];
    leadMap[m.lead_id].push(m);
  }

  const leadIds = Object.keys(leadMap);
  const totalAbordados = leadIds.length;

  const leadsAbordados = leads.filter(l => leadIds.includes(l.id));
  const totalResponderam = leadsAbordados.filter(l =>
    (leadMap[l.id] || []).some((m: any) => m.direcao === "recebida")
  ).length;
  const totalPerdidos = leadsAbordados.filter(l => l.status === "perdido").length;
  const totalFechados = 0; // "fechado" stage removed
  const taxaConversao = totalAbordados > 0 ? Math.round((totalFechados / totalAbordados) * 100) : 0;
  const taxaResposta = totalAbordados > 0 ? Math.round((totalResponderam / totalAbordados) * 100) : 0;

  // Build conversation summaries
  const conversasSumario = leadsAbordados.slice(0, 15).map(l => {
    const msgs = leadMap[l.id] || [];
    const enviadas = msgs.filter((m: any) => m.direcao === "enviada").length;
    const recebidas = msgs.filter((m: any) => m.direcao === "recebida").length;
    const ultimaMsgTexto = msgs.slice(-3).map((m: any) => {
      const role = m.direcao === "enviada" ? "V" : "C";
      return `[${role}]: ${m.conteudo || `[${m.tipo_mensagem}]`}`;
    }).join(" | ");
    return `- ${l.nome} (${l.empresa || "N/A"}): ${enviadas} enviadas, ${recebidas} respondidas. Status: ${l.status}. Trecho: "${ultimaMsgTexto}"`;
  }).join("\n");

  const perdidosDetalhes = leadsAbordados
    .filter(l => l.status === "perdido")
    .map(l => `- ${l.nome} (${l.empresa || "N/A"})`)
    .join("\n") || "Nenhum";

  const prompt = `Você é um consultor de vendas sênior especializado em vendas B2B de serviços no mercado brasileiro.

Analise os dados de performance comercial da semana e gere um relatório detalhado e acionável.
Use tom direto, profissional e construtivo. Escreva em português brasileiro.

MÉTRICAS DA SEMANA (${weekStart} a ${weekEnd}):
- Leads abordados via WhatsApp: ${totalAbordados}
- Leads que responderam: ${totalResponderam} (taxa: ${taxaResposta}%)
- Leads perdidos: ${totalPerdidos}
- Taxa de resposta: ${taxaResposta}%

CONVERSAS DA SEMANA (resumo):
${conversasSumario || "Sem conversas registradas esta semana."}

LEADS PERDIDOS:
${perdidosDetalhes}

---

Gere o relatório com as seguintes seções em Markdown:

## 📊 Resumo Executivo
(3-4 frases resumindo a semana, destacando o ponto mais relevante positivo e negativo)

## ✅ O Que Funcionou
(Analise as conversas que geraram avanço. Identifique padrões que funcionaram. Cite exemplos das conversas.)

## ❌ O Que Não Funcionou
(Analise conversas sem resposta ou que geraram recusa. Identifique padrões de objeção.)

## 💡 Sugestões de Melhoria
(Máximo 5 sugestões acionáveis com exemplo prático cada.)

## 🎯 Previsão da Próxima Semana
(Quais leads têm maior probabilidade de avançar. Ações recomendadas específicas.)

## 🔥 Leads em Destaque
(Top 3-5 leads que merecem atenção especial, com motivo e ação sugerida.)

Responda APENAS com o relatório em Markdown, sem texto adicional antes ou depois.`;

  let relatorioMarkdown: string;
  try {
    relatorioMarkdown = await callClaude({
      model: MODEL_SONNET,
      prompt,
      temperature: 0.4,
      maxTokens: 4000,
    });
  } catch (err) {
    console.error("Anthropic error in weekly report:", err);
    relatorioMarkdown = "Relatório não disponível.";
  }

  // Extract executive summary (first section)
  const resumoMatch = relatorioMarkdown.match(/## 📊 Resumo Executivo\n([\s\S]*?)(?=\n##|$)/);
  const resumo = resumoMatch?.[1]?.trim() || relatorioMarkdown.slice(0, 500);

  const funcionouMatch = relatorioMarkdown.match(/## ✅ O Que Funcionou\n([\s\S]*?)(?=\n##|$)/);
  const naoFuncionouMatch = relatorioMarkdown.match(/## ❌ O Que Não Funcionou\n([\s\S]*?)(?=\n##|$)/);
  const sugestoesMatch = relatorioMarkdown.match(/## 💡 Sugestões de Melhoria\n([\s\S]*?)(?=\n##|$)/);
  const previsaoMatch = relatorioMarkdown.match(/## 🎯 Previsão da Próxima Semana\n([\s\S]*?)(?=\n##|$)/);

  // Save report
  const { data: relatorio } = await supabase.from("relatorios_semanais").insert({
    user_id: userId,
    semana_inicio: weekStart,
    semana_fim: weekEnd,
    resumo_executivo: resumo,
    total_leads_abordados: totalAbordados,
    total_avancaram: 0,
    total_perdidos: totalPerdidos,
    taxa_conversao: taxaConversao,
    analise_funcionou: funcionouMatch?.[1]?.trim() || "",
    analise_nao_funcionou: naoFuncionouMatch?.[1]?.trim() || "",
    sugestoes_melhoria: sugestoesMatch?.[1]?.trim() || "",
    previsao_proxima_semana: previsaoMatch?.[1]?.trim() || "",
    relatorio_completo: relatorioMarkdown,
    metadata: { taxa_resposta: taxaResposta, total_responderam: totalResponderam },
  }).select("id").single();

  // Create notification
  await supabase.from("notificacoes").insert({
    user_id: userId,
    tipo: "relatorio_semanal",
    titulo: `Relatório Semanal disponível — ${weekStart} a ${weekEnd}`,
    descricao: resumo.slice(0, 200),
    link: "/relatorios",
    metadata: { relatorio_id: relatorio?.id },
  }).catch(() => {});

  return { relatorio_id: relatorio?.id, semana: `${weekStart} a ${weekEnd}` };
}
