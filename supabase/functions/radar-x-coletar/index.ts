import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Dispara um run do scraper de X (Apify) para os handles cadastrados como
// fontes tipo='x'. Assíncrono: registra webhook -> radar-x-webhook processa.
// Auth: X-Cron-Secret (cron) OU Bearer (usuário).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR = "apidojo~tweet-scraper"; // Tweet Scraper V2

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function dispararX() {
  const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");
  if (!APIFY_TOKEN) throw new Error("APIFY_TOKEN não configurado.");

  const { data: fontes } = await supabase
    .from("mercado_fontes")
    .select("url")
    .eq("ativo", true)
    .eq("tipo", "x");

  const handles = (fontes ?? [])
    .map((f: any) => String(f.url).replace(/^@/, "").trim())
    .filter(Boolean);

  if (handles.length === 0) {
    return { disparado: false, mensagem: "Nenhuma fonte do X ativa." };
  }

  // Webhook ad-hoc anexado NA CRIAÇÃO do run, via query param base64.
  // (Não existe endpoint POST /actor-runs/{id}/webhooks — é assim que a Apify espera.)
  const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/radar-x-webhook`;
  const webhooks = btoa(
    JSON.stringify([
      {
        eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED"],
        requestUrl: webhookUrl,
      },
    ])
  );

  // Dispara o run (sem aguardar) já com o webhook anexado
  const runRes = await fetch(
    `${APIFY_BASE}/acts/${ACTOR}/runs?token=${APIFY_TOKEN}&webhooks=${webhooks}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        twitterHandles: handles,
        maxItems: 120,
        sort: "Latest",
      }),
    }
  );
  const run = await runRes.json();
  if (!runRes.ok) {
    throw new Error(`Apify retornou ${runRes.status}: ${run?.error?.message ?? JSON.stringify(run).slice(0, 300)}`);
  }
  const runId = run?.data?.id;
  if (!runId) throw new Error(`Falha ao iniciar scraper de X: ${JSON.stringify(run).slice(0, 300)}`);

  return { disparado: true, apify_run_id: runId, handles: handles.length };
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
    const out = await dispararX();
    return new Response(JSON.stringify({ ok: true, ...out }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("radar-x-coletar erro:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
