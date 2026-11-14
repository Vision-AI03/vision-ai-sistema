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
- Sem o número real de WhatsApp ou link: a CTA é sempre "link na bio" ou palavra-chave na DM.

## Passo 1 — Ler o estado da fila
```
node .claude/skills/conteudo-instagram/scripts/fila.mjs estado
```
Devolve `faltando` (quanto produzir por conta e tipo nos próximos 8 dias), `pedidos_de_alteracao` e `pautas_recentes`.

Ordem de trabalho:
1. **Pedidos de alteração** primeiro (eles travam o calendário).
2. **Feed** que falta (`<conta>.feed.produzir`).
3. **Reels**: veja a seção Reels no fim. Enquanto o pipeline de vídeo não estiver liberado, pule.

Limite por execução: no máximo 4 peças novas (para caber numa rodada e não lotar a aprovação). Se `produzir` for 0 em tudo e não houver pedido, encerre dizendo que a fila está abastecida.

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
Pipeline de vídeo (animação com mockup + narração com voz clonada do Wesley; depois avatar) ainda em construção. Até esta seção ser atualizada, não produza Reels — os horários das 19h ficam vazios no calendário e isso é esperado.

## Fim da execução
Responda com um resumo curto: o que foi criado (conta, tipo, pauta) e o que foi refeito. Não cole as legendas inteiras.
