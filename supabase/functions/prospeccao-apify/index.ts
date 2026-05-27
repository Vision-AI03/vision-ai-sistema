import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APIFY_BASE = "https://api.apify.com/v2";

function extrairUsernames(googleItems: any[]): string[] {
  const usernames: string[] = [];
  const blocked = ["p", "reel", "stories", "explore", "accounts", "about", "help"];
  for (const item of googleItems) {
    for (const result of (item?.organicResults || [])) {
      const url: string = result?.url || result?.link || "";
      const match = url.match(/instagram\.com\/([^/?#]+)/);
      const u = match?.[1]?.replace(/\/$/, "");
      if (u && !blocked.includes(u) && !usernames.includes(u)) {
        usernames.push(u);
      }
    }
  }
  return usernames;
}

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
    const termoBusca = `${nicho} ${cidade} site:instagram.com`;

    // ── ETAPA 1: Google Search síncrono (waitForFinish=80) ───────────────────
    // Sem webhooks. Apify espera até 80s e retorna o resultado direto.
    const googleRes = await fetch(
      `${APIFY_BASE}/acts/apify~google-search-scraper/runs?token=${APIFY_TOKEN}&waitForFinish=80`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queries: termoBusca,
          resultsPerPage: Math.min(quantidade * 3, 100),
          maxPagesPerQuery: 1,
          languageCode: "pt",
          countryCode: "BR",
        }),
      }
    );

    const googleRun = await googleRes.json();
    console.log("Google run status:", googleRun?.data?.status, "dataset:", googleRun?.data?.defaultDatasetId);

    const googleStatus = googleRun?.data?.status;
    const googleDatasetId = googleRun?.data?.defaultDatasetId;

    if (googleStatus !== "SUCCEEDED" || !googleDatasetId) {
      throw new Error(
        `Google Search não completou a tempo (status: ${googleStatus ?? "sem resposta"}). Tente novamente.`
      );
    }

    // ── ETAPA 2: Busca resultados e extrai usernames ─────────────────────────
    const itemsRes = await fetch(
      `${APIFY_BASE}/datasets/${googleDatasetId}/items?token=${APIFY_TOKEN}&limit=200`
    );
    const googleItems = await itemsRes.json();
    const usernames = extrairUsernames(Array.isArray(googleItems) ? googleItems : []);
    console.log(`Usernames extraídos: ${usernames.length}`);

    if (usernames.length === 0) {
      throw new Error("Nenhum perfil Instagram encontrado para essa busca. Tente outro nicho ou cidade.");
    }

    const usernamesToScrape = usernames.slice(0, Math.min(quantidade * 2, 50));

    // ── ETAPA 3: Inicia Instagram Scraper assíncrono (sem webhook) ───────────
    // Retorna imediatamente com o runId. O cliente vai checar via prospeccao-check.
    const igRes = await fetch(
      `${APIFY_BASE}/acts/apify~instagram-profile-scraper/runs?token=${APIFY_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: usernamesToScrape }),
      }
    );
    const igRun = await igRes.json();
    const igRunId = igRun?.data?.id;
    console.log("Instagram run id:", igRunId);

    if (!igRunId) {
      throw new Error(`Falha ao iniciar Instagram Scraper: ${JSON.stringify(igRun)}`);
    }

    // Salva o Instagram run ID para o cliente poder checar depois
    await supabase.from("extracoes").update({
      apify_run_id: igRunId,
    }).eq("id", extracao_id);

    return new Response(
      JSON.stringify({
        sucesso: true,
        ig_run_id: igRunId,
        perfis_encontrados: usernames.length,
        mensagem: "Google concluído. Instagram em processamento.",
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
