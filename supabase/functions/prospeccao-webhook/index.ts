import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

async function buscarDataset(datasetId: string, apifyToken: string): Promise<any[]> {
  const res = await fetch(`${APIFY_BASE}/datasets/${datasetId}/items?token=${apifyToken}&limit=200`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200 });
  }

  const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN")!;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Metadados chegam via query params
  const url = new URL(req.url);
  const stage = url.searchParams.get("stage") || "";
  const extracao_id = url.searchParams.get("extracao_id") || "";
  const cidade = url.searchParams.get("cidade") || "";
  const nicho = url.searchParams.get("nicho") || "";
  const quantidade = parseInt(url.searchParams.get("quantidade") || "0");

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  // Apify envia o payload padrão — datasetId está em resource.defaultDatasetId
  const eventType: string = payload?.eventType || "";
  const datasetId: string = payload?.resource?.defaultDatasetId || payload?.datasetId || "";

  console.log(`Webhook: stage=${stage}, eventType=${eventType}, extracao_id=${extracao_id}, datasetId=${datasetId}`);

  if (eventType.includes("FAILED")) {
    await supabase.from("extracoes").update({
      status: "erro",
      erro_mensagem: `Apify run falhou na etapa: ${stage}`,
    }).eq("id", extracao_id);
    return new Response("ok", { status: 200 });
  }

  if (!datasetId) {
    console.error("datasetId ausente no payload:", JSON.stringify(payload));
    return new Response("datasetId missing", { status: 400 });
  }

  // ─── ETAPA MAPS (fluxo primário) ────────────────────────────────────────
  // Recebe dataset do compass/crawler-google-places, processa cada place
  // e insere leads tolerando dados incompletos. Registra motivos de descarte
  // em extracoes.motivo_descartes para a UI mostrar o que aconteceu.
  if (stage === "maps") {
    const places = await buscarDataset(datasetId, APIFY_TOKEN);
    const motivos: Record<string, number> = { sem_contato: 0, duplicado: 0 };
    const leadsInseridos: string[] = [];

    for (const place of places) {
      const nome: string = place?.title || place?.name || "Sem nome";
      const telefone = extrairTelefone(place?.phone || place?.phoneNumber || "");
      const site: string | null = place?.website || place?.websiteUrl || null;
      const emailRaw: string | null =
        (Array.isArray(place?.emails) && place.emails[0]) ||
        extrairEmail(place?.description || "") ||
        null;
      const endereco: string | null = place?.address || null;
      const categoria: string | null = place?.categoryName || null;
      const avaliacao: number | null = typeof place?.totalScore === "number" ? place.totalScore : null;

      // Política: precisa de ao menos um canal de contato (telefone, site ou email).
      // Sem nenhum, não há como abordar — descarta com motivo registrado.
      if (!telefone && !site && !emailRaw) {
        motivos.sem_contato++;
        continue;
      }

      // Dedupe: telefone tem prioridade; sem telefone, dedupe por site.
      let existente: { id: string } | null = null;
      if (telefone) {
        const r = await supabase
          .from("leads")
          .select("id")
          .eq("telefone", telefone)
          .maybeSingle();
        existente = r.data ?? null;
      }
      if (!existente && site) {
        const r = await supabase
          .from("leads")
          .select("id")
          .eq("site_empresa", site)
          .maybeSingle();
        existente = r.data ?? null;
      }
      if (existente) {
        motivos.duplicado++;
        continue;
      }

      // dados_incompletos = sem telefone OU sem email (sinaliza enriquecimento futuro)
      const dados_incompletos = !telefone || !emailRaw;

      const { data: novoLead, error: insertError } = await supabase
        .from("leads")
        .insert({
          nome,
          empresa: nome,
          email: emailRaw,
          telefone,
          site_empresa: site,
          segmento: nicho,
          origem: "google_maps_scraping",
          estagio_fonte: "automatico",
          status: "novo",
          dados_incompletos,
          origem_metadata: {
            cidade,
            nicho,
            endereco,
            categoria,
            avaliacao,
            extracao_id,
            place_id: place?.placeId,
            maps_url: place?.url,
          },
        })
        .select("id")
        .single();

      if (!insertError && novoLead) {
        leadsInseridos.push(novoLead.id);
      } else if (insertError) {
        console.error("Insert error:", insertError.message);
      }
    }

    const quantidadeDescartada = motivos.sem_contato + motivos.duplicado;
    console.log(`Maps: ${leadsInseridos.length} inseridos, ${quantidadeDescartada} descartados`, motivos);

    await supabase.from("extracoes").update({
      status: "concluido",
      quantidade_extraida: leadsInseridos.length,
      quantidade_descartada: quantidadeDescartada,
      motivo_descartes: motivos,
      leads_ids: leadsInseridos,
    }).eq("id", extracao_id);

    return new Response("ok", { status: 200 });
  }

  // ─── ETAPA GOOGLE CONCLUÍDA → inicia Instagram Scraper ──────────────────
  if (stage === "google") {
    const googleItems = await buscarDataset(datasetId, APIFY_TOKEN);
    const instagramUsernames: string[] = [];

    for (const item of googleItems) {
      const organicResults = item?.organicResults || [];
      for (const result of organicResults) {
        const resultUrl: string = result?.url || result?.link || "";
        const match = resultUrl.match(/instagram\.com\/([^/?#]+)/);
        if (match && match[1] && !["p", "reel", "stories", "explore", "accounts"].includes(match[1])) {
          const username = match[1].replace(/\/$/, "");
          if (username && !instagramUsernames.includes(username)) {
            instagramUsernames.push(username);
          }
        }
      }
    }

    console.log(`Usernames encontrados: ${instagramUsernames.length}`);

    if (instagramUsernames.length === 0) {
      await supabase.from("extracoes").update({
        status: "erro",
        erro_mensagem: "Nenhum perfil Instagram encontrado para essa busca",
      }).eq("id", extracao_id);
      return new Response("ok", { status: 200 });
    }

    const usernamesToScrape = instagramUsernames.slice(0, Math.min(quantidade * 2, 50));
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

    const webhookUrl =
      `${SUPABASE_URL}/functions/v1/prospeccao-webhook` +
      `?stage=instagram` +
      `&extracao_id=${encodeURIComponent(extracao_id)}` +
      `&cidade=${encodeURIComponent(cidade)}` +
      `&nicho=${encodeURIComponent(nicho)}` +
      `&quantidade=${quantidade}`;

    // Inicia Instagram scraper
    const igRunRes = await fetch(
      `${APIFY_BASE}/acts/apify~instagram-profile-scraper/runs?token=${APIFY_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: usernamesToScrape }),
      }
    );
    const igRun = await igRunRes.json();
    console.log("Instagram scraper response:", JSON.stringify(igRun));

    const igRunId = igRun?.data?.id;
    if (!igRunId) {
      await supabase.from("extracoes").update({
        status: "erro",
        erro_mensagem: "Falha ao iniciar Instagram Scraper",
      }).eq("id", extracao_id);
      return new Response("ok", { status: 200 });
    }

    // Registra webhook para o run do Instagram
    await fetch(
      `${APIFY_BASE}/actor-runs/${igRunId}/webhooks?token=${APIFY_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED"],
          requestUrl: webhookUrl,
        }),
      }
    );

    return new Response("ok", { status: 200 });
  }

  // ─── ETAPA INSTAGRAM CONCLUÍDA → processa perfis e insere leads ─────────
  if (stage === "instagram") {
    const igProfiles = await buscarDataset(datasetId, APIFY_TOKEN);
    const leadsInseridos: string[] = [];
    let count = 0;

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
          segmento: nicho,
          origem: "instagram_scraping",
          estagio_fonte: "automatico",
          status: "novo",
          origem_metadata: {
            cidade,
            nicho,
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

    return new Response("ok", { status: 200 });
  }

  return new Response("stage desconhecido", { status: 400 });
});
