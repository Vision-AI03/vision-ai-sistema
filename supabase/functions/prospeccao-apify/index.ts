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

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

  try {
    // ── ETAPA ÚNICA: Google Maps via compass/crawler-google-places (assíncrono + webhook)
    // Fonte primária. Telefone, endereço, site, categoria, avaliação têm taxa de
    // preenchimento muito maior do que perfis de Instagram.
    const searchString = `${nicho} em ${cidade}`;

    // 1. Dispara o run sem aguardar (webhook avisa quando concluir)
    const mapsRes = await fetch(
      `${APIFY_BASE}/acts/compass~crawler-google-places/runs?token=${APIFY_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchStringsArray: [searchString],
          maxCrawledPlacesPerSearch: quantidade,
          languageCode: "pt",
          countryCode: "br",
        }),
      }
    );
    const mapsRun = await mapsRes.json();
    console.log("Apify Maps HTTP status:", mapsRes.status);
    console.log("Apify Maps response:", JSON.stringify(mapsRun).slice(0, 500));

    if (!mapsRes.ok) {
      const apifyErr = mapsRun?.error?.message || mapsRun?.error?.type || JSON.stringify(mapsRun);
      throw new Error(`Apify retornou ${mapsRes.status}: ${apifyErr}`);
    }

    const mapsRunId = mapsRun?.data?.id;
    if (!mapsRunId) {
      throw new Error(`Falha ao iniciar Google Maps Scraper: ${JSON.stringify(mapsRun).slice(0, 300)}`);
    }

    // 2. Registra webhook para finalização do run → prospeccao-webhook stage=maps
    const webhookUrl =
      `${SUPABASE_URL}/functions/v1/prospeccao-webhook` +
      `?stage=maps` +
      `&extracao_id=${encodeURIComponent(extracao_id)}` +
      `&cidade=${encodeURIComponent(cidade)}` +
      `&nicho=${encodeURIComponent(nicho)}` +
      `&quantidade=${quantidade}`;

    await fetch(
      `${APIFY_BASE}/actor-runs/${mapsRunId}/webhooks?token=${APIFY_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED"],
          requestUrl: webhookUrl,
        }),
      }
    );

    // 3. Rastreabilidade: salva o runId no registro de extração
    await supabase.from("extracoes").update({
      apify_run_id: mapsRunId,
    }).eq("id", extracao_id);

    return new Response(
      JSON.stringify({
        sucesso: true,
        apify_run_id: mapsRunId,
        mensagem: "Google Maps em processamento. Os leads aparecerão no CRM quando concluir.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("Erro:", err?.message);
    await supabase.from("extracoes").update({
      status: "erro",
      erro_mensagem: err?.message || "Erro desconhecido",
    }).eq("id", extracao_id);

    return new Response(JSON.stringify({ error: err?.message || "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
