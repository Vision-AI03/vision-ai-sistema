# Decisões — vision-ai-sistema

Registro de decisões arquiteturais (ADR enxuto). Ordem cronológica.

---

## ADR-001 — Webhook em vez de polling para Apify

**Data:** 2026-06-10

**Contexto:** Extrações de leads no Apify (Google Search Scraper + Instagram Profile Scraper) demoram mais que o timeout de Edge Functions do Supabase. Polling síncrono dentro da função estoura o limite e perde o resultado.

**Decisão:** Arquitetura assíncrona — `prospeccao-apify` dispara o run e retorna; `prospeccao-webhook` recebe o resultado. Nunca usar polling síncrono para operações longas.

---

## ADR-002 — Refs Supabase separados e nunca confundidos

**Data:** 2026-06-10

**Contexto:** Existem dois projetos Supabase ativos: AJM Transportes (`mzmohsypcdywevqvafan`, cliente) e Vision AI interno (`sfezwprbanvxsnwgvkhh`). Confundir refs em migrations, secrets ou deploys corrompe ambiente de produção alheio.

**Decisão:** Toda migration/secret/deploy confirma o ref antes de executar. Vision AI interno = `sfezwprbanvxsnwgvkhh`; AJM = `mzmohsypcdywevqvafan`.

---

## ADR-003 — Saída do Lovable (junho/2026)

**Data:** 2026-06-10

**Contexto:** Desenvolvimento estava acoplado ao Lovable (gateway de IA em `ai.gateway.lovable.dev` e workflow visual). Migração para Claude Code dá controle total sobre código, custos de IA e deploy.

**Decisão:** Desenvolvimento 100% via Claude Code; Edge Functions chamam `api.anthropic.com` diretamente (`CLAUDE_API_KEY` em secrets). Frontend continua React/Vite/Tailwind/shadcn, deploy Vercel via GitHub.

---

## ADR-004 — Migração de IA para API Anthropic direta (Haiku/Sonnet)

**Data:** 2026-06-10

**Contexto:** Após a saída do Lovable (ADR-003), 9 Edge Functions usavam o gateway Lovable (`ai.gateway.lovable.dev`, modelo `google/gemini-3-flash-preview`) e 2 chamavam Gemini direto (`generativelanguage.googleapis.com`, `gemini-2.0-flash`). Manter 2 provedores aumenta a superfície de erro, custo e dependência externa; consolidar em Anthropic alinha com o resto do dev (Claude Code) e dá controle de modelo/preço por chamada.

**Decisão:** Todas as 11 funções de IA passam a chamar `api.anthropic.com/v1/messages` via helper compartilhado `supabase/functions/_shared/anthropic.ts` (`callClaude`, `callClaudeMessages`, `callClaudeWithTool`). Mapeamento de modelos:

- **Haiku (`claude-haiku-4-5-20251001`)** — classificação/extração, ~10x mais barato: `enrich-lead`, `analyze-lead-stage`, `parse-pdf-contacts`, `extract-contract-data`, `generate-onboarding-tasks`.
- **Sonnet (`claude-sonnet-4-6`)** — geração de texto longo/HTML/contratos: `generate-email`, `generate-niche-emails`, `generate-proposal`, `fill-contract`, `fill-contract-model`, `generate-weekly-report`.

PDFs migrados de `image_url` (formato OpenAI) para `document` block (formato Anthropic nativo). Tool use migrado de `function`/`tool_calls` (OpenAI) para `tool_use` block (Anthropic). Secret único: `CLAUDE_API_KEY`. Lovable e Gemini removidos.
