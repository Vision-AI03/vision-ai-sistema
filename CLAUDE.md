# CLAUDE.md — vision-ai-sistema

Sistema de gestão interno da Vision AI (agência de IA, founder solo: Wesley).
É o cockpit operacional: CRM, prospecção, comunicações, propostas, contratos, financeiro, tarefas, reuniões, métricas, relatórios, automações.

## Regras críticas (NUNCA violar)
- Supabase deste projeto: `sfezwprbanvxsnwgvkhh` (Vision AI interno). NUNCA confundir com `mzmohsypcdywevqvafan` (AJM Transportes — cliente).
- Windows + PowerShell: comandos sequenciais, NUNCA usar `&&`. Usar `;` ou comandos separados.
- Toda feature nova com listagem DEVE ter botões de editar e excluir.
- Prompts/mudanças cirúrgicas e não-disruptivas: nunca refatorar módulos inteiros sem pedido explícito.
- SQL (migrations) e mudanças de frontend sempre separados e identificados.
- Ao final de qualquer mudança, incluir comandos de deploy (git add/commit/push — Vercel auto-deploy via GitHub).

## Stack
- Frontend: React 18 + Vite + TypeScript + Tailwind + shadcn/ui (Radix), TanStack Query, dnd-kit (Kanban). Desenvolvimento 100% via Claude Code.
- Backend: Supabase (Postgres + RLS + Edge Functions Deno + pg_cron).
- IA nas Edge Functions: API Anthropic direta (`api.anthropic.com`), key em `CLAUDE_API_KEY` via secrets do Supabase. Modelos: `claude-haiku` para classificação/triagem, `claude-sonnet` para geração.
- Email: Resend (+ resend-webhook para tracking).
- Prospecção: Apify (Google Search Scraper + Instagram Profile Scraper) via `prospeccao-apify` + `prospeccao-webhook` (arquitetura assíncrona por webhook — NÃO usar polling síncrono, dá timeout).
- WhatsApp: UazAPI (webhook em `whatsapp-webhook`).

## Estrutura
- `src/pages/` — uma página por módulo (Dashboard, CRM, Prospeccao, Comunicacoes, Propostas, Contratos, Financeiro, Tarefas, Reunioes, Metricas, Relatorios, Notificacoes, Automacoes, Credenciais, Integracoes, Backup).
- `src/components/{crm,comunicacoes,contratos,tarefas}/` — componentes por domínio.
- `supabase/functions/` — 20+ Edge Functions (enriquecimento de lead, geração de email/proposta/contrato, análise de estágio com IA, relatório semanal, notificações).
- `supabase/migrations/` — migrations versionadas. Nova migration = novo arquivo timestampado, nunca editar antigas.

## Convenções
- Nomes de tabelas/colunas em português (`extracoes`, `parcelas`, `recorrencias`, `custos`, `criado_em`).
- Edge Functions: validar auth via `supabase.auth.getClaims(token)`, CORS headers padrão (copiar de função existente).
- Toasts via `use-toast` para feedback de toda ação do usuário.
- Datas com `date-fns` + locale `ptBR`.

## Fluxo de negócio
Prospecção (Apify extrai leads) → CRM Kanban (enriquecimento + análise IA de estágio via WhatsApp) → Comunicações (email frio por nicho via Resend) → Propostas (geração IA) → Contratos (templates + preenchimento IA) → Financeiro (contratos, parcelas, recorrências/MRR, custos) → Relatório semanal automático.

## Nichos-alvo
Transportadoras (caso AJM como prova), clínicas, imobiliárias, contabilidades. Geografia: interior de SP → MG.
