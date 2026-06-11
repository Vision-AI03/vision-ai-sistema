import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callClaude, MODEL_HAIKU } from "../_shared/anthropic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth validation
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { lead_id } = await req.json();
  if (!lead_id) {
    return new Response(JSON.stringify({ error: "lead_id is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fetch lead data
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", lead_id)
    .maybeSingle();

  if (leadError || !lead) {
    return new Response(JSON.stringify({ error: "Lead not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  const APIFY_API_KEY = Deno.env.get("APIFY_API_KEY");

  const enrichmentData: Record<string, unknown> = {};

  // 1. Scrape company website with Firecrawl
  if (FIRECRAWL_API_KEY && lead.site_empresa) {
    try {
      let siteUrl = lead.site_empresa.trim();
      if (!siteUrl.startsWith("http")) siteUrl = `https://${siteUrl}`;

      console.log("Scraping company site:", siteUrl);
      const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: siteUrl,
          formats: ["markdown", "links"],
          onlyMainContent: true,
        }),
      });

      const scrapeData = await scrapeRes.json();
      if (scrapeRes.ok && scrapeData.success) {
        enrichmentData.site_markdown = scrapeData.data?.markdown || scrapeData.markdown || "";
        enrichmentData.site_title = scrapeData.data?.metadata?.title || "";
        enrichmentData.site_description = scrapeData.data?.metadata?.description || "";
        console.log("Site scraped successfully");
      } else {
        console.error("Firecrawl scrape error:", scrapeData);
      }
    } catch (e) {
      console.error("Error scraping site:", e);
    }
  }

  // 2. Search for company info with Firecrawl
  if (FIRECRAWL_API_KEY && (lead.empresa || lead.nome)) {
    try {
      const searchQuery = lead.empresa
        ? `${lead.empresa} empresa ${lead.segmento || ""}`
        : `${lead.nome} ${lead.empresa || ""}`;

      console.log("Searching for:", searchQuery);
      const searchRes = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: searchQuery,
          limit: 5,
        }),
      });

      const searchData = await searchRes.json();
      if (searchRes.ok && searchData.success) {
        enrichmentData.search_results = (searchData.data || [])
          .map((r: { title?: string; description?: string; url?: string }) =>
            `${r.title}: ${r.description} (${r.url})`
          )
          .join("\n");
        console.log("Search completed successfully");
      }
    } catch (e) {
      console.error("Error searching:", e);
    }
  }

  // 3. Scrape LinkedIn profile with Apify
  if (APIFY_API_KEY && lead.linkedin_url) {
    try {
      let linkedinUrl = lead.linkedin_url.trim();
      if (!linkedinUrl.startsWith("http")) linkedinUrl = `https://${linkedinUrl}`;

      console.log("Scraping LinkedIn via Apify:", linkedinUrl);

      // Start Apify actor run for LinkedIn profile scraper
      const actorRunRes = await fetch(
        `https://api.apify.com/v2/acts/anchor~linkedin-profile-scraper/run-sync-get-dataset-items?token=${APIFY_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startUrls: [{ url: linkedinUrl }],
            maxItems: 1,
          }),
        }
      );

      if (actorRunRes.ok) {
        const linkedinData = await actorRunRes.json();
        if (Array.isArray(linkedinData) && linkedinData.length > 0) {
          const profile = linkedinData[0];
          enrichmentData.linkedin_profile = {
            headline: profile.headline || "",
            summary: profile.summary || "",
            experience: (profile.experience || []).slice(0, 3).map((e: any) => ({
              title: e.title,
              company: e.companyName,
              description: e.description,
            })),
            skills: (profile.skills || []).slice(0, 10),
            location: profile.location || "",
          };
          console.log("LinkedIn scraped successfully");
        }
      } else {
        console.error("Apify error:", await actorRunRes.text());
      }
    } catch (e) {
      console.error("Error scraping LinkedIn:", e);
    }
  }

  // 3b. Scrape Instagram profile with Apify
  if (APIFY_API_KEY && lead.instagram_url) {
    try {
      let instaHandle = lead.instagram_url.trim();
      // Extract handle from URL or @mention
      if (instaHandle.includes("instagram.com/")) {
        instaHandle = instaHandle.split("instagram.com/")[1].split("/")[0].split("?")[0];
      }
      if (instaHandle.startsWith("@")) instaHandle = instaHandle.slice(1);

      console.log("Scraping Instagram via Apify:", instaHandle);

      const instaRes = await fetch(
        `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${APIFY_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            usernames: [instaHandle],
            resultsLimit: 1,
          }),
        }
      );

      if (instaRes.ok) {
        const instaData = await instaRes.json();
        if (Array.isArray(instaData) && instaData.length > 0) {
          const profile = instaData[0];
          enrichmentData.instagram_profile = {
            fullName: profile.fullName || "",
            biography: profile.biography || "",
            followersCount: profile.followersCount || 0,
            followsCount: profile.followsCount || 0,
            postsCount: profile.postsCount || 0,
            isBusinessAccount: profile.isBusinessAccount || false,
            businessCategory: profile.businessCategoryName || "",
            externalUrl: profile.externalUrl || "",
          };
          console.log("Instagram scraped successfully");
        }
      } else {
        console.error("Apify Instagram error:", await instaRes.text());
      }
    } catch (e) {
      console.error("Error scraping Instagram:", e);
    }
  }

  // 4. Use AI to analyze all collected data and generate enrichment
  const prompt = `Você é um analista de vendas B2B da Vision AI, uma agência de inteligência artificial.
Analise os dados coletados sobre este lead e gere um perfil enriquecido.

DADOS DO LEAD:
- Nome: ${lead.nome}
- Email: ${lead.email}
- Empresa: ${lead.empresa || "Não informado"}
- Telefone: ${lead.telefone || "Não informado"}
- Segmento: ${lead.segmento || "Não informado"}
- Mensagem original: ${lead.mensagem_original || "Não informou"}

DADOS DO SITE DA EMPRESA:
Título: ${enrichmentData.site_title || "N/A"}
Descrição: ${enrichmentData.site_description || "N/A"}
Conteúdo: ${String(enrichmentData.site_markdown || "N/A").substring(0, 3000)}

RESULTADOS DE BUSCA:
${enrichmentData.search_results || "N/A"}

PERFIL LINKEDIN:
${enrichmentData.linkedin_profile ? JSON.stringify(enrichmentData.linkedin_profile) : "N/A"}

PERFIL INSTAGRAM:
${enrichmentData.instagram_profile ? JSON.stringify(enrichmentData.instagram_profile) : "N/A"}

Retorne um JSON com:
{
  "segmento": "segmento de mercado da empresa",
  "porte_empresa": "micro|pequena|media|grande",
  "nivel_maturidade_digital": "baixo|medio|alto",
  "dores_identificadas": "texto com as principais dores e necessidades",
  "oportunidades": "como a Vision AI pode ajudar este lead",
  "resumo_empresa": "resumo sobre a empresa e sua atuação",
  "motivo_score": "justificativa do score",
  "score": número de 0-100 (potencial como cliente),
  "prioridade_contato": "baixa|media|alta|imediata",
  "linkedin_cargo": "cargo do lead se encontrado",
  "site_titulo": "título do site",
  "site_descricao": "descrição do site"
}

Retorne APENAS o JSON, sem markdown.`;

  try {
    const aiContent = await callClaude({
      model: MODEL_HAIKU,
      prompt,
      temperature: 0.3,
    });

    // Strip eventuais cercas ```json antes de extrair o objeto
    const cleaned = aiContent.replace(/```json\s*/gi, "").replace(/```/g, "");
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);

      // Update lead with enriched data
      const updateData: Record<string, unknown> = {};
      if (analysis.segmento) updateData.segmento = analysis.segmento;
      if (analysis.porte_empresa) updateData.porte_empresa = analysis.porte_empresa;
      if (analysis.nivel_maturidade_digital) updateData.nivel_maturidade_digital = analysis.nivel_maturidade_digital;
      if (analysis.dores_identificadas) updateData.dores_identificadas = analysis.dores_identificadas;
      if (analysis.oportunidades) updateData.oportunidades = analysis.oportunidades;
      if (analysis.resumo_empresa) updateData.resumo_empresa = analysis.resumo_empresa;
      if (analysis.motivo_score) updateData.motivo_score = analysis.motivo_score;
      if (analysis.score != null) updateData.score = analysis.score;
      if (analysis.prioridade_contato) updateData.prioridade_contato = analysis.prioridade_contato;
      if (analysis.linkedin_cargo) updateData.linkedin_cargo = analysis.linkedin_cargo;
      if (analysis.site_titulo) updateData.site_titulo = analysis.site_titulo;
      if (analysis.site_descricao) updateData.site_descricao = analysis.site_descricao;

      // Move status to "enriquecido"
      updateData.status = "enriquecido";
      updateData.atualizado_em = new Date().toISOString();

      // Salvar dados brutos de enriquecimento
      updateData.enriquecimento_data = new Date().toISOString();
      updateData.enriquecimento_fontes = {
        site: !!enrichmentData.site_markdown,
        linkedin: !!enrichmentData.linkedin_profile,
        instagram: !!enrichmentData.instagram_profile,
      };
      if (enrichmentData.site_markdown) {
        updateData.enriquecimento_site_raw = {
          title: enrichmentData.site_title,
          description: enrichmentData.site_description,
          markdown: String(enrichmentData.site_markdown).substring(0, 5000),
        };
      }
      if (enrichmentData.linkedin_profile) {
        updateData.enriquecimento_linkedin_raw = enrichmentData.linkedin_profile;
      }
      if (enrichmentData.instagram_profile) {
        updateData.enriquecimento_instagram_raw = enrichmentData.instagram_profile;
      }

      const { error: updateError } = await supabase
        .from("leads")
        .update(updateData)
        .eq("id", lead_id);

      if (updateError) {
        console.error("Error updating lead:", updateError);
        return new Response(JSON.stringify({ error: "Failed to update lead", details: updateError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("Lead enriched successfully:", lead_id);

      return new Response(JSON.stringify({
        success: true,
        data: analysis,
        sources: {
          site_scraped: !!enrichmentData.site_markdown,
          search_done: !!enrichmentData.search_results,
          linkedin_scraped: !!enrichmentData.linkedin_profile,
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      throw new Error("AI did not return valid JSON");
    }
  } catch (e) {
    console.error("AI analysis error:", e);
    return new Response(JSON.stringify({ error: "AI analysis failed", details: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
