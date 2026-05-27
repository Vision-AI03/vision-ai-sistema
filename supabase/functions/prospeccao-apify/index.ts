import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APIFY_BASE = "https://api.apify.com/v2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");
  if (!APIFY_TOKEN) {
    return new Response(JSON.stringify({ error: "APIFY_TOKEN não configurado" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { cidade, nicho, quantidade, extracao_id } = await req.json();
  if (!cidade || !nicho || !quantidade || !extracao_id) {
    return new Response(JSON.stringify({ error: "Parâmetros obrigatórios faltando" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const termoBusca = `${nicho} ${cidade} site:instagram.com`;

    // Metadados passados como query params na URL do webhook — evita JSON aninhado corrompido
    const webhookUrl =
      `${SUPABASE_URL}/functions/v1/prospeccao-webhook` +
      `?stage=google` +
      `&extracao_id=${encodeURIComponent(extracao_id)}` +
      `&cidade=${encodeURIComponent(cidade)}` +
      `&nicho=${encodeURIComponent(nicho)}` +
      `&quantidade=${quantidade}`;

    // payloadTemplate simples — só variáveis do Apify, sem JSON aninhado
    const payloadTemplate = `{"eventType":"{{eventType}}","runId":"{{runId}}","datasetId":"{{defaultDatasetId}}"}`;

    const webhooks = JSON.stringify([{
      eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED"],
      requestUrl: webhookUrl,
      payloadTemplate,
    }]);

    const googleUrl =
      `${APIFY_BASE}/acts/apify~google-search-scraper/runs` +
      `?token=${APIFY_TOKEN}` +
      `&webhooks=${encodeURIComponent(webhooks)}`;

    const googleRunRes = await fetch(googleUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queries: [termoBusca],
        resultsPerPage: Math.min(quantidade * 3, 100),
        maxPagesPerQuery: 1,
        languageCode: "pt",
        countryCode: "BR",
      }),
    });

    const googleRun = await googleRunRes.json();
    console.log("Apify Google Search response:", JSON.stringify(googleRun));

    const googleRunId = googleRun?.data?.id;
    if (!googleRunId) {
      throw new Error(`Falha ao iniciar Google Search: ${JSON.stringify(googleRun)}`);
    }

    await supabase.from("extracoes").update({
      apify_run_id: googleRunId,
    }).eq("id", extracao_id);

    return new Response(
      JSON.stringify({
        sucesso: true,
        google_run_id: googleRunId,
        mensagem: "Extração iniciada! Os leads aparecerão no CRM em alguns minutos.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("Erro na extração:", err?.message);
    await supabase.from("extracoes").update({
      status: "erro",
      erro_mensagem: err?.message || "Erro desconhecido",
    }).eq("id", extracao_id);

    return new Response(JSON.stringify({ error: err?.message || "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
