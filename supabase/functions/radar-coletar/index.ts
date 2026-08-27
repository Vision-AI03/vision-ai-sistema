import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { XMLParser } from "https://esm.sh/fast-xml-parser@4.4.1";
import { callDeepSeekJson, MODEL_DEEPSEEK_CHAT } from "../_shared/deepseek.ts";

// Coleta itens de fontes web (RSS/Atom), faz dedupe por URL e curadoria com
// DeepSeek (filtra ruído, resume em pt-BR, categoriza, dá relevância 0-100).
// Auth: X-Cron-Secret (cron) OU Bearer (usuário).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

const MAX_ITENS_CURAR = 80;         // teto de candidatos por rodada (controle de tokens)
const JANELA_HORAS = 72;            // considerar itens publicados nas últimas 72h

type Fonte = { id: string; nome: string; url: string; tipo: string };
type Candidato = { fonte_id: string; fonte_nome: string; titulo: string; url: string; trecho: string; publicado_em: string | null };

const stripHtml = (s: string) => (s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const asArray = <T,>(v: T | T[] | undefined): T[] => (Array.isArray(v) ? v : v ? [v] : []);

function linkAtom(link: any): string {
  const arr = asArray(link);
  const alt = arr.find((l) => l?.["@_rel"] === "alternate") ?? arr[0];
  if (typeof alt === "string") return alt;
  return alt?.["@_href"] ?? "";
}

function parseFeed(xml: string, fonte: Fonte): Candidato[] {
  let obj: any;
  try { obj = parser.parse(xml); } catch { return []; }
  const out: Candidato[] = [];

  // RSS 2.0
  const rssItems = asArray(obj?.rss?.channel?.item);
  for (const it of rssItems) {
    const url = typeof it.link === "string" ? it.link : (it.link?.["@_href"] ?? "");
    const titulo = stripHtml(typeof it.title === "string" ? it.title : it.title?.["#text"] ?? "");
    if (!url || !titulo) continue;
    out.push({
      fonte_id: fonte.id, fonte_nome: fonte.nome, titulo, url,
      trecho: stripHtml(it.description ?? it["content:encoded"] ?? "").slice(0, 400),
      publicado_em: it.pubDate ? new Date(it.pubDate).toISOString() : null,
    });
  }

  // Atom
  const atomEntries = asArray(obj?.feed?.entry);
  for (const e of atomEntries) {
    const url = linkAtom(e.link);
    const titulo = stripHtml(typeof e.title === "string" ? e.title : e.title?.["#text"] ?? "");
    if (!url || !titulo) continue;
    const dt = e.published ?? e.updated ?? null;
    out.push({
      fonte_id: fonte.id, fonte_nome: fonte.nome, titulo, url,
      trecho: stripHtml(e.summary ?? e.content?.["#text"] ?? e.content ?? "").slice(0, 400),
      publicado_em: dt ? new Date(dt).toISOString() : null,
    });
  }

  return out;
}

async function coletar() {
  const { data: fontes } = await supabase
    .from("mercado_fontes")
    .select("id, nome, url, tipo")
    .eq("ativo", true)
    .in("tipo", ["rss", "site"]);

  const cortem = Date.now() - JANELA_HORAS * 3600_000;
  let candidatos: Candidato[] = [];
  const erros: string[] = [];

  for (const f of (fontes ?? []) as Fonte[]) {
    try {
      const res = await fetch(f.url, { headers: { "User-Agent": "VisionAI-Radar/1.0" } });
      if (!res.ok) { erros.push(`${f.nome}: HTTP ${res.status}`); continue; }
      const xml = await res.text();
      const itens = parseFeed(xml, f).filter((c) =>
        !c.publicado_em || new Date(c.publicado_em).getTime() >= cortem
      );
      candidatos.push(...itens);
    } catch (e) {
      erros.push(`${f.nome}: ${String(e)}`);
    }
  }

  // dedupe dentro do lote por URL
  const vistos = new Set<string>();
  candidatos = candidatos.filter((c) => (vistos.has(c.url) ? false : (vistos.add(c.url), true)));

  // dedupe contra o que já existe no banco
  if (candidatos.length) {
    const urls = candidatos.map((c) => c.url);
    const { data: existentes } = await supabase
      .from("mercado_itens").select("url").in("url", urls);
    const jaTem = new Set((existentes ?? []).map((r: any) => r.url));
    candidatos = candidatos.filter((c) => !jaTem.has(c.url));
  }

  // ordena por data (mais recentes primeiro) e corta
  candidatos.sort((a, b) => (b.publicado_em ?? "").localeCompare(a.publicado_em ?? ""));
  candidatos = candidatos.slice(0, MAX_ITENS_CURAR);

  if (candidatos.length === 0) {
    return { coletados: 0, curados: 0, fontes: fontes?.length ?? 0, erros };
  }

  // ── Curadoria com DeepSeek (barato, alto volume) ──
  const lista = candidatos.map((c, i) => ({ i, fonte: c.fonte_nome, titulo: c.titulo, trecho: c.trecho }));
  const system =
    "Você é o curador de inteligência de mercado de IA da Vision AI (agência de IA, founder solo). " +
    "Selecione APENAS o que é sinal real e novo: lançamento/atualização de modelos (OpenAI, Anthropic, Google, Meta, etc.), " +
    "novas ferramentas ou features de IA, mudanças relevantes em produtos/APIs, pesquisa aplicada com impacto prático, " +
    "e movimentos de negócio grandes (funding, aquisição). DESCARTE ruído: opinião genérica, listicles, hype sem novidade, " +
    "política, clickbait e duplicatas. Seja rigoroso — melhor poucos itens fortes que muitos fracos.";
  const prompt =
    "Itens candidatos (JSON):\n```json\n" + JSON.stringify(lista) + "\n```\n" +
    "Retorne um objeto JSON no formato " +
    `{"itens":[{"i":<indice>,"categoria":"ferramenta|modelo|pesquisa|negocio|outro","relevancia":<0-100>,"resumo":"<1-2 frases factuais em pt-BR, sem hype>"}]} ` +
    "incluindo SOMENTE os itens relevantes (relevancia >= 60). Se nada for relevante, retorne {\"itens\":[]}.";

  let decisao: { itens: Array<{ i: number; categoria: string; relevancia: number; resumo: string }> };
  try {
    decisao = await callDeepSeekJson({ model: MODEL_DEEPSEEK_CHAT, system, prompt, maxTokens: 8000 });
  } catch (e) {
    return { coletados: candidatos.length, curados: 0, fontes: fontes?.length ?? 0, erros: [...erros, `deepseek: ${String(e)}`] };
  }

  const rows = (decisao.itens ?? [])
    .filter((d) => candidatos[d.i])
    .map((d) => {
      const c = candidatos[d.i];
      return {
        fonte_id: c.fonte_id,
        fonte_nome: c.fonte_nome,
        titulo: c.titulo,
        url: c.url,
        resumo: d.resumo ?? null,
        categoria: d.categoria ?? "outro",
        relevancia: Math.max(0, Math.min(100, Math.round(d.relevancia ?? 0))),
        destaque: (d.relevancia ?? 0) >= 85,
        publicado_em: c.publicado_em,
        status: "curado",
      };
    });

  let curados = 0;
  if (rows.length) {
    const { error } = await supabase.from("mercado_itens").upsert(rows, { onConflict: "url" });
    if (error) return { coletados: candidatos.length, curados: 0, fontes: fontes?.length ?? 0, erros: [...erros, error.message] };
    curados = rows.length;
  }

  return { coletados: candidatos.length, curados, fontes: fontes?.length ?? 0, erros };
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
    const out = await coletar();
    return new Response(JSON.stringify({ ok: true, ...out }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("radar-coletar erro:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
