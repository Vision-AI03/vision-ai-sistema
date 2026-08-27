import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callClaude, MODEL_SONNET } from "../_shared/anthropic.ts";

// Gera o briefing de mercado (diário ou semanal) a partir dos itens curados.
// Relatório final = Claude (qualidade). Auth: X-Cron-Secret OU Bearer.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function gerar(cadencia: "diario" | "semanal") {
  const horas = cadencia === "semanal" ? 24 * 7 : 24;
  const desde = new Date(Date.now() - horas * 3600_000);

  const { data: itens } = await supabase
    .from("mercado_itens")
    .select("titulo, resumo, url, categoria, relevancia, fonte_nome, publicado_em")
    .eq("status", "curado")
    .gte("coletado_em", desde.toISOString())
    .order("relevancia", { ascending: false })
    .limit(60);

  const lista = itens ?? [];
  if (lista.length === 0) {
    throw new Error(`Sem itens curados nas últimas ${horas}h. Rode "Coletar agora" primeiro.`);
  }

  const janela = cadencia === "semanal" ? "última semana" : "últimas 24 horas";
  const system =
    "Você é o analista de inteligência de mercado de IA da Vision AI (agência de IA no Brasil, founder solo). " +
    "Escreva um briefing DIRETO e sem hype, em português brasileiro, focado no que muda o jogo para quem constrói " +
    "soluções de IA para PMEs (transportadoras, clínicas, imobiliárias, contabilidades). " +
    "Priorize novas ferramentas/modelos que dá pra USAR ou VENDER, e ignore trivialidades.";

  const prompt =
    `Itens curados da ${janela} (JSON):\n\`\`\`json\n${JSON.stringify(lista)}\n\`\`\`\n\n` +
    "Gere um briefing em Markdown com estas seções (omita seção vazia):\n" +
    "## 🔦 Destaques (3-5 itens mais importantes, com 1 linha de porquê importa)\n" +
    "## 🛠️ Novas Ferramentas & Features\n" +
    "## 🧠 Modelos & Pesquisa\n" +
    "## 💼 Negócios & Mercado\n" +
    "## 🎯 O que a Vision AI deveria testar/observar (2-3 ações práticas)\n\n" +
    "Para cada item, cite a fonte e inclua o link em markdown. Seja conciso. Responda APENAS com o Markdown.";

  const markdown = await callClaude({
    model: MODEL_SONNET,
    system,
    prompt,
    maxTokens: 4000,
  });

  const resumoMatch = markdown.match(/## 🔦 Destaques\s*([\s\S]*?)(?=\n##|$)/);
  const resumo = (resumoMatch?.[1] ?? markdown.slice(0, 400)).trim().slice(0, 500);

  const { data: rel } = await supabase.from("mercado_relatorios").insert({
    cadencia,
    periodo_inicio: desde.toISOString(),
    periodo_fim: new Date().toISOString(),
    resumo,
    conteudo: markdown,
  }).select("id").single();

  // Notificação (user_id obrigatório -> dono canônico)
  const { data: owner } = await supabase.rpc("owner_id");
  if (owner) {
    await supabase.from("notificacoes").insert({
      user_id: owner,
      tipo: "radar_mercado",
      titulo: `Radar de Mercado — briefing ${cadencia}`,
      descricao: resumo.slice(0, 200),
      link: "/radar",
    }).catch(() => {});
  }

  return { relatorio_id: rel?.id, itens: lista.length, cadencia };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronSecret = req.headers.get("X-Cron-Secret");
  const auth = req.headers.get("Authorization");
  const cronOk = Deno.env.get("CRON_SECRET") && cronSecret === Deno.env.get("CRON_SECRET");
  if (!cronOk && !auth?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const cadencia = body?.cadencia === "semanal" ? "semanal" : "diario";
    const out = await gerar(cadencia);
    return new Response(JSON.stringify({ ok: true, ...out }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("radar-relatorio erro:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
