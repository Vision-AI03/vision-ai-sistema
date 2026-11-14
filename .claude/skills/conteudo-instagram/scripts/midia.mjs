#!/usr/bin/env node
// Renderiza slides HTML em JPEG 1080x1350 e sobe as mídias para o bucket público "posts".
//
//   node midia.mjs <conta> <slug> <arquivo> [arquivo...]
//   node midia.mjs --previa <conta> <slug> <arquivo> [arquivo...]   (só renderiza; imprime os JPEGs locais)
//
// conta: vision_ai | cot_ai. Arquivos aceitos: .html (vira JPEG), .png/.jpg/.jpeg (vira JPEG), .mp4 (sobe como está).
// Imprime JSON: { "urls": [...] } na mesma ordem dos arquivos.
// Chave: SUPABASE_SERVICE_ROLE_KEY no ambiente, ou lida pela CLI do Supabase (projeto já logado).

import { execFileSync, execSync } from "node:child_process";
import { existsSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PROJETO = "sfezwprbanvxsnwgvkhh";
const BASE = `https://${PROJETO}.supabase.co`;
const LARGURA = 1080;
const ALTURA = 1350;

const args = process.argv.slice(2);
const PREVIA = args[0] === "--previa";
const [conta, slug, ...arquivos] = PREVIA ? args.slice(1) : args;
if (!["vision_ai", "cot_ai"].includes(conta) || !slug || arquivos.length === 0) {
  console.error("uso: node midia.mjs <vision_ai|cot_ai> <slug> <arquivo> [arquivo...]");
  process.exit(1);
}

function chave() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const out = execSync(`supabase projects api-keys --project-ref ${PROJETO} -o json`, {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  });
  const k = JSON.parse(out).find((x) => x.id === "service_role" || x.name === "service_role");
  if (!k?.api_key) throw new Error("service_role não encontrada; defina SUPABASE_SERVICE_ROLE_KEY");
  return k.api_key;
}

function navegador() {
  const candidatos = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const achado = candidatos.find((c) => existsSync(c));
  if (!achado) throw new Error("Chrome/Chromium não encontrado; defina CHROME_PATH");
  return achado;
}

const tmp = mkdtempSync(join(tmpdir(), "conteudo-"));

function paraJpeg(entrada, saida) {
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", entrada, "-q:v", "2", saida], { stdio: "inherit" });
}

function renderizar(html, i) {
  const png = join(tmp, `${i}.png`);
  execFileSync(navegador(), [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
    `--user-data-dir=${join(tmp, "perfil")}`, "--no-first-run", "--no-default-browser-check",
    `--window-size=${LARGURA},${ALTURA}`, "--virtual-time-budget=6000",
    `--screenshot=${png}`, pathToFileURL(resolve(html)).href,
  ], { stdio: "ignore", timeout: 60_000 });
  if (!existsSync(png)) throw new Error(`Falha ao renderizar ${html}`);
  return png;
}

// Storage às vezes devolve 5xx passageiro (Cloudflare 520); tenta 3 vezes.
async function subir(key, caminho, arquivo, tipo) {
  let res;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    res = await fetch(`${BASE}/storage/v1/object/posts/${caminho}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": tipo, "x-upsert": "true" },
      body: readFileSync(arquivo),
    });
    if (res.ok || res.status < 500) break;
    await new Promise((r) => setTimeout(r, 3000 * tentativa));
  }
  if (!res.ok) throw new Error(`Upload ${caminho}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return `${BASE}/storage/v1/object/public/posts/${caminho}`;
}

const key = PREVIA ? null : chave();
const dia = new Date().toISOString().slice(0, 10);
const urls = [];

for (const [i, arquivo] of arquivos.entries()) {
  const ext = extname(arquivo).toLowerCase();
  const n = String(i + 1).padStart(2, "0");
  if (ext === ".mp4") {
    if (PREVIA) { urls.push(resolve(arquivo)); continue; }
    urls.push(await subir(key, `${conta}/${dia}-${slug}-${n}.mp4`, arquivo, "video/mp4"));
    continue;
  }
  let origem = arquivo;
  if (ext === ".html") origem = renderizar(arquivo, i);
  else if (![".png", ".jpg", ".jpeg"].includes(ext)) throw new Error(`Formato não suportado: ${basename(arquivo)}`);
  const jpg = join(tmp, `${i}.jpg`);
  paraJpeg(origem, jpg);
  if (PREVIA) { urls.push(jpg); continue; }
  urls.push(await subir(key, `${conta}/${dia}-${slug}-${n}.jpg`, jpg, "image/jpeg"));
}

console.log(JSON.stringify({ urls }, null, 2));
