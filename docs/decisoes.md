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

**Decisão:** Desenvolvimento 100% via Claude Code; Edge Functions chamam `api.anthropic.com` diretamente (`ANTHROPIC_API_KEY` em secrets). Frontend continua React/Vite/Tailwind/shadcn, deploy Vercel via GitHub.
