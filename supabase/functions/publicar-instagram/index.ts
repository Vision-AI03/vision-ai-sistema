import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cronOuDono } from "../_shared/auth.ts";

// Publica no Instagram os posts aprovados de public.fila_posts (imagem, carrossel ou Reels).
// Auth: X-Cron-Secret (cron) OU Bearer (dono logado no app).
// Secrets: IG_USER_ID_VISION_AI, IG_TOKEN_VISION_AI, IG_USER_ID_COT_AI, IG_TOKEN_COT_AI, CRON_SECRET.
// Opcional: IG_API_VERSION (padrão v26.0).
// Body {"acao": "renovar_tokens"} renova os tokens (cron semanal) em vez de publicar.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const VERSAO = Deno.env.get("IG_API_VERSION") ?? "v26.0";
const MAX_POR_EXECUCAO = 2;
const MAX_TENTATIVAS = 3;
const POLL_TENTATIVAS = 4; // vídeo demora mais: fica "IN_PROGRESS" e a próxima execução retoma o container
const POLL_INTERVALO_MS = 3000;

interface Post {
  id: string;
  conta: "vision_ai" | "cot_ai";
  tipo: "imagem" | "carrossel" | "reels";
  legenda: string;
  midia_urls: string[];
  capa_url: string | null;
  ig_container_id: string | null;
  tentativas: number;
}

interface Credencial {
  userId: string;
  token: string;
  base: string;
}

const CONTAS: Post["conta"][] = ["vision_ai", "cot_ai"];

// Token vivo fica no Vault (renovado toda semana); o secret IG_TOKEN_* é só a semente.
async function tokenAtual(conta: Post["conta"]): Promise<string> {
  const { data, error } = await supabase.rpc("ig_token_ler", { p_conta: conta });
  if (error) console.error(`ig_token_ler ${conta}:`, error.message);
  return (data as string | null) || Deno.env.get(`IG_TOKEN_${conta.toUpperCase()}`) || "";
}

// Token do Instagram Login começa com "IG" e usa graph.instagram.com;
// token do Facebook Login (EAA...) usa graph.facebook.com.
async function credencial(conta: Post["conta"]): Promise<Credencial> {
  const sufixo = conta.toUpperCase();
  const userId = Deno.env.get(`IG_USER_ID_${sufixo}`) ?? "";
  const token = await tokenAtual(conta);
  if (!userId || !token) {
    throw new Error(`IG_USER_ID_${sufixo} ou IG_TOKEN_${sufixo} não configurados nos secrets.`);
  }
  const host = token.startsWith("IG") ? "graph.instagram.com" : "graph.facebook.com";
  return { userId, token, base: `https://${host}/${VERSAO}` };
}

// Renova o token longo (+60 dias) e grava no Vault. Só vale para token do Instagram Login.
async function renovarTokens(): Promise<Record<string, unknown>[]> {
  const resultados: Record<string, unknown>[] = [];
  for (const conta of CONTAS) {
    try {
      const token = await tokenAtual(conta);
      if (!token.startsWith("IG")) throw new Error("token ausente ou não é do Instagram Login");
      const url = new URL("https://graph.instagram.com/refresh_access_token");
      url.searchParams.set("grant_type", "ig_refresh_token");
      url.searchParams.set("access_token", token);
      const res = await fetch(url);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.access_token) {
        throw new Error(`refresh_access_token: ${JSON.stringify(json?.error ?? json)}`);
      }
      const expiraEm = new Date(Date.now() + Number(json.expires_in ?? 0) * 1000).toISOString();
      const { error } = await supabase.rpc("ig_token_salvar", {
        p_conta: conta, p_token: json.access_token, p_expira_em: expiraEm,
      });
      if (error) throw new Error(`ig_token_salvar: ${error.message}`);
      resultados.push({ conta, ok: true, expira_em: expiraEm });
    } catch (e: any) {
      const erro = String(e?.message ?? e).slice(0, 1000);
      await supabase.from("instagram_tokens")
        .upsert({ conta, erro, atualizado_em: new Date().toISOString() });
      resultados.push({ conta, ok: false, erro });
    }
  }
  return resultados;
}

async function graph(
  cred: Credencial,
  metodo: "GET" | "POST",
  path: string,
  params: Record<string, string> = {}
): Promise<any> {
  const url = new URL(`${cred.base}/${path}`);
  const init: RequestInit = {
    method: metodo,
    headers: { Authorization: `Bearer ${cred.token}` },
  };
  if (metodo === "GET") {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  } else {
    init.body = new URLSearchParams(params);
  }
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) {
    throw new Error(`Graph API ${path}: ${JSON.stringify(json?.error ?? json)}`);
  }
  return json;
}

