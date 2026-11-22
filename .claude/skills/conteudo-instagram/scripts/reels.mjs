#!/usr/bin/env node
// Monta um Reels (MP4 1080x1920, 30fps) a partir de cenas HTML animadas + narração ElevenLabs.
//
//   node reels.mjs <pasta>/roteiro.json
//
// roteiro.json:
//   {
//     "voz": "7lu3ze7orhWaNeSPowWx",            (opcional; padrão VOZ_PADRAO)
//     "musica": "caminho/trilha.mp3",           (opcional; fica em volume baixo embaixo da voz)
//     "cenas": [
//       { "html": "cena-01.html", "fala": "Texto narrado nesta cena." },
//       { "html": "cena-02.html", "fala": "", "duracao": 2.5 }      (sem fala: duracao obrigatória)
//     ]
//   }
// A cena dura o tempo da fala + 0,5s (ou "duracao", se maior). Animações CSS da cena começam no tempo 0.
// O texto da fala vai para o elemento [data-legenda] da cena, se existir.
//
// Saída na mesma pasta: reel.mp4, capa.jpg (fim da cena 1) e folha.jpg (fim de cada cena, para revisão).
// A narração fica em cache (fala-<hash>.mp3): re-renderizar sem mudar o texto não gasta crédito.
// Chave: ELEVENLABS_API_KEY no ambiente.

import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const LARGURA = 1080;
const ALTURA = 1920;
const FPS = 30;
const FOLGA = 0.5; // respiro depois da fala, em segundos
const VOZ_PADRAO = "7lu3ze7orhWaNeSPowWx"; // "Lucas - Social Media Voice" (biblioteca ElevenLabs, PT-BR)
const MODELO_VOZ = "eleven_multilingual_v2";

const arquivoRoteiro = process.argv[2];
if (!arquivoRoteiro || !existsSync(arquivoRoteiro)) {
  console.error("uso: node reels.mjs <pasta>/roteiro.json");
  process.exit(1);
}
const pasta = dirname(resolve(arquivoRoteiro));
const roteiro = JSON.parse(readFileSync(arquivoRoteiro, "utf8"));
const voz = roteiro.voz || VOZ_PADRAO;
if (!Array.isArray(roteiro.cenas) || roteiro.cenas.length === 0) throw new Error("roteiro sem cenas");

const ff = (args) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...args], { stdio: "inherit" });
const duracaoAudio = (arq) => Number(execFileSync("ffprobe", [
  "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", arq,
], { encoding: "utf8" }).trim());

// --- Narração -----------------------------------------------------------------
async function narrar(texto) {
  const hash = createHash("sha1").update(`${voz}|${MODELO_VOZ}|${texto}`).digest("hex").slice(0, 12);
  const arq = join(pasta, `fala-${hash}.mp3`);
  if (existsSync(arq)) return arq;
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY não definida");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voz}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: texto, model_id: MODELO_VOZ, language_code: "pt",
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  writeFileSync(arq, Buffer.from(await res.arrayBuffer()));
  return arq;
}

