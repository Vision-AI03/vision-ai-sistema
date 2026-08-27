import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Sincroniza dados de anúncios da Meta (Marketing API) para o banco.
// Auth: X-Cron-Secret (cron) OU Bearer (usuário logado no app).
// Secrets: META_ADS_TOKEN, META_AD_ACCOUNT_ID (act_...), CRON_SECRET.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-cron-secret",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const GRAPH = "https://graph.facebook.com/v21.0";
const TOKEN = Deno.env.get("META_ADS_TOKEN") ?? "";
const ACCOUNT = Deno.env.get("META_AD_ACCOUNT_ID") ?? ""; // act_XXXXXXXXX

// Busca paginada na Graph API — agrega `data` de até maxPages páginas.
async function graphAll(path: string, params: Record<string, string>, maxPages = 15): Promise<any[]> {
  const usp = new URLSearchParams({ ...params, access_token: TOKEN });
  let url = `${GRAPH}/${path}?${usp.toString()}`;
  const out: any[] = [];
  for (let i = 0; i < maxPages && url; i++) {
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok) {
      throw new Error(`Graph API ${path}: ${JSON.stringify(json?.error ?? json)}`);
    }
    if (Array.isArray(json.data)) out.push(...json.data);
    url = json?.paging?.next ?? "";
  }
  return out;
}

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

// Extrai contagem de um action_type dentro do array `actions` do insight.
function actionCount(actions: any[] | undefined, types: string[]): number {
  if (!Array.isArray(actions)) return 0;
  return actions
    .filter((a) => types.includes(a.action_type))
    .reduce((s, a) => s + num(a.value), 0);
}

const LEAD_TYPES = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "leadgen_grouped"];
const PURCHASE_TYPES = ["purchase", "offsite_conversion.fb_pixel_purchase", "onsite_conversion.purchase"];

const INSIGHT_FIELDS = "spend,impressions,clicks,cpc,cpm,ctr,reach,frequency,actions,action_values,date_start";

// Mapeia uma linha de insight -> registro de métrica diária.
function mapInsight(row: any, nivel: string, refId: string, nome: string) {
  return {
    data: row.date_start,
    nivel,
    ref_id: refId,
    nome,
    gasto: num(row.spend),
    impressoes: Math.round(num(row.impressions)),
    cliques: Math.round(num(row.clicks)),
    cpc: num(row.cpc),
    cpm: num(row.cpm),
    ctr: num(row.ctr),
    alcance: Math.round(num(row.reach)),
    frequencia: num(row.frequency),
    leads: actionCount(row.actions, LEAD_TYPES),
    compras: actionCount(row.actions, PURCHASE_TYPES),
    valor_conversao: actionCount(row.action_values, PURCHASE_TYPES),
  };
}

async function sincronizar() {
  if (!TOKEN || !ACCOUNT) {
    throw new Error("META_ADS_TOKEN ou META_AD_ACCOUNT_ID não configurados nos secrets.");
  }

  const resumo = { campanhas: 0, criativos: 0, metricas: 0 };

  // 1) Campanhas
  const campanhas = await graphAll(`${ACCOUNT}/campaigns`, {
    fields: "id,name,objective,status,daily_budget",
    limit: "200",
  });
  if (campanhas.length) {
    const rows = campanhas.map((c) => ({
      campaign_id: c.id,
      nome: c.name ?? null,
      objetivo: c.objective ?? null,
      status: c.status ?? null,
      verba_diaria: c.daily_budget ? num(c.daily_budget) / 100 : null,
      atualizado_em: new Date().toISOString(),
    }));
    const { error } = await supabase.from("ads_campanhas").upsert(rows, { onConflict: "campaign_id" });
    if (error) throw new Error(`upsert campanhas: ${error.message}`);
    resumo.campanhas = rows.length;
  }

  // 2) Criativos (nível anúncio)
  const ads = await graphAll(`${ACCOUNT}/ads`, {
    fields: "id,name,status,campaign_id,creative{title,body,thumbnail_url}",
    limit: "500",
  });
  if (ads.length) {
    const rows = ads.map((a) => ({
      ad_id: a.id,
      campaign_id: a.campaign_id ?? null,
      nome: a.name ?? null,
      titulo: a.creative?.title ?? null,
      corpo: a.creative?.body ?? null,
      thumbnail_url: a.creative?.thumbnail_url ?? null,
      status: a.status ?? null,
      atualizado_em: new Date().toISOString(),
    }));
    const { error } = await supabase.from("ads_criativos").upsert(rows, { onConflict: "ad_id" });
    if (error) throw new Error(`upsert criativos: ${error.message}`);
    resumo.criativos = rows.length;
  }

  // 3) Métricas diárias — conta (30d), campanha (30d), anúncio (14d)
  const metricas: any[] = [];

  const conta = await graphAll(`${ACCOUNT}/insights`, {
    fields: INSIGHT_FIELDS, time_increment: "1", date_preset: "last_30d",
  });
  for (const r of conta) metricas.push(mapInsight(r, "conta", ACCOUNT, "Conta"));

  const porCampanha = await graphAll(`${ACCOUNT}/insights`, {
    level: "campaign",
    fields: `${INSIGHT_FIELDS},campaign_id,campaign_name`,
    time_increment: "1", date_preset: "last_30d",
  });
  for (const r of porCampanha) metricas.push(mapInsight(r, "campanha", r.campaign_id, r.campaign_name));

  const porAnuncio = await graphAll(`${ACCOUNT}/insights`, {
    level: "ad",
    fields: `${INSIGHT_FIELDS},ad_id,ad_name`,
    time_increment: "1", date_preset: "last_14d",
  });
  for (const r of porAnuncio) metricas.push(mapInsight(r, "anuncio", r.ad_id, r.ad_name));

  // upsert em lotes de 500
  for (let i = 0; i < metricas.length; i += 500) {
    const lote = metricas.slice(i, i + 500);
    const { error } = await supabase
      .from("ads_metricas_diarias")
      .upsert(lote, { onConflict: "data,nivel,ref_id" });
    if (error) throw new Error(`upsert metricas: ${error.message}`);
  }
  resumo.metricas = metricas.length;

  return resumo;
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
    const resumo = await sincronizar();
    return new Response(JSON.stringify({ ok: true, ...resumo }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("meta-ads-sync erro:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
