import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APIFY_BASE = "https://api.apify.com/v2";

function extrairTelefone(texto: string): string | null {
  if (!texto) return null;
  const matches = texto.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\s?)?\d{4}[-.\s]?\d{4}/g);
  if (!matches) return null;
  const raw = matches[0].replace(/\D/g, "");
  if (raw.length >= 10 && raw.length <= 13) {
    return raw.startsWith("55") && raw.length > 11 ? raw : `55${raw}`;
  }
  return null;
}

function extrairEmail(texto: string): string | null {
  if (!texto) return null;
  const match = texto.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
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

  const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN")!;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { extracao_id } = await req.json();
  if (!extracao_id) {
    return new Response(JSON.stringify({ error: "extracao_id obrigatório" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Busca o registro da extração
  const { data: extracao, error: extErr } = await supabase
    .from("extracoes")
    .select("*")
    .eq("id", extracao_id)
    .single();

  if (extErr || !extracao) {
    return new Response(JSON.stringify({ error: "Extração não encontrada" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Se já terminou ou ainda não tem run_id do Instagram, retorna o status atual
  if (extracao.status !== "processando" || !extracao.apify_run_id) {
    return new Response(
      JSON.stringify({ status: extracao.status, aguardando: !extracao.apify_run_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Checa o status do Instagram run no Apify
  const runRes = await fetch(
    `${APIFY_BASE}/actor-runs/${extracao.apify_run_id}?token=${APIFY_TOKEN}`
  );
  const runData = await runRes.json();
  const runStatus: string = runData?.data?.status ?? "UNKNOWN";
  console.log(`extracao_id=${extracao_id} ig_run_status=${runStatus}`);

  if (runStatus === "RUNNING" || runStatus === "READY" || runStatus === "CREATED") {
    return new Response(
      JSON.stringify({ status: "processando", apify_status: runStatus }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (runStatus === "FAILED" || runStatus === "ABORTED" || runStatus === "TIMED-OUT") {
    await supabase.from("extracoes").update({
      status: "erro",
      erro_mensagem: `Instagram Scraper encerrou com status: ${runStatus}`,
    }).eq("id", extracao_id);
    return new Response(
      JSON.stringify({ status: "erro", apify_status: runStatus }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (runStatus !== "SUCCEEDED") {
    return new Response(
      JSON.stringify({ status: "processando", apify_status: runStatus }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── SUCCEEDED: baixa dataset e insere leads ──────────────────────────────
  const datasetId: string = runData?.data?.defaultDatasetId;
  if (!datasetId) {
    await supabase.from("extracoes").update({
      status: "erro",
      erro_mensagem: "Dataset do Instagram Scraper não encontrado",
    }).eq("id", extracao_id);
    return new Response(JSON.stringify({ status: "erro" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const profilesRes = await fetch(
    `${APIFY_BASE}/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=200`
  );
  const profiles = await profilesRes.json();
  const igProfiles: any[] = Array.isArray(profiles) ? profiles : [];

  const leadsInseridos: string[] = [];
  let count = 0;
  const quantidade: number = extracao.quantidade_solicitada;

  for (const profile of igProfiles) {
    if (count >= quantidade) break;

    const bio: string = profile?.biography || profile?.bio || "";
    const telefone =
      extrairTelefone(bio) ||
      extrairTelefone(profile?.businessPhoneNumber || "") ||
      extrairTelefone(profile?.publicPhoneNumber || "");

    if (!telefone) continue;

    const email =
      extrairEmail(bio) ||
      profile?.businessEmail ||
      profile?.publicEmail ||
      null;

    const nome = profile?.fullName || profile?.username || "Sem nome";
    const instagram_url = `https://instagram.com/${profile?.username || ""}`;
    const site = profile?.externalUrl || profile?.websiteUrl || null;

    const { data: existente } = await supabase
      .from("leads")
      .select("id")
      .eq("telefone", telefone)
      .maybeSingle();

    if (existente) continue;

    const { data: novoLead, error: insertError } = await supabase
      .from("leads")
      .insert({
        nome,
        empresa: nome,
        email,
        telefone,
        instagram_url,
        site_empresa: site,
        segmento: extracao.nicho,
        origem: "instagram_scraping",
        estagio_fonte: "automatico",
        status: "novo",
        origem_metadata: {
          cidade: extracao.cidade,
          nicho: extracao.nicho,
          username: profile?.username,
          followers: profile?.followersCount,
          extracao_id,
        },
      })
      .select("id")
      .single();

    if (!insertError && novoLead) {
      leadsInseridos.push(novoLead.id);
      count++;
    }
  }

  console.log(`Leads inseridos: ${leadsInseridos.length}`);

  await supabase.from("extracoes").update({
    status: "concluido",
    quantidade_extraida: leadsInseridos.length,
    leads_ids: leadsInseridos,
  }).eq("id", extracao_id);

  return new Response(
    JSON.stringify({ status: "concluido", leads_inseridos: leadsInseridos.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
