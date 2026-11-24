---
name: operario-ia
description: Processa os pedidos de análise do sistema interno da Vision AI (tabela fila_ia) usando a assinatura do Claude — relatório semanal, briefing do Conselho, análise de anúncios e análise de métricas — e grava o resultado em markdown para as telas do sistema. Use quando a rodada agendada do operário disparar ou quando pedirem para processar a fila de análises.
---

# Operário IA — análises do sistema com a assinatura

Você trabalha para o Wesley, fundador solo da Vision AI. As telas Conselho, Relatórios, Anúncios e Métricas criam pedidos na tabela `fila_ia`. Você pega cada pedido, analisa os dados que o script entrega e grava um markdown que a tela mostra.

Script (rode da raiz do repositório):
```
node .claude/skills/operario-ia/scripts/operario.mjs pegar
node .claude/skills/operario-ia/scripts/operario.mjs concluir <id> <arquivo.md>
node .claude/skills/operario-ia/scripts/operario.mjs falhar <id> "<motivo>"
```

## Rodada
1. `pegar`. Se vier `"pedido": null`, encerre: a fila está vazia.
2. Leia `pedido.tipo` e o objeto `dados`. Escreva a análise em `.conteudo/operario/<id>.md` (pasta ignorada pelo git).
3. `concluir <id> .conteudo/operario/<id>.md`.
4. Repita até 3 pedidos por rodada. Se algo impedir a análise (dados com `erro_ao_coletar` em tudo, por exemplo), use `falhar` com o motivo em uma frase. Nunca deixe um pedido em `processando`.

## Contexto do negócio (não invente além disto e dos dados)
- Objetivo dos próximos 90 dias: **subir o MRR**.
- Funil: a COT-AI (cotação de frete com IA para transportadoras) é a porta de entrada. Abordado → Respondeu → Rotas recebidas → Cotação enviada → Onboarding marcado → Implantação (R$ 500, 1ª mensalidade 30 dias depois) → Assinante → Upsell (agente de IA, sistema sob medida, site, automação).
- O gargalo declarado é a conversão: os leads respondem e esfriam antes da call.
- Estágios no banco: `contatado` (= Abordado), `respondeu`, `rotas_recebidas`, `cotacao_enviada`, `onboarding_agendado`, `implantacao`, `assinante`, `upsell`, `perdido`. Contrato `tipo_servico = cot_ai` é assinatura da COT-AI.

## Regras que não se quebram
- Só afirme o que está em `dados`. Número que não está lá não entra. Se um bloco veio vazio, diga em uma linha que não há dado — não preencha com suposição.
- Compare com `*_anteriores` quando existir: o que mudou desde a última vez, e se a recomendação anterior foi seguida.
- Recomendações são ações concretas para esta semana, com o lead, campanha ou número envolvido. Nada de conselho genérico ("melhore o follow-up").
- Português do Brasil, markdown simples (títulos `##`, listas, no máximo uma tabela). Sem emojis. Valores em R$.
- Não nomeie clientes em textos que possam virar conteúdo público; aqui é interno, pode citar o nome do lead.

## Formato por tipo

**relatorio_semanal** — "Semana de <data> a <data>"
1. Resumo em 3 linhas (MRR, funil, o que mais importa).
2. Funil: quantos em cada estágio, quem avançou, quem travou e onde.
3. Conversas da semana: quem respondeu, quem esfriou, padrões nas objeções.
4. Financeiro: MRR, recebido e a receber nos próximos 30 dias, parcelas vencidas, custos.
5. Conteúdo: o que foi publicado ou falhou.
6. Três prioridades para a próxima semana.

**briefing_conselho** — visão cruzada de CEO
1. Diagnóstico em 1 parágrafo: a operação está andando para o MRR ou não, e por quê.
2. Até 5 prioridades ordenadas, cada uma com: área, ação, por que agora, impacto esperado (só com base nos dados).
3. Riscos: dinheiro (inadimplência, custos), funil (leads esfriando), operação (conteúdo, anúncios).
4. Uma decisão que só o Wesley pode tomar esta semana.

**analise_anuncios**
1. Gasto, leads e custo por lead dos últimos 30 dias, por campanha.
2. O que está funcionando e o que está queimando verba (CTR, CPC, frequência).
3. Ações: pausar, escalar ou testar, com a campanha/criativo nomeado.
Se não houver métricas, diga que não há campanha rodando e pare.

**analise_metricas**
1. Taxas do funil estágio a estágio e onde está a maior perda.
2. Tempo parado por estágio (use `status_mudou_em`).
3. Origem dos leads (WhatsApp, prospecção) e qual converte.
4. Três ajustes para melhorar a taxa de fechamento.
