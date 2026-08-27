import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callClaudeWithTool, MODEL_SONNET } from "../_shared/anthropic.ts";

// Análise estratégica dos anúncios (criativos, públicos, fadiga, CPC) via IA.
// Baixo volume (semanal/manual) => Claude Sonnet para qualidade do relatório.
// Auth: X-Cron-Secret (cron) OU Bearer (usuário).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

type Row = {
  data: string; nivel: string; ref_id: string; nome: string | null;
  gasto: number; impressoes: number; cliques: number; cpc: number; cpm: number;
  ctr: number; alcance: number; frequencia: number; leads: number; compras: number; valor_conversao: number;
};

function agregar(rows: Row[]) {
  const gasto = rows.reduce((s, r) => s + Number(r.gasto), 0);
  const impressoes = rows.reduce((s, r) => s + Number(r.impressoes), 0);
  const cliques = rows.reduce((s, r) => s + Number(r.cliques), 0);
  const leads = rows.reduce((s, r) => s + Number(r.leads), 0);
  const compras = rows.reduce((s, r) => s + Number(r.compras), 0);
  const valor = rows.reduce((s, r) => s + Number(r.valor_conversao), 0);
  return {
    gasto: round(gasto),
    impressoes,
    cliques,
    ctr: impressoes ? round((cliques / impressoes) * 100) : 0,
    cpc: cliques ? round(gasto / cliques) : 0,
    cpm: impressoes ? round((gasto / impressoes) * 1000) : 0,
    leads,
    custo_por_lead: leads ? round(gasto / leads) : 0,
    compras,
    valor_conversao: round(valor),
    roas: gasto ? round(valor / gasto) : 0,
  };
}

const TOOL = {
  name: "registrar_analise_ads",
  description: "Registra a análise estratégica dos anúncios da Vision AI.",
  input_schema: {
    type: "object",
    properties: {
      resumo: { type: "string", description: "2-3 frases com o ponto mais importante da semana." },
      relatorio_markdown: {
        type: "string",
        description: "Relatório completo em Markdown com seções: Visão Geral, Criativos (melhores/piores e fadiga), Públicos/Segmentação, Custos (CPC/CPM/custo por lead), Ações Recomendadas.",
      },
      insights: {
        type: "array",
        description: "Ações priorizadas. Vazio se não houver dado suficiente.",
        items: {
          type: "object",
          properties: {
            titulo: { type: "string" },
            detalhe: { type: "string" },
            prioridade: { type: "string", enum: ["baixa", "media", "alta", "critica"] },
          },
          required: ["titulo", "prioridade"],
        },
      },
    },
    required: ["resumo", "relatorio_markdown", "insights"],
  },
};

