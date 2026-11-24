// Estágios do funil COT-AI (porta de entrada) → upsell.
// Fonte única para o Kanban do CRM e o seletor do LeadDrawer.
// Os valores precisam existir na constraint leads_status_check (migration 20261124120000).
export const ESTAGIOS = [
  { id: "novo", title: "Novo" },
  { id: "enriquecido", title: "Enriquecido" },
  { id: "contatado", title: "Abordado" },
  { id: "respondeu", title: "Respondeu" },
  { id: "rotas_recebidas", title: "Rotas recebidas" },
  { id: "cotacao_enviada", title: "Cotação enviada" },
  { id: "onboarding_agendado", title: "Onboarding marcado" },
  { id: "implantacao", title: "Implantação (30d)" },
  { id: "assinante", title: "Assinante" },
  { id: "upsell", title: "Upsell" },
  { id: "perdido", title: "Perdido" },
] as const;

// Mover para cá abre o diálogo que lança contrato, parcelas e recorrência.
export const ESTAGIO_IMPLANTACAO = "implantacao";

export const ESTAGIO_LABEL: Record<string, string> = Object.fromEntries(
  ESTAGIOS.map((e) => [e.id, e.title]),
);
