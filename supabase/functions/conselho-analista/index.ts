import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callClaudeWithTool, MODEL_SONNET } from "../_shared/anthropic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-cron-secret",
};
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

type DomainCfg = { rpc: string; persona: string; foco: string };

// Registro de setores. Adicionar um setor = 1 agregador SQL + 1 entrada aqui.
const REGISTRO: Record<string, DomainCfg> = {
  financeiro: {
    rpc: "agregar_financeiro",
    persona: "o CFO da Vision AI (agência de IA, founder solo)",
    foco: "fluxo de caixa, cobrança de inadimplência, MRR e margem, custos que renovam, ticket médio. Priorize dinheiro parado (parcelas vencidas) e riscos de margem.",
  },
  prospeccao: {
    rpc: "agregar_prospeccao",
    persona: "o Head de Growth da Vision AI",
    foco: "volume e qualidade das extrações (Apify), nichos e cidades que mais rendem, extrações com erro, e leads extraídos que ainda não foram enriquecidos. Priorize destravar o funil de entrada.",
  },
  abordagens: {
    rpc: "agregar_abordagens",
    persona: "um closer sênior de vendas B2B",
    foco: "taxa de resposta das abordagens no WhatsApp, o que está convertendo vs. sendo ignorado, e uso das lições de outreach. Priorize melhorar a mensagem e o follow-up.",
  },
  crm: {
    rpc: "agregar_crm",
    persona: "o gerente de vendas da Vision AI",
    foco: "leads parados no funil, priorização por score, quem respondeu e não teve follow-up, e leads sem contato. Priorize mover o funil e não deixar lead quente esfriar.",
  },
  contratos: {
    rpc: "agregar_contratos",
    persona: "o gestor de contratos e sucesso do cliente",
    foco: "renovações próximas, contratos travados por status, churn e saúde da recorrência (MRR). Priorize proteger a receita recorrente.",
  },
  tarefas: {
    rpc: "agregar_tarefas",
    persona: "o chefe de operações",
    foco: "tarefas vencidas, prioridades acumuladas e gargalos de execução. Priorize o que está atrasado e bloqueando resultado.",
  },
};

const TOOL = {
  name: "registrar_analise_setor",
  description: "Registra recomendações acionáveis e lições duráveis do setor.",
  input_schema: {
    type: "object",
    properties: {
      insights: {
        type: "array",
        description: "Recomendações acionáveis, priorizadas. VAZIO se não houver dado suficiente.",
        items: {
          type: "object",
          properties: {
            titulo: { type: "string", description: "curto e direto" },
            detalhe: { type: "string" },
            prioridade: { type: "string", enum: ["baixa", "media", "alta", "critica"] },
            acao_sugerida: { type: "string", description: "o próximo passo concreto" },
            impacto_estimado: { type: "string", description: "com números do snapshot" },
          },
          required: ["titulo", "prioridade"],
        },
      },
      licoes_novas: {
        type: "array",
        description: "Padrões duráveis aprendidos (opcional).",
        items: {
          type: "object",
          properties: { contexto: { type: "string" }, licao: { type: "string" } },
          required: ["contexto", "licao"],
        },
      },
    },
    required: ["insights"],
  },
};

async function analisarDominio(dominio: string, cfg: DomainCfg): Promise<number> {
  const { data: snapshot } = await supabase.rpc(cfg.rpc);
  const { data: licoes } = await supabase
    .from("licoes_aprendidas")
    .select("licao, status")
    .eq("dominio", dominio)
    .in("status", ["ativa", "lei"]);

  const prompt = `Você é ${cfg.persona}. Analise o snapshot ATUAL do setor "${dominio}" e gere recomendações acionáveis.

FOCO: ${cfg.foco}

LIÇÕES JÁ REGISTRADAS (não repita como insight; se um padrão reaparecer, registre em licoes_novas com o mesmo texto):
${(licoes ?? []).map((l: { status: string; licao: string }) => `- [${l.status}] ${l.licao}`).join("\n") || "(nenhuma)"}

SNAPSHOT (dados reais — use APENAS estes números, nunca invente):
${JSON.stringify(snapshot, null, 2)}

REGRAS:
- Gere insights SÓ quando houver dado que justifique. Se o snapshot estiver vazio ou sem nada relevante, retorne insights = [].
- Cada insight: título curto, ação concreta, prioridade honesta (critica = dinheiro/risco imediato), impacto com números do snapshot.
- Você recomenda; o humano decide e executa. Nunca proponha ação automática irreversível.`;

  const res = await callClaudeWithTool<{ insights?: any[]; licoes_novas?: any[] }>({
    model: MODEL_SONNET,
    tool: TOOL,
    content: [{ type: "text", text: prompt }],
    maxTokens: 2000,
  });

  // substitui os insights 'nova' anteriores deste domínio (mantém os que você acionou)
  await supabase
    .from("insights")
    .update({ status: "substituida", atualizado_em: new Date().toISOString() })
    .eq("dominio", dominio)
    .eq("status", "nova");

  const rows = (res.insights ?? []).map((i) => ({
    dominio,
    titulo: i.titulo,
    detalhe: i.detalhe ?? null,
    prioridade: i.prioridade ?? "media",
    acao_sugerida: i.acao_sugerida ?? null,
    impacto_estimado: i.impacto_estimado ?? null,
    gerado_por: `analista-${dominio}`,
  }));
  if (rows.length) await supabase.from("insights").insert(rows);

  for (const l of res.licoes_novas ?? []) {
    await supabase.rpc("registrar_licao", {
      p_dominio: dominio,
      p_contexto: l.contexto ?? "",
      p_licao: l.licao,
      p_evidencia: "conselho",
    });
  }
  return rows.length;
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

  const body = await req.json().catch(() => ({}));
  const dominios: string[] = body.dominio ? [body.dominio] : Object.keys(REGISTRO);
  const out: Record<string, number> = {};
  for (const d of dominios) {
    const cfg = REGISTRO[d];
    if (!cfg) continue;
    try {
      out[d] = await analisarDominio(d, cfg);
    } catch (e) {
      console.error("analista erro", d, e);
      out[d] = -1;
    }
  }

  return new Response(JSON.stringify({ ok: true, insights_por_dominio: out }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
