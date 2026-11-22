---
name: conteudo-instagram
description: Produz os posts de Instagram da Vision AI (@agenciavisionai) e da COT-AI (@cotai.frete) e coloca na fila de aprovação do sistema (tabela fila_posts, tela /conteudo). Use quando pedirem para gerar conteúdo, abastecer/encher a fila, rodar a produção diária de posts, refazer posts com pedido de alteração, ou quando a rotina agendada de conteúdo disparar. Nunca aprova nem publica — só cria rascunhos.
---

# Conteúdo Instagram — produção para a fila de aprovação

Você é o produtor de conteúdo das duas marcas. Seu trabalho termina quando o post está na fila como `rascunho`. Quem aprova é o Wesley, na tela Conteúdo; o sistema agenda e publica sozinho.

**Calendário (já automático, não agende nada):** cada conta publica em dias alternados; no dia de publicação sai 1 post de feed (imagem única ou carrossel) às 12h e 1 Reels às 19h.

## Regras que não se quebram
- Nunca mude status para `aprovado`, nunca chame a função de publicar, nunca mexa em post `aprovado`/`publicado`.
- Todo número, estatística ou fato de mercado precisa de fonte na web, colocada em `referencias`. Sem fonte → não use o número, ou escreva "exemplo".
- Sobre a COT-AI, só afirme o que está em `referencias/cotai.md`. Sobre a Vision AI, o que está em `referencias/solutions.md`. Não invente funcionalidade, cliente, depoimento ou resultado.
- Não nomeie clientes (ex.: AJM) — use "uma transportadora do interior de SP".
- Não repita pauta: confira `pautas_recentes` antes de escolher o tema.
- A CTA é sempre "link na bio". Não peça para comentar nem mandar palavra-chave na DM (pedido do Wesley, 2026-11-22).

## Passo 1 — Ler o estado da fila
```
node .claude/skills/conteudo-instagram/scripts/fila.mjs estado
```
Devolve `faltando` (quanto produzir por conta e tipo nos próximos 8 dias), `pedidos_de_alteracao` e `pautas_recentes`.

Ordem de trabalho:
1. **Pedidos de alteração** primeiro (eles travam o calendário).
2. **Feed** que falta (`<conta>.feed.produzir`).
3. **Reels** que falta (`<conta>.reels.produzir`): siga a seção Reels no fim.

Limite por execução: no máximo 4 peças novas (para caber numa rodada e não lotar a aprovação), das quais no máximo 2 Reels — e, se faltar Reels, pelo menos 1 entra mesmo que ainda falte feed. Se `produzir` for 0 em tudo e não houver pedido, encerre dizendo que a fila está abastecida.

## Passo 2 — Escolher a pauta
Leia a marca antes de criar:
- Vision AI → `referencias/brand.md`, `referencias/solutions.md`, `referencias/hooks_bank.md`, `referencias/ctas_bank.md`
- COT-AI → `referencias/cotai.md`

**Vision AI** — público: dono de PME no interior de SP → MG que ainda não usa IA. Gire os nichos para não repetir o mesmo duas vezes seguidas: transportadoras, clínicas, imobiliárias, contabilidades (de vez em quando, um post geral de PME). Gire também as soluções: atendimento 24/7 no WhatsApp, agente comercial/follow-up, automação financeira/administrativa, CRM/sistema sob medida. A COT-AI pode aparecer como prova ("um sistema que construímos para transportadoras").

**COT-AI** — público: transportador. Gire os 5 pilares de `cotai.md`.

**Mistura de formatos no feed:** alterne imagem única e carrossel (≈ metade de cada). Carrossel quando a pauta precisa de passo a passo, lista ou antes/depois.

## Passo 3 — Pesquisar referências (web)
Para cada pauta, 2–4 buscas (WebSearch/WebFetch), por exemplo:
- dado ou notícia recente do nicho ("clínicas faltas consultas whatsapp pesquisa 2026", "piso mínimo frete ANTT tabela atual", "imobiliárias tempo de resposta leads pesquisa");
- o que está performando no formato ("carrossel instagram transportadora", perfis de referência do nicho).

Guarde 1–4 URLs úteis em `referencias`. Prefira fontes brasileiras e recentes (últimos 12 meses). Use a pesquisa para dar ângulo e prova — não copie texto de ninguém.

## Passo 4 — Criar as artes
Pasta de trabalho (ignorada pelo git): `.conteudo/<AAAA-MM-DD>-<conta>-<slug>/`.

