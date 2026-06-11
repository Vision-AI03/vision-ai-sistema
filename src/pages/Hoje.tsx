import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, Clock, DollarSign, CheckSquare, Sparkles,
  Phone, ExternalLink, Loader2, MessageSquare,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import LeadDrawer from "@/components/crm/LeadDrawer";
import type { Tables } from "@/integrations/supabase/types";

type Lead = Tables<"leads">;

type LeadParado = {
  id: string;
  nome: string;
  empresa: string | null;
  status: string;
  telefone: string | null;
  email: string | null;
  score: number | null;
  prioridade_contato: string | null;
  segmento: string | null;
  ultimo_contato: string;
  dias_parado: number;
};

type ParcelaCaixa = {
  id: string;
  cliente_nome: string;
  descricao: string | null;
  valor: number;
  data_vencimento: string;
  status: string;
  situacao: "vencida" | "a_vencer";
  dias: number;
};

type RecorrenciaMes = {
  id: string;
  cliente_nome: string;
  valor_mensal: number;
  dia_vencimento: number;
  proximo_vencimento: string;
};

type CustoRenovacao = {
  id: string;
  nome: string;
  categoria: string;
  valor_mensal: number;
  data_renovacao: string;
  dias: number;
};

type TarefaCockpit = {
  id: string;
  titulo: string;
  descricao: string | null;
  prioridade: string;
  data_vencimento: string;
  status: string;
  concluida: boolean;
  lead_id: string | null;
  contrato_id: string | null;
  tipo: "atrasada" | "hoje" | "outras";
};

const STATUS_LABELS: Record<string, string> = {
  novo: "Novo",
  enriquecido: "Enriquecido",
  contatado: "Contatado",
  reuniao_agendada: "Reunião Agendada",
};

