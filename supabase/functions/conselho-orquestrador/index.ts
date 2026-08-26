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

const TOOL = {
  name: "registrar_briefing",
  description: "Registra a síntese cruzada priorizada.",
  input_schema: {
    type: "object",
    properties: {
      resumo: { type: "string", description: "2-4 frases: o estado geral e o foco do período." },
      prioridades: {
        type: "array",
        description: "Top itens cross-setor, ordenados por impacto.",
        items: {
          type: "object",
          properties: {
            dominio: { type: "string" },
            titulo: { type: "string" },
            porque: { type: "string", description: "por que é prioridade agora" },
            prioridade: { type: "string", enum: ["baixa", "media", "alta", "critica"] },
          },
          required: ["titulo", "porque"],
        },
      },
      destaques: { type: "array", items: { type: "string" }, description: "padrões ou observações cruzadas entre setores" },
    },
    required: ["resumo", "prioridades"],
  },
};

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
  const force = body.force === true;
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  const { data: abertos } = await supabase
    .from("insights")
    .select("dominio, titulo, prioridade, detalhe, acao_sugerida, impacto_estimado")
    .in("status", ["nova", "em_andamento"])
    .order("gerado_em", { ascending: false })
    .limit(60);

  if (!abertos || abertos.length === 0) {
    return new Response(JSON.stringify({ ok: true, skipped: "sem insights abertos" }), { status: 200, headers: jsonHeaders });
  }

  // Cadência adaptativa: sinal alto → diário; senão só no domingo (semanal)
  const temSinalForte = abertos.some((i) => i.prioridade === "critica" || i.prioridade === "alta") || abertos.length >= 3;
  const domingo = new Date().getUTCDay() === 0;
  let cadencia = "diario";
  if (!force && !temSinalForte) {
    if (!domingo) {
      return new Response(JSON.stringify({ ok: true, skipped: "dia quieto — aguardando o semanal" }), { status: 200, headers: jsonHeaders });
    }
    cadencia = "semanal";
  }

  const { data: leis } = await supabase
    .from("licoes_aprendidas")
    .select("dominio, licao")
    .eq("status", "lei")
    .limit(30);

  const prompt = `Você é o chefe de gabinete do founder da Vision AI. Sintetize um brief ${cadencia} a partir dos insights abertos de todos os setores.

INSIGHTS ABERTOS (por setor):
${abertos.map((i) => `- [${i.dominio}/${i.prioridade}] ${i.titulo}${i.impacto_estimado ? " — " + i.impacto_estimado : ""}`).join("\n")}

LIÇÕES-LEI (padrões consolidados a respeitar):
${(leis ?? []).map((l: { dominio: string; licao: string }) => `- [${l.dominio}] ${l.licao}`).join("\n") || "(nenhuma)"}

Produza: um resumo curto do estado geral, as TOP prioridades cruzadas (o que atacar primeiro e por quê), e destaques (padrões entre setores). Priorize por impacto real. Seja direto.`;

  const res = await callClaudeWithTool<{ resumo: string; prioridades: any[]; destaques?: any[] }>({
    model: MODEL_SONNET,
    tool: TOOL,
    content: [{ type: "text", text: prompt }],
    maxTokens: 2000,
  });

  await supabase.from("briefings").insert({
    cadencia,
    resumo: res.resumo,
    prioridades: res.prioridades ?? [],
    destaques: res.destaques ?? [],
  });

  return new Response(JSON.stringify({ ok: true, cadencia, prioridades: (res.prioridades ?? []).length }), {
    status: 200, headers: jsonHeaders,
  });
});