1. Copie o arquivo inteiro `assets/slide-base.html` (com `cp`) para `slide-01.html`, `slide-02.html`… (um arquivo por slide; 1080×1350) e edite cada cópia com Edit. Não recorte a base com sed por padrão de texto — o comentário do topo menciona as tags e o recorte perde o `<style>`.
2. No `<body>`: `data-marca="vision"` ou `data-marca="cotai"`; no `<header>`, logo `logo-vision.png` + "Vision AI" ou `logo-cotai.jpg` + "COT-AI"; no rodapé, o @ da conta (`@agenciavisionai` / `@cotai.frete`). O caminho do logo `../../.claude/skills/conteudo-instagram/assets/...` já funciona a partir dessa pasta.
3. Reescreva só o `<main>` usando os componentes da base (`.tag`, `h1` com `<em>`, `.sub`, `.lista`, `.numero`, `.cta`, `.phone` com `.msg`/`.msg.eu`). Pode ajustar tamanhos de fonte inline quando o texto pedir, mantendo a hierarquia.
4. Regras de arte:
   - Slide 1 é o gancho: problema do cliente, nunca o nome da marca; no máximo ~12 palavras no `h1`.
   - Um destaque colorido (`<em>`) por título.
   - Carrossel 5–7 slides: gancho → problema → dado (com fonte no slide, em texto pequeno) → solução/como funciona → prova/exemplo → CTA. Último slide sem "arrasta →".
   - Imagem única: gancho + 1 linha de valor + elemento visual (mockup `.phone` funciona muito bem).
   - Texto mínimo de 28px; nada encostando nas bordas (margem de 80px).
5. Prévia e revisão visual — obrigatório antes de subir:
   ```
   node .claude/skills/conteudo-instagram/scripts/midia.mjs --previa <conta> <slug> .conteudo/<pasta>/slide-*.html
   ```
   Abra cada JPEG com Read e confira: texto cortado/vazando, sobreposição, contraste, erro de português, logo certo. Corrija e renderize de novo até ficar limpo.
   Carrossel: junte tudo numa folha de contato para revisar de uma vez (na pasta de saída da prévia):
   ```
   ffmpeg -loglevel error -y -i 0.jpg -i 1.jpg -i 2.jpg -i 3.jpg -i 4.jpg -i 5.jpg -filter_complex "[0][1][2][3][4][5]xstack=inputs=6:layout=0_0|w0_0|w0+w1_0|0_h0|w0_h0|w0+w1_h0,scale=1620:-1" folha.jpg
   ```
   Mockup de produto (`.phone`) só mostra mensagens que o produto realmente manda — copie o formato do exemplo (`assets/exemplo-cotai.png`), sem inventar selo ou frase.

## Passo 5 — Legenda
- Primeira linha = gancho (até ~125 caracteres, sem o nome da marca).
- Corpo curto, frases de uma linha, espaço entre blocos; fala com o dono do negócio ("você").
- Uma CTA só, específica (banco em `ctas_bank.md`; COT-AI: "Faça 15 cotações grátis, sem cartão. Link na bio.").
- 4–7 hashtags no fim, do nicho + marca.
- Total ≤ 2.200 caracteres. Emojis com moderação (0–3).

## Passo 6 — Subir e colocar na fila
```
node .claude/skills/conteudo-instagram/scripts/midia.mjs <conta> <slug> .conteudo/<pasta>/slide-*.html
```
Monte `.conteudo/<pasta>/post.json`:
```json
{
  "conta": "vision_ai",
  "tipo": "carrossel",
  "legenda": "…",
  "midia_urls": ["https://…-01.jpg", "https://…-02.jpg"],
  "pauta": "Uma frase: tema + ângulo + por que agora (ex.: clínicas perdem 1 em 4 consultas por falta de confirmação — agente confirma no WhatsApp)",
  "nicho": "clínicas",
  "referencias": ["https://fonte1", "https://fonte2"]
}
```
`tipo`: `imagem` (1 URL), `carrossel` (2–10 URLs), `reels` (1 MP4 + `capa_url` opcional).

```
node .claude/skills/conteudo-instagram/scripts/fila.mjs inserir .conteudo/<pasta>/post.json
```

## Pedido de alteração
Para cada item de `pedidos_de_alteracao`: leia `feedback`, refaça só o que foi pedido (texto, arte ou os dois), suba as artes novas com um slug novo e grave na MESMA linha:
```
node .claude/skills/conteudo-instagram/scripts/fila.mjs revisar <id> .conteudo/<pasta>/post.json
```
O post volta para "Para aprovar". Se o pedido for impossível (ex.: dado que não existe), refaça da melhor forma e explique na `pauta`.

## Reels
Vídeo vertical 1080×1920 de 30–45s: cenas HTML animadas + narração em voz (ElevenLabs) + legenda. Pauta, pesquisa, regras de marca e legenda do post são as mesmas do feed (Passos 2, 3 e 5). Não reaproveite a pauta de um post de feed recente.

