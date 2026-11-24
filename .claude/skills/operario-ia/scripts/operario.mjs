#!/usr/bin/env node
// Operário IA local: lê e grava public.fila_ia e public.uso_assinatura pela API REST
// com a service_role (mesmo padrão de conteudo-instagram/scripts/fila.mjs).
//
//   node operario.mjs uso                   -> sobe a janela 5h/7d salva pela status line
//   node operario.mjs tem-pedido            -> agenda os semanais se for a hora e imprime quantos pedidos pendentes
//   node operario.mjs pegar                 -> reserva o pedido mais antigo e imprime { pedido, dados } em JSON
//   node operario.mjs concluir <id> <md>    -> grava o markdown do arquivo como resultado
//   node operario.mjs falhar <id> <motivo>  -> marca o pedido como erro

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PROJETO = "sfezwprbanvxsnwgvkhh";
const BASE = `https://${PROJETO}.supabase.co/rest/v1`;
const ARQUIVO_USO = join(homedir(), ".claude", "uso-assinatura.json");
const SEMANAIS = ["relatorio_semanal", "briefing_conselho"]; // agendados toda segunda
const DIA = 86400000;

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

async function api(metodo, caminho, corpo, prefer = "return=representation") {
  const res = await fetch(`${BASE}/${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${KEY}`, apikey: KEY, "Content-Type": "application/json", Prefer: prefer },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`${metodo} ${caminho}: ${res.status} ${texto}`);
  return texto ? JSON.parse(texto) : null;
}

const iso = (ms) => new Date(ms).toISOString();
const get = (caminho) => api("GET", caminho);

// ---------- uso da assinatura ----------
async function uso() {
  if (!existsSync(ARQUIVO_USO)) return console.log("sem arquivo de uso (a status line ainda não rodou)");
  const u = JSON.parse(readFileSync(ARQUIVO_USO, "utf8"));
  const seg = (s) => (s ? new Date(s * 1000).toISOString() : null);
  await api("POST", "uso_assinatura?on_conflict=conta", {
    conta: "claude",
    cinco_horas_pct: u.five_hour?.used_percentage ?? null,
    cinco_horas_reset: seg(u.five_hour?.resets_at),
    sete_dias_pct: u.seven_day?.used_percentage ?? null,
    sete_dias_reset: seg(u.seven_day?.resets_at),
    atualizado_em: u.gravado_em ?? new Date().toISOString(),
  }, "resolution=merge-duplicates,return=minimal");
  console.log("uso sincronizado");
}

// ---------- agenda e fila ----------
async function agendarSemanais() {
  const agora = new Date();
  // Segunda-feira a partir das 8h (horário de Brasília = UTC-3)
  const brt = new Date(agora.getTime() - 3 * 3600000);
  if (brt.getUTCDay() !== 1 || brt.getUTCHours() < 8) return;
  for (const tipo of SEMANAIS) {
    const recentes = await get(`fila_ia?select=id&tipo=eq.${tipo}&criado_em=gte.${iso(Date.now() - 6 * DIA)}&limit=1`);
    if (recentes.length === 0) await api("POST", "fila_ia", { tipo, origem: "agendado" });
  }
}

async function temPedido() {
  await agendarSemanais();
  // Pedido travado em 'processando' há mais de 40 min volta para a fila
  await api("PATCH", `fila_ia?status=eq.processando&iniciado_em=lt.${iso(Date.now() - 40 * 60000)}`,
    { status: "pendente", iniciado_em: null }, "return=minimal");
  const pend = await get("fila_ia?select=id&status=eq.pendente");
  console.log(pend.length);
}

// ---------- coleta de dados por tipo ----------
async function dadosComerciais() {
  const semana = iso(Date.now() - 7 * DIA);
  const [leads, conversas, mensagens] = await Promise.all([
    get("leads?select=id,nome,empresa,status,origem,segmento,score,criado_em,status_mudou_em,whatsapp_respondido"),
    get(`wa_conversas?select=id,nome_contato,lead_id,total_mensagens,respondeu,ultima_msg_em&ultima_msg_em=gte.${semana}`),
    get(`wa_mensagens?select=conversa_id,from_me,conteudo,enviada_em&enviada_em=gte.${semana}&order=enviada_em.asc&limit=400`),
  ]);
  const funil = {};
  for (const l of leads) funil[l.status] = (funil[l.status] || 0) + 1;
  return {
    funil_por_estagio: funil,
    leads_novos_7d: leads.filter((l) => l.criado_em >= semana),
    leads_que_mudaram_de_estagio_7d: leads.filter((l) => l.status_mudou_em && l.status_mudou_em >= semana),
    conversas_whatsapp_7d: conversas.map((c) => ({
      ...c,
      mensagens: mensagens.filter((m) => m.conversa_id === c.id)
        .map((m) => `${m.from_me ? "VOCÊ" : "CLIENTE"}: ${(m.conteudo || "").slice(0, 300)}`),
    })),
  };
}

async function dadosFinanceiros() {
  const [contratos, parcelas, recorrencias, custos] = await Promise.all([
    get("contratos?select=id,cliente_nome,tipo_servico,status,valor_total,criado_em"),
    get(`parcelas?select=contrato_id,descricao,valor,data_vencimento,data_pagamento,status&data_vencimento=gte.${iso(Date.now() - 30 * DIA).slice(0, 10)}&data_vencimento=lte.${iso(Date.now() + 30 * DIA).slice(0, 10)}`),
    get("recorrencias?select=contrato_id,valor_mensal,dia_vencimento,ativo"),
    get("custos?select=nome,categoria,valor_mensal,ativo,escopo"),
  ]);
  const ativas = recorrencias.filter((r) => r.ativo);
  return {
    mrr: ativas.reduce((s, r) => s + Number(r.valor_mensal), 0),
    custos_mensais: custos.filter((c) => c.ativo).reduce((s, c) => s + Number(c.valor_mensal), 0),
    contratos, recorrencias_ativas: ativas, parcelas_30d_para_tras_e_frente: parcelas, custos,
  };
}

