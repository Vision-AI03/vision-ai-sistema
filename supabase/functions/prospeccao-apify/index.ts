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
    const digits = raw.startsWith("55") && raw.length > 11 ? raw : `55${raw}`;
    return digits;
  }
  return null;
}

function extrairEmail(texto: string): string | null {
  if (!texto) return null;
  const match = texto.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

async function aguardarRunApify(runId: string, apifyToken: string, timeoutMs = 120000): Promise<any> {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    const res = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${apifyToken}`);
    const data = await res.json();
    const status = data?.data?.status;
    if (status === "SUCCEEDED") return data.data;
    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      throw new Error(`Apify run falhou com status: ${status}`);
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error("Timeout aguardando Apify");
}

async function buscarDataset(datasetId: string, apifyToken: string): Promise<any[]> {
  const res = await fetch(
    `${APIFY_BASE}/datasets/${datasetId}/items?token=${apifyToken}&limit=200`
  );
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");
  if (!APIFY_TOKEN) {
    return new Response(JSON.stringify({ error: "APIFY_TOKEN não configurado nas secrets" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { cidade, nicho, quantidade, extracao_id } = await req.json();
  if (!cidade || !nicho || !quantidade || !extracao_id) {
    return new Response(JSON.stringify({ error: "cidade, nicho, quantidade e extracao_id são obrigatórios" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // ─── ETAPA 1: Google Search → encontrar perfis Instagram ───────────────
    const termoBusca = `${nicho} ${cidade} site:instagram.com`;
    const googleRunRes = await fetch(
      `${APIFY_BASE}/acts/apify~google-search-scraper/runs?token=${APIFY_TOKEN}`,
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
    const googleRun = await googleRunRes.json();
    const googleRunId = googleRun?.data?.id;
    if (!googleRunId) throw new Error("Falha ao iniciar Google Search no Apify");

    const googleRunData = await aguardarRunApify(googleRunId, APIFY_TOKEN);
    const googleItems = await buscarDataset(googleRunData.defaultDatasetId, APIFY_TOKEN);

    const instagramUsernames: string[] = [];
    for (const item of googleItems) {
      const organicResults = item?.organicResults || [];
      for (const result of organicResults) {
        const url: string = result?.url || result?.link || "";
        const match = url.match(/instagram\.com\/([^/?#]+)/);
        if (match && match[1] && !["p", "reel", "stories", "explore"].includes(match[1])) {
          const username = match[1].replace(/\/$/, "");
          if (username && !instagramUsernames.includes(username)) {
            instagramUsernames.push(username);
          }
        }
      }
    }

    if (instagramUsernames.length === 0) {
      await supabase.from("extracoes").update({
        status: "erro",
        erro_mensagem: "Nenhum perfil Instagram encontrado para essa busca",
      }).eq("id", extracao_id);

      return new Response(JSON.stringify({ error: "Nenhum perfil encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const usernamesToScrape = instagramUsernames.slice(0, Math.min(quantidade * 2, 50));

    // ─── ETAPA 2: Instagram Profile Scraper → extrair dados das bios ───────
    const igRunRes = await fetch(
      `${APIFY_BASE}/acts/apify~instagram-profile-scraper/runs?token=${APIFY_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usernames: usernamesToScrape,
        }),
      }
    );
    const igRun = await igRunRes.json();
    const igRunId = igRun?.data?.id;
    if (!igRunId) throw new Error("Falha ao iniciar Instagram Scraper no Apify");

    const igRunData = await aguardarRunApify(igRunId, APIFY_TOKEN, 180000);
    const igProfiles = await buscarDataset(igRunData.defaultDatasetId, APIFY_TOKEN);

    // ─── ETAPA 3: Processar perfis e inserir leads ──────────────────────────
    const leadsInseridos: string[] = [];
    let count = 0;

    for (const profile of igProfiles) {
      if (count >= quantidade) break;

      const bio: string = profile?.biography || profile?.bio || "";
      const telefone = extrairTelefone(bio) ||
        extrairTelefone(profile?.businessPhoneNumber || "") ||
        extrairTelefone(profile?.publicPhoneNumber || "");

      if (!telefone) continue;

      const email = extrairEmail(bio) ||
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
          segmento: nicho,
          origem: "instagram_scraping",
          estagio_fonte: "automatico",
          status: "novo",
          origem_metadata: {
            cidade,
            nicho,
            termo_busca: termoBusca,
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

    await supabase.from("extracoes").update({
      status: "concluido",
      quantidade_extraida: leadsInseridos.length,
      leads_ids: leadsInseridos,
      apify_run_id: igRunId,
    }).eq("id", extracao_id);

    return new Response(
      JSON.stringify({
        sucesso: true,
        leads_extraidos: leadsInseridos.length,
        perfis_encontrados: instagramUsernames.length,
        perfis_com_whatsapp: leadsInseridos.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    await supabase.from("extracoes").update({
      status: "erro",
      erro_mensagem: err?.message || "Erro desconhecido",
    }).eq("id", extracao_id);

    return new Response(JSON.stringify({ error: err?.message || "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