// A API só aceita JPEG em URL pública. Falha cedo com mensagem clara quando dá para saber.
async function validarImagem(url: string) {
  let res: Response;
  try {
    res = await fetch(url, { method: "HEAD" });
  } catch {
    throw new Error(`Imagem inacessível: ${url}`);
  }
  if (res.status === 405 || res.status === 501) return; // servidor não aceita HEAD; deixa a Graph API validar
  if (!res.ok) throw new Error(`Imagem inacessível (${res.status}): ${url}`);
  const tipo = (res.headers.get("content-type") ?? "").toLowerCase();
  if (tipo && !tipo.includes("jpeg") && !tipo.includes("jpg")) {
    throw new Error(`A imagem precisa ser JPEG (veio ${tipo}): ${url}`);
  }
}

async function criarContainer(cred: Credencial, post: Post): Promise<string> {
  if (post.tipo === "reels") {
    const params: Record<string, string> = {
      media_type: "REELS",
      video_url: post.midia_urls[0],
      caption: post.legenda,
      share_to_feed: "true",
    };
    if (post.capa_url) params.cover_url = post.capa_url;
    const { id } = await graph(cred, "POST", `${cred.userId}/media`, params);
    return id;
  }

  await Promise.all(post.midia_urls.map(validarImagem));

  if (post.midia_urls.length === 1) {
    const { id } = await graph(cred, "POST", `${cred.userId}/media`, {
      image_url: post.midia_urls[0],
      caption: post.legenda,
    });
    return id;
  }

  const filhos = await Promise.all(
    post.midia_urls.map((image_url) =>
      graph(cred, "POST", `${cred.userId}/media`, { image_url, is_carousel_item: "true" })
    )
  );
  const { id } = await graph(cred, "POST", `${cred.userId}/media`, {
    media_type: "CAROUSEL",
    children: filhos.map((f) => f.id).join(","),
    caption: post.legenda,
  });
  return id;
}

async function statusContainer(cred: Credencial, containerId: string): Promise<string> {
  for (let i = 0; i < POLL_TENTATIVAS; i++) {
    const { status_code, status } = await graph(cred, "GET", containerId, { fields: "status_code,status" });
    if (status_code === "ERROR") console.error(`Container ${containerId}:`, status);
    if (status_code !== "IN_PROGRESS") return status_code;
    await new Promise((r) => setTimeout(r, POLL_INTERVALO_MS));
  }
  return "IN_PROGRESS";
}

async function atualizar(id: string, campos: Record<string, unknown>) {
  const { error } = await supabase
    .from("fila_posts")
    .update({ ...campos, atualizado_em: new Date().toISOString() })
    .eq("id", id);
  if (error) console.error(`fila_posts update ${id}:`, error.message);
}

async function publicar(post: Post): Promise<Record<string, unknown>> {
  const cred = await credencial(post.conta);

  let containerId = post.ig_container_id;
  if (!containerId) {
    containerId = await criarContainer(cred, post);
    await atualizar(post.id, { ig_container_id: containerId });
  }

  const status = await statusContainer(cred, containerId);

  if (status === "IN_PROGRESS") {
    // Ainda processando: volta para a fila e a próxima execução reaproveita o container.
    await atualizar(post.id, { status: "aprovado" });
    return { id: post.id, ok: true, pendente: true };
  }
  if (status === "ERROR" || status === "EXPIRED") {
    await atualizar(post.id, { ig_container_id: null });
    throw new Error(`Container ${status}`);
  }

  let mediaId: string | null = null;
  if (status !== "PUBLISHED") {
    const pub = await graph(cred, "POST", `${cred.userId}/media_publish`, { creation_id: containerId });
    mediaId = pub.id;
  }

  let permalink: string | null = null;
  if (mediaId) {
    try {
      const info = await graph(cred, "GET", mediaId, { fields: "permalink" });
      permalink = info.permalink ?? null;
    } catch (e) {
      console.error("permalink:", e);
    }
  }

  await atualizar(post.id, {
    status: "publicado",
    publicado_em: new Date().toISOString(),
    ig_media_id: mediaId,
    permalink,
    erro: null,
  });
  return { id: post.id, ok: true, permalink };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!(await cronOuDono(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    if (body?.acao === "renovar_tokens") {
      const resultados = await renovarTokens();
      return new Response(JSON.stringify({ ok: resultados.every((r) => r.ok), resultados }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase.rpc("fila_posts_reservar", { p_limite: MAX_POR_EXECUCAO });
    if (error) throw new Error(`fila_posts_reservar: ${error.message}`);

    const fila = (data ?? []) as Post[];
    const resultados: Record<string, unknown>[] = [];

    for (const post of fila) {
      try {
        resultados.push(await publicar(post));
      } catch (e: any) {
        const tentativas = post.tentativas + 1;
        await atualizar(post.id, {
          status: tentativas >= MAX_TENTATIVAS ? "erro" : "aprovado",
          tentativas,
          erro: String(e?.message ?? e).slice(0, 1000),
        });
        resultados.push({ id: post.id, ok: false, erro: e?.message });
      }
    }

    return new Response(JSON.stringify({ ok: true, processados: fila.length, resultados }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("publicar-instagram erro:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