async function dadosAnuncios() {
  const mes = iso(Date.now() - 30 * DIA).slice(0, 10);
  const [campanhas, metricas, criativos, analises] = await Promise.all([
    get("ads_campanhas?select=*"),
    get(`ads_metricas_diarias?select=*&data=gte.${mes}&order=data.asc`),
    get("ads_criativos?select=*"),
    get("ads_analises_ia?select=tipo,periodo_inicio,periodo_fim,resumo,gerado_em&order=gerado_em.desc&limit=2"),
  ]);
  return { campanhas, metricas_30d: metricas, criativos, analises_anteriores: analises };
}

async function dadosConteudo() {
  return get(`fila_posts?select=conta,tipo,status,pauta,agendado_para,publicado_em,erro&criado_em=gte.${iso(Date.now() - 14 * DIA)}`);
}

// Radar de clientes da COT-AI (assinatura, uso e sinal por empresa), via Edge Function cotai-radar
async function dadosCotai() {
  const res = await fetch(`https://${PROJETO}.supabase.co/functions/v1/cotai-radar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, apikey: KEY, "Content-Type": "application/json" },
    body: "{}",
  });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || `cotai-radar ${res.status}`);
  return j.empresas.map(({ empresa_id, cnpj, ...resto }) => resto);
}

async function anteriores(tipo) {
  return get(`fila_ia?select=concluido_em,resultado_md&tipo=eq.${tipo}&status=eq.concluido&order=concluido_em.desc&limit=2`);
}

async function coletar(tipo) {
  const tentar = async (fn) => { try { return await fn(); } catch (e) { return { erro_ao_coletar: String(e.message).slice(0, 200) }; } };
  switch (tipo) {
    case "relatorio_semanal":
      return { comercial: await tentar(dadosComerciais), financeiro: await tentar(dadosFinanceiros),
               clientes_cotai: await tentar(dadosCotai),
               conteudo_14d: await tentar(dadosConteudo), relatorios_anteriores: await tentar(() => anteriores(tipo)) };
    case "briefing_conselho":
      return { comercial: await tentar(dadosComerciais), financeiro: await tentar(dadosFinanceiros),
               anuncios: await tentar(dadosAnuncios), conteudo_14d: await tentar(dadosConteudo),
               clientes_cotai: await tentar(dadosCotai),
               radar_mercado: await tentar(() => get("mercado_relatorios?select=cadencia,periodo_inicio,periodo_fim,resumo,gerado_em&order=gerado_em.desc&limit=2")),
               briefings_anteriores: await tentar(() => anteriores(tipo)) };
    case "analise_anuncios":
      return { anuncios: await tentar(dadosAnuncios), analises_anteriores: await tentar(() => anteriores(tipo)) };
    case "analise_metricas":
      return { comercial: await tentar(dadosComerciais), financeiro: await tentar(dadosFinanceiros),
               emails_resend: await tentar(() => get("resend_eventos?select=tipo,processado_em&order=processado_em.desc&limit=300")),
               analises_anteriores: await tentar(() => anteriores(tipo)) };
    default:
      throw new Error(`tipo desconhecido: ${tipo}`);
  }
}

async function pegar() {
  const [pedido] = await get("fila_ia?select=*&status=eq.pendente&order=criado_em.asc&limit=1");
  if (!pedido) return console.log(JSON.stringify({ pedido: null }));
  // Reserva só se continuar pendente (evita duas rodadas no mesmo pedido)
  const reservado = await api("PATCH", `fila_ia?id=eq.${pedido.id}&status=eq.pendente`,
    { status: "processando", iniciado_em: new Date().toISOString() });
  if (!reservado?.length) return console.log(JSON.stringify({ pedido: null }));
  const dados = await coletar(pedido.tipo);
  console.log(JSON.stringify({ pedido: reservado[0], dados }, null, 1));
}

async function concluir(id, arquivo) {
  const md = readFileSync(arquivo, "utf8").trim();
  if (md.length < 50) throw new Error("resultado vazio ou curto demais");
  await api("PATCH", `fila_ia?id=eq.${id}`,
    { status: "concluido", resultado_md: md, erro: null, concluido_em: new Date().toISOString() }, "return=minimal");
  console.log("concluído");
}

async function falhar(id, motivo) {
  await api("PATCH", `fila_ia?id=eq.${id}`,
    { status: "erro", erro: String(motivo || "falha").slice(0, 500), concluido_em: new Date().toISOString() }, "return=minimal");
  console.log("marcado como erro");
}

const [cmd, a, b] = process.argv.slice(2);
const acoes = { uso, "tem-pedido": temPedido, pegar, concluir: () => concluir(a, b), falhar: () => falhar(a, b) };
if (!acoes[cmd]) {
  console.error("uso: node operario.mjs uso|tem-pedido|pegar|concluir <id> <arquivo.md>|falhar <id> <motivo>");
  process.exit(1);
}
acoes[cmd]().catch((e) => { console.error(e.message); process.exit(1); });