**Roteiro (6–8 cenas, ~110–150 palavras de fala no total):**
gancho (0–3s: dor do cliente, frase curta, nunca a marca) → o problema acontecendo no celular (ex.: cliente chamando sem resposta) → consequência/dado (com fonte na tela, texto pequeno) → a virada (a solução) → solução em ação no celular (conversa completa, com "digitando…") → um segundo benefício (no celular ou em lista) → CTA.
**CTA do Reels é sempre "link na bio"** (ex.: "Clica no link da bio e pede seu diagnóstico gratuito" + botão `.cta` "Link na bio →"). Nunca peça para comentar palavra-chave. A legenda do post termina com a mesma CTA.
**O celular é o protagonista:** pelo menos 2 cenas com o WhatsApp no celular, cada uma com uma conversa que faz sentido sozinha. Fala em português falado, frases curtas, números por extenso ("onze da noite", não "23h"), sem sigla que a voz leia errado.

**Cenas:**
1. Copie a base inteira com `cp`: `assets/reels-base.html` → `.conteudo/<pasta>/cena-01.html`, `cena-02.html`… e edite cada uma com Edit (mesmas regras de marca/logo do Passo 4). Se for gerar por script, recorte a partir de `<body data-marca` — o comentário do topo cita `<main>` e um regex desde o início quebra o arquivo (vídeo branco).
2. Uma ideia por cena, pouco texto: `h1` de até ~8 palavras; texto mínimo 32px.
3. Anime a entrada dos elementos com `.entra` ou `.pop` e o atraso em `style="--d:0.8s"` (tempo 0 = início da cena). Distribua as entradas ao longo da fala.
4. Celular: copie o modelo comentado no fim da base (moldura, ilha, barra de status, cabeçalho do WhatsApp, barra de mensagem). Verde à direita (`.msg.eu`) = quem segura o celular; cinza = o outro lado. Cada mensagem com `class="msg chega" style="--d:…"`, uma a cada 1,5–2s; antes de cada resposta do agente, um `.digitando chega` com `--d` e `--ate` (= `--d` da resposta). Horários coerentes com a história (status bar = hora da última mensagem). Nome do contato fictício e genérico do nicho ("Clínica Bem Estar", "Transportes Rota Sul"). Cena só com o celular: sem legenda e com `duracao` que cubra todas as mensagens + 1s. Celular com título na mesma cena: `class="phone menor"`.
5. A legenda da fala entra sozinha no `<div data-legenda>`. Apague esse div nas cenas de celular, na de CTA e onde o texto da tela já repete a fala.

**Roteiro em `.conteudo/<pasta>/roteiro.json`:**
```json
{ "cenas": [
  { "html": "cena-01.html", "fala": "Seu cliente mandou mensagem às onze da noite. Quem respondeu?" },
  { "html": "cena-02.html", "fala": "Um agente de IA responde na hora e já agenda.", "duracao": 5 }
] }
```
A cena dura a fala + 0,5s; use `duracao` (segundos) para segurar mais (ex.: mockup com várias mensagens) ou em cena sem fala. `voz` e `musica` são opcionais (padrão: voz "Lucas", sem música).

**Gerar e revisar (obrigatório):**
```
node .claude/skills/conteudo-instagram/scripts/reels.mjs .conteudo/<pasta>/roteiro.json
```
Leva ~1 min a cada 10s de vídeo. Gera `reel.mp4`, `capa.jpg` (fim da cena 1) e `folha.jpg` (fim de cada cena). Abra a `folha.jpg` com Read e confira texto cortado, sobreposição com a legenda, contraste e português; para ver um momento da animação: `ffmpeg -loglevel error -y -ss <segundo> -i reel.mp4 -frames:v 1 -vf scale=540:-1 quadro.jpg`. Corrija e gere de novo (a narração fica em cache; só texto de fala alterado gasta crédito).

**Subir e enfileirar:**
```
node .claude/skills/conteudo-instagram/scripts/midia.mjs <conta> <slug> .conteudo/<pasta>/reel.mp4 .conteudo/<pasta>/capa.jpg
```
No `post.json`: `"tipo": "reels"`, `"midia_urls": [<url do .mp4>]`, `"capa_url": <url do .jpg>`, e a `pauta` com o roteiro resumido. Depois `fila.mjs inserir` (ou `revisar`, se for pedido de alteração de um Reels).

## Fim da execução
Responda com um resumo curto: o que foi criado (conta, tipo, pauta) e o que foi refeito. Não cole as legendas inteiras.