async function analisar(tipo: string) {
  // Analisa os últimos 180 dias; se não houver dado recente (campanhas antigas),
  // cai para todo o histórico disponível.
  const hoje = new Date();
  const ini180 = new Date(hoje.getTime() - 180 * 86400000).toISOString().split("T")[0];

  async function buscar(desde?: string) {
    let q = supabase.from("ads_metricas_diarias").select("*").order("data", { ascending: true });
    if (desde) q = q.gte("data", desde);
    const { data } = await q;
    return (data ?? []) as Row[];
  }

  let all = await buscar(ini180);
  if (all.filter((r) => r.nivel === "conta").length === 0) {
    all = await buscar(); // fallback: todo o histórico
  }

  const conta = all.filter((r) => r.nivel === "conta");
  const campanhas = all.filter((r) => r.nivel === "campanha");
  const anuncios = all.filter((r) => r.nivel === "anuncio");

  if (conta.length === 0) {
    throw new Error("Sem métricas sincronizadas. Rode o meta-ads-sync (ou Puxar histórico) primeiro.");
  }

  // Período real coberto pelos dados
  const datas = conta.map((r) => r.data).sort();
  const periodoInicio = datas[0];
  const periodoFim = datas[datas.length - 1];

  // Fadiga: CPC/CTR da 1ª metade vs 2ª metade do período (conta)
  const meio = Math.floor(conta.length / 2);
  const primeira = agregar(conta.slice(0, meio));
  const segunda = agregar(conta.slice(meio));

  // Por campanha
  const porCampanha: Record<string, Row[]> = {};
  for (const r of campanhas) (porCampanha[r.ref_id] ??= []).push(r);
  const campanhasResumo = Object.entries(porCampanha).map(([id, rs]) => ({
    campanha: rs[0]?.nome ?? id, ...agregar(rs),
  })).sort((a, b) => b.gasto - a.gasto).slice(0, 20);

  // Por anúncio (com título do criativo)
  const { data: criativos } = await supabase
    .from("ads_criativos")
    .select("ad_id, titulo, corpo, status");
  const critMap = new Map((criativos ?? []).map((c: any) => [c.ad_id, c]));
  const porAnuncio: Record<string, Row[]> = {};
  for (const r of anuncios) (porAnuncio[r.ref_id] ??= []).push(r);
  const anunciosResumo = Object.entries(porAnuncio).map(([id, rs]) => {
    const c: any = critMap.get(id);
    return {
      anuncio: rs[0]?.nome ?? id,
      titulo: c?.titulo ?? null,
      status: c?.status ?? null,
      ...agregar(rs),
    };
  }).sort((a, b) => b.gasto - a.gasto).slice(0, 25);

  const dados = {
    periodo: { inicio: periodoInicio, fim: periodoFim },
    total_periodo: agregar(conta),
    tendencia: { primeira_metade: primeira, segunda_metade: segunda },
    campanhas: campanhasResumo,
    anuncios: anunciosResumo,
  };

  const system =
    "Você é o gestor de tráfego sênior da Vision AI (agência de IA, founder solo). " +
    "Analise os dados de anúncios da Meta e produza uma análise ACIONÁVEL e direta, em português brasileiro. " +
    "Considere fadiga de criativo (CTR caindo / frequência alta / CPC subindo entre 1ª e 2ª metade), " +
    "quais criativos e campanhas dão o melhor custo por lead, e sugestões de público/segmentação. " +
    "Seja específico com números. Se faltar dado (ex: sem conversões/pixel), diga e foque em CPC/CTR/alcance.";

  const prompt =
    `Dados de performance (período ${periodoInicio} a ${periodoFim}):\n\`\`\`json\n` +
    JSON.stringify(dados, null, 2) +
    "\n```\nGere a análise chamando a ferramenta registrar_analise_ads.";

  const result = await callClaudeWithTool<{ resumo: string; relatorio_markdown: string; insights: any[] }>({
    model: MODEL_SONNET,
    tool: TOOL,
    system,
    content: [{ type: "text", text: prompt }],
    maxTokens: 8000,
  });

  const { data: inserted } = await supabase.from("ads_analises_ia").insert({
    tipo,
    periodo_inicio: dados.periodo.inicio,
    periodo_fim: dados.periodo.fim,
    resumo: result.resumo,
    conteudo: result.relatorio_markdown,
    insights: result.insights ?? [],
  }).select("id").single();

  // Notificação (best-effort) — user_id obrigatório: usa o dono canônico
  const { data: owner } = await supabase.rpc("owner_id");
  if (owner) {
    await supabase.from("notificacoes").insert({
      user_id: owner,
      tipo: "ads_analise",
      titulo: "Análise de anúncios disponível",
      descricao: (result.resumo ?? "").slice(0, 200),
      link: "/anuncios",
    }).catch(() => {});
  }

  return { analise_id: inserted?.id, insights: result.insights?.length ?? 0 };
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
    const tipo = body?.tipo === "semanal" ? "semanal" : "manual";
    const out = await analisar(tipo);
    return new Response(JSON.stringify({ ok: true, ...out }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("meta-ads-analise erro:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
