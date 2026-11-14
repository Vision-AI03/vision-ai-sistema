#!/usr/bin/env node
// Lê e grava a fila de posts (public.fila_posts) pela API REST com a service_role.
//
//   node fila.mjs estado               -> o que falta produzir, pedidos de alteração e pautas recentes
//   node fila.mjs inserir <post.json>  -> cria rascunho (conta, tipo, legenda, midia_urls, pauta, nicho, referencias, capa_url)
//   node fila.mjs revisar <id> <post.json> -> grava a nova versão de um post em 'revisar' e devolve como rascunho
//
// Nunca aprova nem publica: isso é decisão do dono, pela tela Conteúdo.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PROJETO = "sfezwprbanvxsnwgvkhh";
const BASE = `https://${PROJETO}.supabase.co/rest/v1`;
const ANCORA = Date.UTC(2026, 10, 14); // mesmo calendário de fila_posts_proximo_horario
const DIAS_A_FRENTE = 8;
const CONTAS = ["vision_ai", "cot_ai"];
const CAMPOS = ["conta", "tipo", "legenda", "midia_urls", "capa_url", "pauta", "nicho", "referencias"];

function chave() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const out = execSync(`supabase projects api-keys --project-ref ${PROJETO} -o json`, {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  });
  const k = JSON.parse(out).find((x) => x.id === "service_role" || x.name === "service_role");
  if (!k?.api_key) throw new Error("service_role não encontrada; defina SUPABASE_SERVICE_ROLE_KEY");
  return k.api_key;
}

const KEY = chave();

async function api(metodo, caminho, corpo) {
  const res = await fetch(`${BASE}/${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${KEY}`, apikey: KEY, "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`${metodo} ${caminho}: ${res.status} ${texto}`);
  return texto ? JSON.parse(texto) : null;
}

function validar(post) {
  const n = post.midia_urls?.length ?? 0;
  if (!CONTAS.includes(post.conta)) throw new Error("conta deve ser vision_ai ou cot_ai");
  if (post.tipo === "imagem" && n !== 1) throw new Error("imagem precisa de 1 URL");
  if (post.tipo === "carrossel" && (n < 2 || n > 10)) throw new Error("carrossel precisa de 2 a 10 URLs");
  if (post.tipo === "reels" && n !== 1) throw new Error("reels precisa de 1 URL de MP4");
  if (!post.legenda || post.legenda.length > 2200) throw new Error("legenda vazia ou acima de 2200 caracteres");
  return Object.fromEntries(CAMPOS.filter((c) => post[c] !== undefined).map((c) => [c, post[c]]));
}

// Dias de publicação (dia sim, dia não) dos próximos N dias, em horário de Brasília.
const HORA_UTC = { feed: 15, reels: 22 }; // 12h e 19h em Brasília
const slotNoFuturo = (dia, k) => Date.parse(`${dia}T00:00:00Z`) + HORA_UTC[k] * 3600_000 > Date.now() + 10 * 60_000;

function diasDePublicacao() {
  const hojeBR = new Date(Date.now() - 3 * 3600_000);
  const hoje = Date.UTC(hojeBR.getUTCFullYear(), hojeBR.getUTCMonth(), hojeBR.getUTCDate());
  const dias = [];
  for (let i = 0; i < DIAS_A_FRENTE; i++) {
    const d = hoje + i * 86400_000;
    if (Math.round((d - ANCORA) / 86400_000) % 2 === 0) dias.push(new Date(d).toISOString().slice(0, 10));
  }
  return dias;
}

async function estado() {
  const posts = await api("GET", "fila_posts?select=id,conta,tipo,status,pauta,nicho,feedback,agendado_para,publicado_em,criado_em,legenda&order=criado_em.desc&limit=200");
  const dias = diasDePublicacao();
  const faltando = {};
  for (const conta of CONTAS) {
    for (const k of ["feed", "reels"]) {
      const ehK = (p) => (p.tipo === "reels") === (k === "reels");
      const ocupados = new Set(posts
        .filter((p) => p.conta === conta && ehK(p) && ["aprovado", "publicando", "publicado"].includes(p.status))
        .map((p) => p.agendado_para ?? p.publicado_em)
        .filter(Boolean)
        .map((t) => new Date(new Date(t).getTime() - 3 * 3600_000).toISOString().slice(0, 10)));
      const vazios = dias.filter((d) => slotNoFuturo(d, k) && !ocupados.has(d)).length;
      const emEspera = posts.filter((p) => p.conta === conta && ehK(p) && ["rascunho", "revisar"].includes(p.status)).length;
      faltando[`${conta}.${k}`] = { horarios_vazios: vazios, rascunhos_em_espera: emEspera, produzir: Math.max(0, vazios - emEspera) };
    }
  }
  return {
    dias_de_publicacao: dias,
    faltando,
    pedidos_de_alteracao: posts.filter((p) => p.status === "revisar")
      .map(({ id, conta, tipo, pauta, feedback, legenda }) => ({ id, conta, tipo, pauta, feedback, legenda })),
    pautas_recentes: posts.slice(0, 40).map((p) => `${p.conta} | ${p.tipo} | ${p.nicho ?? "-"} | ${p.pauta ?? p.legenda.split("\n")[0]}`),
  };
}

const [cmd, a, b] = process.argv.slice(2);
try {
  if (cmd === "estado") {
    console.log(JSON.stringify(await estado(), null, 2));
  } else if (cmd === "inserir" && a) {
    const corpo = { ...validar(JSON.parse(readFileSync(a, "utf8"))), status: "rascunho", origem: "claude" };
    const [row] = await api("POST", "fila_posts", corpo);
    console.log(JSON.stringify({ id: row.id, status: row.status }));
  } else if (cmd === "revisar" && a && b) {
    const [atual] = await api("GET", `fila_posts?id=eq.${a}&select=status`);
    if (atual?.status !== "revisar") throw new Error(`post ${a} não está em 'revisar' (status: ${atual?.status})`);
    const corpo = {
      ...validar(JSON.parse(readFileSync(b, "utf8"))),
      status: "rascunho", feedback: null, atualizado_em: new Date().toISOString(),
    };
    const [row] = await api("PATCH", `fila_posts?id=eq.${a}`, corpo);
    console.log(JSON.stringify({ id: row.id, status: row.status }));
  } else {
    console.error("uso: node fila.mjs estado | inserir <post.json> | revisar <id> <post.json>");
    process.exit(1);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