// --- Chrome via DevTools Protocol ------------------------------------------------
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

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function abrirChrome(tmp) {
  const porta = 9300 + Math.floor(Math.random() * 600);
  const proc = spawn(navegador(), [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--mute-audio",
    `--remote-debugging-port=${porta}`, `--user-data-dir=${join(tmp, "perfil")}`,
    "--no-first-run", "--no-default-browser-check", `--window-size=${LARGURA},${ALTURA}`, "about:blank",
  ], { stdio: "ignore" });
  let alvo;
  for (let i = 0; i < 50 && !alvo; i++) {
    await espera(200);
    try {
      const lista = await (await fetch(`http://127.0.0.1:${porta}/json/list`)).json();
      alvo = lista.find((t) => t.type === "page");
    } catch { /* ainda subindo */ }
  }
  if (!alvo) { proc.kill(); throw new Error("Chrome não abriu a porta de depuração"); }

  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((ok, erro) => { ws.onopen = ok; ws.onerror = erro; });
  let seq = 0;
  const pendentes = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    const p = d.id && pendentes.get(d.id);
    if (!p) return;
    pendentes.delete(d.id);
    d.error ? p.erro(new Error(d.error.message)) : p.ok(d.result);
  };
  const enviar = (method, params = {}) => new Promise((ok, erro) => {
    const id = ++seq;
    pendentes.set(id, { ok, erro });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const avaliar = async (expressao) => {
    const r = await enviar("Runtime.evaluate", { expression: expressao, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  await enviar("Emulation.setDeviceMetricsOverride", { width: LARGURA, height: ALTURA, deviceScaleFactor: 1, mobile: false });
  return { enviar, avaliar, fechar: () => { ws.close(); proc.kill(); } };
}

async function gravarCena(chrome, html, fala, segundos, dirQuadros, primeiro) {
  if (!existsSync(html)) throw new Error(`cena não encontrada: ${html}`);
  // Marca o documento atual para saber quando o novo realmente carregou.
  await chrome.avaliar("window.__cenaAnterior = true");
  await chrome.enviar("Page.navigate", { url: pathToFileURL(html).href });
  let pronto = false;
  for (let i = 0; i < 150 && !pronto; i++) {
    await espera(100);
    pronto = await chrome.avaliar("!window.__cenaAnterior && document.readyState === 'complete'").catch(() => false);
  }
  if (!pronto) throw new Error(`cena não carregou: ${html}`);
  await chrome.avaliar(`(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
    const leg = document.querySelector("[data-legenda]");
    if (leg) leg.textContent = ${JSON.stringify(fala ?? "")};
  })()`);
  const total = Math.round(segundos * FPS);
  for (let f = 0; f < total; f++) {
    const ms = (f / FPS) * 1000;
    await chrome.avaliar(`new Promise((ok) => {
      for (const a of document.getAnimations()) { a.pause(); a.currentTime = ${ms}; }
      requestAnimationFrame(() => ok());
    })`);
    const { data } = await chrome.enviar("Page.captureScreenshot", { format: "jpeg", quality: 92 });
    writeFileSync(join(dirQuadros, `${String(primeiro + f).padStart(5, "0")}.jpg`), Buffer.from(data, "base64"));
  }
  return total;
}

// --- Montagem ---------------------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), "reels-"));
const dirQuadros = join(tmp, "quadros");
const dirFolha = join(tmp, "folha");
mkdirSync(dirQuadros);
mkdirSync(dirFolha);

const chrome = await abrirChrome(tmp);
const resumo = [];
const audios = [];
let quadro = 0;
try {
  for (const [i, cena] of roteiro.cenas.entries()) {
    const fala = (cena.fala ?? "").trim();
    let segundos = cena.duracao ?? 0;
    const audioCena = join(tmp, `cena-${i}.wav`);
    if (fala) {
      const mp3 = await narrar(fala);
      segundos = Math.max(segundos, duracaoAudio(mp3) + FOLGA);
      segundos = Math.ceil(segundos * FPS) / FPS;
      ff(["-i", mp3, "-af", "apad", "-t", String(segundos), "-ar", "44100", "-ac", "2", audioCena]);
    } else {
      if (!segundos) throw new Error(`cena ${i + 1} sem fala precisa de "duracao"`);
      segundos = Math.ceil(segundos * FPS) / FPS;
      ff(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", String(segundos), audioCena]);
    }
    const n = await gravarCena(chrome, join(pasta, cena.html), fala, segundos, dirQuadros, quadro);
    const ultimo = join(dirQuadros, `${String(quadro + n - 1).padStart(5, "0")}.jpg`);
    copyFileSync(ultimo, join(dirFolha, `${String(i + 1).padStart(2, "0")}.jpg`));
    if (i === 0) copyFileSync(ultimo, join(pasta, "capa.jpg"));
    quadro += n;
    audios.push(audioCena);
    resumo.push({ cena: cena.html, segundos: Number((n / FPS).toFixed(2)) });
  }
} finally {
  chrome.fechar();
}

const listaAudio = join(tmp, "audios.txt");
writeFileSync(listaAudio, audios.map((a) => `file '${a.replaceAll("\\", "/")}'`).join("\n"));
const narracao = join(tmp, "narracao.wav");
ff(["-f", "concat", "-safe", "0", "-i", listaAudio, "-c", "copy", narracao]);

const saida = join(pasta, "reel.mp4");
const entradaVideo = ["-framerate", String(FPS), "-i", join(dirQuadros, "%05d.jpg")];
const codecs = [
  "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(FPS),
  "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-movflags", "+faststart", "-shortest",
];
if (roteiro.musica) {
  const musica = resolve(pasta, roteiro.musica);
  ff([...entradaVideo, "-i", narracao, "-stream_loop", "-1", "-i", musica,
    "-filter_complex", "[2:a]volume=0.12[m];[1:a][m]amix=inputs=2:duration=first:normalize=0[a]",
    "-map", "0:v", "-map", "[a]", ...codecs, saida]);
} else {
  ff([...entradaVideo, "-i", narracao, "-map", "0:v", "-map", "1:a", ...codecs, saida]);
}

const n = roteiro.cenas.length;
const colunas = Math.min(n, 5);
ff(["-framerate", "1", "-i", join(dirFolha, "%02d.jpg"),
  "-vf", `scale=324:-1,tile=${colunas}x${Math.ceil(n / colunas)}:padding=8:color=white`,
  "-frames:v", "1", "-q:v", "3", join(pasta, "folha.jpg")]);

try { rmSync(tmp, { recursive: true, force: true }); } catch { /* Chrome ainda segurando o perfil */ }
const duracao = Number((quadro / FPS).toFixed(1));
console.log(JSON.stringify({
  mp4: saida, capa: join(pasta, "capa.jpg"), folha: join(pasta, "folha.jpg"), duracao_s: duracao, cenas: resumo,
}, null, 2));
if (duracao < 5 || duracao > 90) console.error(`atenção: Reels com ${duracao}s (alvo: 15–45s)`);
