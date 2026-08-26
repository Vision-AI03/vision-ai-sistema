# Vision AI — Roadmap do Ecossistema (Founder Solo)

> Gerado em 10/06/2026. Destino: Obsidian `wiki/vision-ai/`.

## Princípio
O sistema interno é o cockpit. Tudo que você faz mais de 2x por semana entra nele. Tudo que não gera cliente ou caixa é fase 2.

---

## FASE 1 — Cockpit Diário (semana 1–2)
Objetivo: você abre o sistema de manhã e ele te diz o que fazer.

**Nova página: `/hoje` (Home substituindo Dashboard como tela inicial)**
- Bloco "Pipeline": leads parados há +3 dias por estágio, com botão de ação (abrir WhatsApp, gerar follow-up).
- Bloco "Caixa": parcelas a vencer 7 dias, recorrências do mês, custos a renovar.
- Bloco "Follow-ups de hoje": fila gerada por IA (analyze-lead-stage já existe — só falta materializar em fila de tarefas).
- Bloco "Conteúdo": pendência da semana (integra com skill vision-ai-content-creator).

**SQL:** view `v_cockpit_hoje` agregando leads estagnados + parcelas + tarefas vencidas.

## FASE 2 — Prospecção v2 (semana 2–4)
Hoje: extração Apify → tabela. Falta o funil pós-extração.
1. **Score de lead (0–100)** na extração: tem site? tem Instagram ativo? respondeu? Coluna `score` + badge no Kanban. IA: Claude Haiku (barato) classificando em lote.
2. **Cadência automática**: tabela `cadencias` (D0 WhatsApp, D2 email, D5 WhatsApp, D9 break-up). pg_cron diário gera tarefas de toque. Envio de WhatsApp 1º toque = manual assistido (você aperta enviar) — protege o chip e mantém personalização.
3. **Enriquecimento CNPJ**: BrasilAPI / minhareceita.org (grátis) — porte, CNAE, sócios, data de abertura. Edge function `enrich-cnpj`.
4. **Detecção de dor**: scraping do site do lead (já tem capture-lead-website) + Haiku resumindo "sinais de dor de automação" em 2 linhas no LeadCard.

## FASE 3 — Financeiro v2 (semana 4–6)
1. **Conciliação Pix**: API Pix do seu banco (Inter e Cora têm API gratuita p/ PJ) → webhook marca parcela como paga automaticamente.
2. **Cobrança automática**: pg_cron D-3 do vencimento → mensagem WhatsApp/email com link Pix copia-e-cola. Reduz inadimplência sem você lembrar.
3. **DRE simplificado mensal**: receita (parcelas+recorrências) − custos − impostos estimados (Simples ~6%) = lucro real. Card no cockpit.
4. **Margem por cliente**: custo de APIs/infra rateado por contrato → saber se AJM dá lucro de verdade.

## FASE 4 — Contratos & Propostas v2 (semana 6–8)
1. **Assinatura eletrônica**: ZapSign (mais barato no BR, ~R$1–2/doc, API boa) ou Autentique. Edge function `send-to-sign` + webhook de status (enviado → visualizado → assinado). Assinou → cria parcelas no Financeiro automaticamente.
2. **Proposta → Contrato em 1 clique**: proposta aceita herda dados (cliente, escopo, valores) e preenche template.
3. **Alertas de renovação**: contrato com fim em 30 dias → tarefa + sugestão de aditivo (você já fez isso manualmente com AJM — sistematize).

## FASE 5 — Comunicações v2 (semana 8–10)
1. **Inbox WhatsApp unificado**: você já tem whatsapp-webhook e WhatsAppTab por lead. Falta página `/inbox` com todas as conversas, não-lidas primeiro, resposta direta. É onde você vai viver.
2. **Sugestão de resposta IA**: botão "sugerir" usando histórico + brand voice manual como system prompt.
3. **Sequências de email**: Resend já está pronto; falta agendamento (tabela `email_queue` + pg_cron) para cadências D0/D3/D7.