const PRIORIDADE_PESO: Record<string, number> = {
  imediata: 0,
  alta: 1,
  media: 2,
  baixa: 3,
};

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDataExtenso(d: Date) {
  return format(d, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
}

function capitalizar(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function scoreColorClass(score: number | null) {
  const s = score ?? 0;
  if (s >= 71) return "bg-success/20 text-success";
  if (s >= 41) return "bg-warning/20 text-warning";
  return "bg-muted text-muted-foreground";
}

export default function Hoje() {
  const { toast } = useToast();
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [loadingCaixa, setLoadingCaixa] = useState(true);
  const [loadingTarefas, setLoadingTarefas] = useState(true);

  const [leadsParados, setLeadsParados] = useState<LeadParado[]>([]);
  const [parcelas, setParcelas] = useState<ParcelaCaixa[]>([]);
  const [recorrencias, setRecorrencias] = useState<RecorrenciaMes[]>([]);
  const [custos, setCustos] = useState<CustoRenovacao[]>([]);
  const [tarefas, setTarefas] = useState<TarefaCockpit[]>([]);

  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [togglingTask, setTogglingTask] = useState<string | null>(null);

  const fetchLeadsParados = useCallback(async () => {
    setLoadingLeads(true);
    const { data, error } = await supabase
      .from("v_cockpit_leads_parados" as never)
      .select("*");
    if (!error && data) setLeadsParados(data as unknown as LeadParado[]);
    setLoadingLeads(false);
  }, []);

  const fetchCaixa = useCallback(async () => {
    setLoadingCaixa(true);
    const [parcelasRes, recRes, custosRes] = await Promise.all([
      supabase.from("v_cockpit_caixa_parcelas" as never).select("*"),
      supabase.from("v_cockpit_recorrencias_mes" as never).select("*"),
      supabase.from("v_cockpit_custos_renovacao" as never).select("*"),
    ]);
    if (parcelasRes.data) setParcelas(parcelasRes.data as unknown as ParcelaCaixa[]);
    if (recRes.data) setRecorrencias(recRes.data as unknown as RecorrenciaMes[]);
    if (custosRes.data) setCustos(custosRes.data as unknown as CustoRenovacao[]);
    setLoadingCaixa(false);
  }, []);

  const fetchTarefas = useCallback(async () => {
    setLoadingTarefas(true);
    const { data, error } = await supabase
      .from("v_cockpit_tarefas_hoje" as never)
      .select("*");
    if (!error && data) setTarefas(data as unknown as TarefaCockpit[]);
    setLoadingTarefas(false);
  }, []);

  useEffect(() => {
    fetchLeadsParados();
    fetchCaixa();
    fetchTarefas();
  }, [fetchLeadsParados, fetchCaixa, fetchTarefas]);

  async function abrirLead(leadId: string) {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .maybeSingle();
    if (error || !data) {
      toast({ title: "Não consegui abrir o lead", variant: "destructive" });
      return;
    }
    setDrawerLead(data as Lead);
    setDrawerOpen(true);
  }

  async function gerarEmailIA(lead: LeadParado) {
    setGeneratingFor(lead.id);
    try {
      const { data, error } = await supabase.functions.invoke("generate-email", {
        body: { lead_id: lead.id },
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error("Falha na geração");

      toast({
        title: "📧 Email gerado",
        description: `Rascunho pronto para ${lead.nome}. Abrindo lead para revisar...`,
      });
      // Abre o drawer onde o histórico de comunicações fica disponível
      await abrirLead(lead.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast({ title: "Não consegui gerar o email", description: msg, variant: "destructive" });
    } finally {
      setGeneratingFor(null);
    }
  }

  async function toggleTarefa(tarefa: TarefaCockpit) {
    setTogglingTask(tarefa.id);
    const { error } = await supabase
      .from("tarefas")
      .update({
        concluida: true,
        status: "concluida",
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", tarefa.id);
    if (error) {
      toast({ title: "Erro ao concluir tarefa", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "✓ Tarefa concluída" });
      fetchTarefas();
    }
    setTogglingTask(null);
  }

  async function onLeadStatusChange(leadId: string, newStatus: string) {
    await supabase
      .from("leads")
      .update({ status: newStatus, status_mudou_em: new Date().toISOString() })
      .eq("id", leadId);
    fetchLeadsParados();
  }

  // ── Derivações ──────────────────────────────────────────────────────────
  const pipelineParado = [...leadsParados]
    .sort((a, b) => b.dias_parado - a.dias_parado)
    .slice(0, 8);

  const followUps = [...leadsParados]
    .sort((a, b) => {
      const pa = PRIORIDADE_PESO[a.prioridade_contato ?? ""] ?? 99;
      const pb = PRIORIDADE_PESO[b.prioridade_contato ?? ""] ?? 99;
      if (pa !== pb) return pa - pb;
      return (b.score ?? 0) - (a.score ?? 0);
    })
    .slice(0, 6);

  const totalParcelas7Dias = parcelas.reduce((acc, p) => acc + Number(p.valor || 0), 0);
  const totalCustos15Dias = custos.reduce((acc, c) => acc + Number(c.valor_mensal || 0), 0);

  const totalTarefas = tarefas.length;
  const tarefasAtrasadas = tarefas.filter(t => t.tipo === "atrasada").length;

  const hoje = new Date();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          {capitalizar(formatDataExtenso(hoje))}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {leadsParados.length === 0 && totalParcelas7Dias === 0 && totalTarefas === 0 ? (
            <span>Tudo em dia. Bom trabalho ✨</span>
          ) : (
            <>
              <span className="font-medium text-foreground">{leadsParados.length}</span> leads parados
              {" · "}
              <span className="font-medium text-foreground">{formatBRL(totalParcelas7Dias)}</span> a receber em 7 dias
              {" · "}
              <span className="font-medium text-foreground">{totalTarefas}</span> tarefas
              {tarefasAtrasadas > 0 && (
                <span className="text-destructive"> ({tarefasAtrasadas} atrasada{tarefasAtrasadas > 1 ? "s" : ""})</span>
              )}
            </>
          )}
        </p>
      </div>

      {/* Grid 2x2 dos blocos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pipeline parado */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Pipeline parado
            </CardTitle>
            <Badge variant="secondary" className="font-normal">
              {leadsParados.length} lead{leadsParados.length !== 1 ? "s" : ""}
            </Badge>
          </CardHeader>
          <CardContent>
            {loadingLeads ? (
              <div className="space-y-2">
                {[0, 1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : pipelineParado.length === 0 ? (
              <EmptyState texto="Pipeline em dia 👌" subtexto="Nenhum lead parado há mais de 3 dias." />
            ) : (
              <ul className="divide-y divide-border -mx-2">
                {pipelineParado.map(lead => (
                  <li key={lead.id} className="px-2 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{lead.nome}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {STATUS_LABELS[lead.status] || lead.status}
                        {" · "}
                        <span className={lead.dias_parado >= 7 ? "text-destructive" : ""}>
                          {lead.dias_parado}d parado
                        </span>
                        {lead.telefone && (
                          <>
                            {" · "}
                            <Phone className="inline h-3 w-3 mr-0.5" />
                            {lead.telefone}
                          </>
                        )}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => abrirLead(lead.id)}>
                      Abrir <ExternalLink className="ml-1 h-3 w-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Caixa 7 dias */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-success" />
              Caixa 7 dias
            </CardTitle>
            <span className="text-base font-semibold text-success">
              {formatBRL(totalParcelas7Dias)}
            </span>
          </CardHeader>
          <CardContent>
            {loadingCaixa ? (
              <div className="space-y-2">
                {[0, 1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : parcelas.length === 0 && recorrencias.length === 0 && custos.length === 0 ? (
              <EmptyState texto="Caixa em ordem 💰" subtexto="Sem parcelas, recorrências ou renovações urgentes." />
            ) : (
              <div className="space-y-3">
                {parcelas.length > 0 && (
                  <Bloco titulo="A receber">
                    {parcelas.map(p => (
                      <Linha
                        key={p.id}
                        principal={p.cliente_nome}
                        secundario={`${p.descricao || "Parcela"} · ${format(new Date(p.data_vencimento), "dd/MM")}${p.situacao === "vencida" ? " · VENCIDA" : ""}`}
                        valor={formatBRL(Number(p.valor))}
                        destaque={p.situacao === "vencida" ? "destructive" : "success"}
                      />
                    ))}
                  </Bloco>
                )}

                {recorrencias.length > 0 && (
                  <Bloco titulo="Recorrências do mês">
                    {recorrencias.map(r => (
                      <Linha
                        key={r.id}
                        principal={r.cliente_nome}
                        secundario={`Dia ${r.dia_vencimento}`}
                        valor={formatBRL(Number(r.valor_mensal))}
                      />
                    ))}
                  </Bloco>
                )}

                {custos.length > 0 && (
                  <Bloco titulo={`A pagar (${formatBRL(totalCustos15Dias)} em 15d)`}>
                    {custos.map(c => (
                      <Linha
                        key={c.id}
                        principal={c.nome}
                        secundario={`${c.categoria} · renova em ${c.dias}d`}
                        valor={formatBRL(Number(c.valor_mensal))}
                        destaque="warning"
                      />
                    ))}
                  </Bloco>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tarefas de hoje */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-primary" />
              Tarefas de hoje
            </CardTitle>
            <Badge variant="secondary" className="font-normal">
              {totalTarefas}
            </Badge>
          </CardHeader>
          <CardContent>
            {loadingTarefas ? (
              <div className="space-y-2">
                {[0, 1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : tarefas.length === 0 ? (
              <EmptyState texto="Sem tarefas pra hoje ✅" subtexto="Aproveita pra prospectar." />
            ) : (
              <ul className="space-y-2">
                {tarefas.map(t => (
                  <li key={t.id} className="flex items-start gap-2.5 group">
                    <Checkbox
                      checked={false}
                      disabled={togglingTask === t.id}
                      onCheckedChange={() => toggleTarefa(t)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{t.titulo}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.tipo === "atrasada" && (
                          <span className="text-destructive font-medium">Atrasada</span>
                        )}
                        {t.tipo === "atrasada" && " · "}
                        {format(new Date(t.data_vencimento), "dd/MM")}
                        {" · "}
                        {t.prioridade}
                      </p>
                    </div>
                    {togglingTask === t.id && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Follow-ups sugeridos */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Follow-ups sugeridos
            </CardTitle>
            <Badge variant="secondary" className="font-normal">
              {followUps.length} prio
            </Badge>
          </CardHeader>
          <CardContent>
            {loadingLeads ? (
              <div className="space-y-2">
                {[0, 1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : followUps.length === 0 ? (
              <EmptyState texto="Nenhum follow-up pendente ✨" subtexto="Quando houver lead parado com score alto, ele entra aqui." />
            ) : (
              <ul className="divide-y divide-border -mx-2">
                {followUps.map(lead => (
                  <li key={lead.id} className="px-2 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${scoreColorClass(lead.score)}`}>
                        {lead.score ?? "—"}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{lead.nome}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {lead.empresa || lead.segmento || STATUS_LABELS[lead.status] || lead.status}
                          {lead.prioridade_contato && ` · ${lead.prioridade_contato}`}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="default"
                      disabled={generatingFor === lead.id}
                      onClick={() => gerarEmailIA(lead)}
                    >
                      {generatingFor === lead.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          <MessageSquare className="h-3 w-3 mr-1" />
                          Gerar Email
                        </>
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <LeadDrawer
        lead={drawerLead}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onStatusChange={onLeadStatusChange}
        onLeadUpdate={(l) => setDrawerLead(l)}
        onLeadDelete={() => {
          setDrawerOpen(false);
          fetchLeadsParados();
        }}
      />
    </div>
  );
}

function EmptyState({ texto, subtexto }: { texto: string; subtexto?: string }) {
  return (
    <div className="py-6 text-center">
      <p className="text-sm font-medium text-muted-foreground">{texto}</p>
      {subtexto && <p className="text-xs text-muted-foreground/70 mt-1">{subtexto}</p>}
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-medium mb-1.5">
        {titulo}
      </p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Linha({
  principal, secundario, valor, destaque,
}: {
  principal: string;
  secundario: string;
  valor: string;
  destaque?: "success" | "warning" | "destructive";
}) {
  const corValor =
    destaque === "destructive" ? "text-destructive" :
    destaque === "warning" ? "text-warning" :
    destaque === "success" ? "text-success" :
    "text-foreground";
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm truncate">{principal}</p>
        <p className="text-xs text-muted-foreground truncate">{secundario}</p>
      </div>
      <span className={`text-sm font-medium ${corValor}`}>{valor}</span>
    </div>
  );
}
