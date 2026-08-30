import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callDeepSeekJson, MODEL_DEEPSEEK_CHAT } from "../_shared/deepseek.ts";

// Webhook público chamado pelo Apify quando o run de X conclui.
// Busca os tweets, cura com DeepSeek e insere no feed do radar (mercado_itens).

const APIFY_BASE = "https://api.apify.com/v2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const JANELA_HORAS = 48;
const MAX_CURAR = 80;

type Cand = { fonte_id: string | null; fonte_nome: string; titulo: string; url: string; trecho: string; publicado_em: string | null };

async function buscarDataset(datasetId: string, token: string): Promise<any[]> {
  const res = await fetch(`${APIFY_BASE}/datasets/${datasetId}/items?token=${token}&limit=300`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function isoSeguro(dt: any): string | null {
  if (!dt) return null;
  const d = new Date(dt);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizarTweet(t: any, mapaHandle: Map<string, string>): Cand | null {
  const texto: string = t.text ?? t.fullText ?? t.full_text ?? t.content ?? "";
  if (!texto) return null;
  const handle: string = (t.author?.userName ?? t.author?.screen_name ?? t.username ?? t.user?.screen_name ?? "").toLowerCase();
  const id = t.id ?? t.id_str ?? t.tweetId;
  const url: string = t.url ?? t.twitterUrl ?? (handle && id ? `https://x.com/${handle}/status/${id}` : "");
  if (!url) return null;
  const dt = t.createdAt ?? t.created_at ?? t.date ?? null;
  return {
    fonte_id: mapaHandle.get(handle) ?? null,
    fonte_nome: handle ? `@${handle} (X)` : "X",
    titulo: texto.replace(/\s+/g, " ").trim().slice(0, 140),
    url,
    trecho: texto.replace(/\s+/g, " ").trim().slice(0, 500),
    publicado_em: isoSeguro(dt),
  };
}

async function processar(datasetId: string) {
  const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN")!;
  const tweets = await buscarDataset(datasetId, APIFY_TOKEN);
  console.log(`radar-x-webhook: dataset ${datasetId} trouxe ${tweets.length} tweets brutos`);
  if (tweets.length && !tweets[0]?.text && !tweets[0]?.fullText) {
    console.log("radar-x-webhook: amostra do 1o item (schema):", JSON.stringify(tweets[0]).slice(0, 500));
  }

  // mapa handle -> fonte_id
  const { data: fontes } = await supabase.from("mercado_fontes").select("id, url").eq("tipo", "x");
  const mapaHandle = new Map<string, string>(
    (fontes ?? []).map((f: any) => [String(f.url).replace(/^@/, "").toLowerCase(), f.id])
  );

  const cortem = Date.now() - JANELA_HORAS * 3600_000;
  let cands = tweets
    .map((t) => normalizarTweet(t, mapaHandle))
    .filter((c): c is Cand => !!c)
    .filter((c) => !c.publicado_em || new Date(c.publicado_em).getTime() >= cortem);

  // dedupe no lote
  const vistos = new Set<string>();
  cands = cands.filter((c) => (vistos.has(c.url) ? false : (vistos.add(c.url), true)));

  // dedupe contra o banco
  if (cands.length) {
    const { data: ex } = await supabase.from("mercado_itens").select("url").in("url", cands.map((c) => c.url));
    const jaTem = new Set((ex ?? []).map((r: any) => r.url));
    cands = cands.filter((c) => !jaTem.has(c.url));
  }

  cands.sort((a, b) => (b.publicado_em ?? "").localeCompare(a.publicado_em ?? ""));
  cands = cands.slice(0, MAX_CURAR);
  console.log(`radar-x-webhook: ${cands.length} candidatos após filtros (janela ${JANELA_HORAS}h + dedupe)`);
  if (cands.length === 0) return { curados: 0 };

  // curadoria DeepSeek
  const lista = cands.map((c, i) => ({ i, fonte: c.fonte_nome, titulo: c.titulo, trecho: c.trecho }));
  const system =
    "Você é o curador de inteligência de mercado de IA da Vision AI. Estes itens são posts do X de " +
    "executivos/pesquisadores de IA. Selecione APENAS sinal real e novo: anúncios de produto/modelo, lançamentos, " +
    "mudanças relevantes, insights técnicos úteis. DESCARTE ruído: banter, opinião vaga, respostas pessoais, memes, hype. " +
    "Seja rigoroso.";
  const prompt =
    "Posts candidatos (JSON):\n```json\n" + JSON.stringify(lista) + "\n```\n" +
    "Retorne JSON {\"itens\":[{\"i\":<indice>,\"categoria\":\"ferramenta|modelo|pesquisa|negocio|outro\",\"relevancia\":<0-100>,\"resumo\":\"<1-2 frases factuais pt-BR>\"}]} " +
    "só com os relevantes (relevancia >= 60). Se nada, {\"itens\":[]}.";

  let dec: { itens: Array<{ i: number; categoria: string; relevancia: number; resumo: string }> };
  try {
    dec = await callDeepSeekJson({ model: MODEL_DEEPSEEK_CHAT, system, prompt, maxTokens: 8000 });
  } catch (e) {
    console.error("deepseek x erro:", e);
    return { curados: 0 };
  }

  const rows = (dec.itens ?? [])
    .filter((d) => cands[d.i])
    .map((d) => {
      const c = cands[d.i];
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

  if (rows.length) {
    await supabase.from("mercado_itens").upsert(rows, { onConflict: "url" });
  }
  return { curados: rows.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200 });

  let payload: any;
  try { payload = await req.json(); } catch { return new Response("invalid json", { status: 400 }); }

  const eventType: string = payload?.eventType || "";
  const datasetId: string = payload?.resource?.defaultDatasetId || payload?.datasetId || "";

  if (eventType.includes("FAILED")) {
    console.error("radar-x-webhook: run falhou");
    return new Response("ok", { status: 200 });
  }
  if (!datasetId) {
    console.error("radar-x-webhook: datasetId ausente", JSON.stringify(payload).slice(0, 300));
    return new Response("no dataset", { status: 200 });
  }

  try {
    const out = await processar(datasetId);
    console.log("radar-x-webhook:", JSON.stringify(out));
  } catch (e) {
    console.error("radar-x-webhook erro:", e);
  }
  return new Response("ok", { status: 200 });
});