---

## APIs por função (custo-benefício BR)
| Função | API | Custo |
|---|---|---|
| Dados CNPJ | BrasilAPI / minhareceita.org | Grátis |
| CEP/endereço | BrasilAPI | Grátis |
| Assinatura digital | ZapSign | ~R$1–2/doc |
| Pix recebimento | API Banco Inter ou Cora PJ | Grátis |
| Boleto/cobrança (alternativa) | Asaas | ~R$1–3/cobrança |
| WhatsApp | UazAPI (atual) | Já contratado |
| Email transacional/frio | Resend (atual) | Grátis até 3k/mês |
| Scraping leads | Apify (atual) | Pay-per-result |
| IA triagem/score | Claude Haiku | ~10x mais barato que Sonnet |
| IA geração (proposta/contrato/email) | Claude Sonnet | Atual |
| Transcrição de reunião | Whisper API ou AssemblyAI | ~US$0,006/min |
| Agendamento de reunião | Cal.com (self-host grátis) | Grátis |
| NF-e de serviço | Focus NFe ou eNotas | ~R$0,30–0,60/nota |

Regra de ouro: Haiku para classificar, Sonnet para gerar, humano para enviar (no início).

---

## Aquisição & Branding (paralelo, 90 dias)
O sistema não vende sozinho. Meta única: **5 conversas de venda/semana**.

**Semana típica (ritmo fixo, não negociável):**
- Seg–Sex manhã: 10 toques de prospecção/dia saindo do sistema (cadência da Fase 2). 50/semana → ~5 respostas → 1–2 reuniões.
- Domingo: produção de conteúdo da semana (skill vision-ai-content-creator): 3 posts + 1 vídeo.
- Toda entrega de feature pro AJM → screenshot/vídeo de 30s → post "bastidor" no LinkedIn e Instagram.

**Posicionamento (do seu brand voice manual):** Mentor-Builder, "processo antes da promessa". Conteúdo = mostrar sistema real funcionando (AJM, festa junina QR+Pix), não teoria de IA.

**Canais:**
- LinkedIn: 3 posts/semana (caso real, opinião sobre IA em PME, bastidor). Conectar com 20 donos de transportadora/clínica por semana no interior de SP.
- Instagram: reels dos bastidores + festa junina como case viral local.
- WhatsApp: canal de transmissão para leads que não fecharam (1 conteúdo útil/semana — mantém aquecido).
- Google Meu Negócio: criar perfil da Vision AI em Rio Claro (busca local "automação para empresas" é gratuita).

**Prova social mínima:** 1 vídeo-depoimento do André (AJM) de 60s. Vale mais que o site inteiro.

---

## Claude Code — Estrutura de contexto
```
vision-ai-sistema/
├── CLAUDE.md                  # contexto do repo (arquivo entregue)
├── .claude/skills/
│   └── vision-ai-dev/SKILL.md # padrões de dev (arquivo entregue)
docs/
├── arquitetura.md             # diagrama de tabelas + edge functions
├── decisoes.md                # ADRs: por que webhook e não polling, etc.
└── fluxos/
    ├── prospeccao.md          # Apify → webhook → leads → Kanban
    ├── financeiro.md          # contrato → parcelas → conciliação
    └── whatsapp.md            # UazAPI → webhook → mensagens → análise IA
```
Skills que você já tem no Claude.ai (hormozi-strategist, vision-ai-content-creator, lead-prospector) podem ser copiadas para `.claude/skills/` do repo para o Claude Code usar também.

**Hábito:** toda decisão de arquitetura → 5 linhas em `decisoes.md`. É o que faz o Claude Code parar de sugerir o que você já descartou.

---

## Métricas (revisar toda sexta, 15 min)
1. Toques de prospecção na semana (meta 50)
2. Conversas de venda iniciadas (meta 5)
3. Reuniões marcadas (meta 1–2)
4. MRR e caixa do mês
5. 1 post com melhor desempenho → fazer mais daquilo
