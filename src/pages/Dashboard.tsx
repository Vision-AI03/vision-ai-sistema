import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Users, Calendar, Mail, MessageSquare, DollarSign, TrendingUp, CheckSquare, AlertTriangle, Clock,
  Plus, FileText, Upload, Target, Bot, BarChart2, MessageCircle,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, isWithinInterval, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

interface KpiData {
  leadsDoMes: number;
  reunioesAgendadas: number;
  taxaAberturaEmail: number;
  taxaRespostaWhatsapp: number;
  faturamentoMes: number;
  margemLiquida: number;
  custosMes: number;
}

interface LeadRecente {
  id: string;
  nome: string;
  empresa: string | null;
  score: number | null;
  status: string | null;
  criado_em: string | null;
}

interface PagamentoProximo {
  id: string;
  cliente_nome: string;
  valor: number;
  data_vencimento: string;
  status: string;
}

interface WeeklyLeads {
  semana: string;
  leads: number;
}

interface MonthlyRevenue {
  mes: string;
  desenvolvimento: number;
  recorrente: number;
}

interface TarefaHoje {
  id: string;
  titulo: string;
  prioridade: string;
  data_vencimento: string | null;
  status: string;
  concluida: boolean;
  tipo: "atrasada" | "hoje" | "proxima";
}

interface ContratoPendente {
  id: string;
  cliente_nome: string;
  status: string;
  valor_total: number;
  criado_em: string;
}

function getScoreColor(score: number | null) {
  if (!score) return "bg-muted text-muted-foreground";
  if (score >= 71) return "bg-success/20 text-success";
  if (score >= 41) return "bg-warning/20 text-warning";
  return "bg-destructive/20 text-destructive";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [kpis, setKpis] = useState<KpiData>({
    leadsDoMes: 0, reunioesAgendadas: 0, taxaAberturaEmail: 0,
    taxaRespostaWhatsapp: 0, faturamentoMes: 0, margemLiquida: 0, custosMes: 0,
  });
  const [leadsRecentes, setLeadsRecentes] = useState<LeadRecente[]>([]);
  const [pagamentosProximos, setPagamentosProximos] = useState<PagamentoProximo[]>([]);
  const [tarefasHoje, setTarefasHoje] = useState<TarefaHoje[]>([]);
  const [contratosPendentes, setContratosPendentes] = useState<ContratoPendente[]>([]);
  const [emailStats, setEmailStats] = useState({ fila: 0, enviados: 0, abertos: 0, taxaAbertura: 0 });
  const [weeklyLeadsData, setWeeklyLeadsData] = useState<WeeklyLeads[]>([]);
  const [monthlyRevenueData, setMonthlyRevenueData] = useState<MonthlyRevenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [metaFaturamento, setMetaFaturamento] = useState(0);
  const [metaMRR, setMetaMRR] = useState(0);
  const [mrrAtual, setMrrAtual] = useState(0);
  const [wppStats, setWppStats] = useState({ recebidas: 0, enviadas: 0, leads_novos: 0 });
  const [ultimoRelatorio, setUltimoRelatorio] = useState<{ semana_inicio: string; semana_fim: string; total_leads_abordados: number; taxa_conversao: number; taxa_resposta: number } | null>(null);
  const [sugestoesIaPendentes, setSugestoesIaPendentes] = useState(0);

  useEffect(() => {
    fetchDashboardData();
    fetchMetas();
    fetchAiStats();
  }, []);

  async function fetchAiStats() {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();

    const [wppRes, relatorioRes, sugestoesRes] = await Promise.all([
      supabase
        .from("whatsapp_mensagens")
        .select("direcao, lead_id")
        .gte("created_at", todayStart),
      supabase
        .from("relatorios_semanais")
        .select("semana_inicio, semana_fim, total_leads_abordados, taxa_conversao, metadata")
        .order("semana_inicio", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("analise_lead_ia")
        .select("id", { count: "exact", head: true })
        .eq("aplicado", false),
    ]);

    const msgs = wppRes.data || [];
    const recebidas = msgs.filter((m: any) => m.direcao === "recebida").length;
    const enviadas = msgs.filter((m: any) => m.direcao === "enviada").length;
    const leadsNovos = new Set(msgs.filter((m: any) => m.direcao === "recebida" && m.lead_id).map((m: any) => m.lead_id)).size;
    setWppStats({ recebidas, enviadas, leads_novos: leadsNovos });

    if (relatorioRes.data) {
      setUltimoRelatorio({
        semana_inicio: relatorioRes.data.semana_inicio,
        semana_fim: relatorioRes.data.semana_fim,
        total_leads_abordados: relatorioRes.data.total_leads_abordados || 0,
        taxa_conversao: Number(relatorioRes.data.taxa_conversao || 0),
        taxa_resposta: Number((relatorioRes.data.metadata as any)?.taxa_resposta || 0),
      });
    }

    setSugestoesIaPendentes(sugestoesRes.count || 0);
  }

  async function fetchMetas() {
    const { data } = await supabase.from("metas_financeiras").select("*") as any;
    if (data) {
      const fat = data.find((m: any) => m.tipo === "faturamento_mes");
      const mrr = data.find((m: any) => m.tipo === "mrr");
      if (fat) setMetaFaturamento(Number(fat.valor));
      if (mrr) setMetaMRR(Number(mrr.valor));
    }
  }

  async function fetchDashboardData() {
    setLoading(true);
    const now = new Date();
    const today = format(now, "yyyy-MM-dd");
    const mesAtualInicio = startOfMonth(now).toISOString();
    const mesAtualFim = endOfMonth(now).toISOString();

    const [
      leadsRes, leadsRecentesRes, parcelasRes, recorrenciasRes, custosRes, allLeadsRes, tarefasRes,
      contratosRes, emailContatosRes, comunicEmailRes,
    ] = await Promise.all([
      supabase.from("leads").select("*").gte("criado_em", mesAtualInicio).lte("criado_em", mesAtualFim),
      supabase.from("leads").select("id, nome, empresa, score, status, criado_em").order("criado_em", { ascending: false }).limit(5),
      supabase.from("parcelas").select("id, valor, data_vencimento, status, contrato_id, contratos(cliente_nome)").gte("data_vencimento", today).lte("data_vencimento", format(addDays(now, 7), "yyyy-MM-dd")).eq("status", "pendente").order("data_vencimento", { ascending: true }).limit(10),
      supabase.from("recorrencias").select("valor_mensal").eq("ativo", true),
      supabase.from("custos").select("valor_mensal").eq("ativo", true),
      supabase.from("leads").select("criado_em").gte("criado_em", subDays(now, 30).toISOString()),
      supabase.from("tarefas").select("id, titulo, prioridade, data_vencimento, status, concluida").eq("concluida", false).lte("data_vencimento", today).order("prioridade", { ascending: true }).order("data_vencimento", { ascending: true }).limit(5),
      supabase.from("contratos").select("id, cliente_nome, status, valor_total, criado_em").in("status", ["pendente_assinatura", "rascunho", "enviado"]).order("criado_em", { ascending: false }).limit(5),
      supabase.from("email_contatos").select("status_envio, enviado_em, aberto_em").gte("created_at", mesAtualInicio),
      supabase.from("comunicacoes").select("status").eq("tipo", "email").eq("direcao", "enviado").gte("criado_em", mesAtualInicio).lte("criado_em", mesAtualFim),
    ]);

    // KPIs
    const leadsMes = leadsRes.data || [];
    const totalLeads = leadsMes.length;
    const reunioes = leadsMes.filter(l => l.reuniao_agendada).length;
    // Taxa de abertura de email — mesma fonte/definição da tela Métricas (comunicacoes + tracking Resend)
    const comunicEmail = comunicEmailRes.data || [];
    const emailEnviadosCom = comunicEmail.length;
    const emailAbertosCom = comunicEmail.filter((e: any) => e.status === "aberto" || e.status === "clicado").length;
    const taxaAberturaEmail = emailEnviadosCom > 0 ? Math.round((emailAbertosCom / emailEnviadosCom) * 100) : 0;
    const whatsEnviados = leadsMes.filter(l => l.whatsapp_enviado).length;
    const whatsRespondidos = leadsMes.filter(l => l.whatsapp_respondido).length;
    const taxaWhatsapp = whatsEnviados > 0 ? Math.round((whatsRespondidos / whatsEnviados) * 100) : 0;

    const { data: parcelasPagas } = await supabase
      .from("parcelas").select("valor").eq("status", "pago")
      .gte("data_pagamento", format(startOfMonth(now), "yyyy-MM-dd"))
      .lte("data_pagamento", format(endOfMonth(now), "yyyy-MM-dd"));

    const receitaDev = (parcelasPagas || []).reduce((sum, p) => sum + Number(p.valor), 0);
    const receitaRecorrente = (recorrenciasRes.data || []).reduce((sum, r) => sum + Number(r.valor_mensal), 0);
    setMrrAtual(receitaRecorrente);
    const faturamento = receitaDev + receitaRecorrente;
    const totalCustos = (custosRes.data || []).reduce((sum, c) => sum + Number(c.valor_mensal), 0);
    const margem = faturamento - totalCustos;

    setKpis({
      leadsDoMes: totalLeads, reunioesAgendadas: reunioes, taxaAberturaEmail,
      taxaRespostaWhatsapp: taxaWhatsapp, faturamentoMes: faturamento, margemLiquida: margem, custosMes: totalCustos,
    });

    setLeadsRecentes(leadsRecentesRes.data || []);

    // Payments
    const pagamentos: PagamentoProximo[] = (parcelasRes.data || []).map((p: any) => ({
      id: p.id, cliente_nome: p.contratos?.cliente_nome || "—", valor: Number(p.valor), data_vencimento: p.data_vencimento, status: p.status,
    }));
    setPagamentosProximos(pagamentos);

    // Tarefas de hoje (atrasadas + hoje)
    const tarefasData: TarefaHoje[] = (tarefasRes.data || []).map((t: any) => {
      let tipo: "atrasada" | "hoje" | "proxima" = "proxima";
      if (t.data_vencimento) {
        if (t.data_vencimento < today) tipo = "atrasada";
        else if (t.data_vencimento === today) tipo = "hoje";
      }
      return { ...t, tipo };
    });
    setTarefasHoje(tarefasData);

    // Contratos pendentes
    setContratosPendentes((contratosRes.data as ContratoPendente[]) || []);

    // Email stats
    const emailContatos = emailContatosRes.data || [];
    const filaHoje = emailContatos.filter((e: any) => e.status_envio === "pendente").length;
    const enviadosHoje = emailContatos.filter((e: any) => e.status_envio === "enviado" || e.enviado_em).length;
    const abertosHoje = emailContatos.filter((e: any) => e.aberto_em).length;
    const txAbertura = enviadosHoje > 0 ? Math.round((abertosHoje / enviadosHoje) * 100) : 0;
    setEmailStats({ fila: filaHoje, enviados: enviadosHoje, abertos: abertosHoje, taxaAbertura: txAbertura });

    // Weekly leads
    const allLeads = allLeadsRes.data || [];
    const weeks: WeeklyLeads[] = [];
    for (let i = 3; i >= 0; i--) {
      const refDate = subDays(now, i * 7);
      const weekStart = startOfWeek(refDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(refDate, { weekStartsOn: 1 });
      const count = allLeads.filter(l => { if (!l.criado_em) return false; const d = new Date(l.criado_em); return isWithinInterval(d, { start: weekStart, end: weekEnd }); }).length;
      weeks.push({ semana: format(weekStart, "dd/MM", { locale: ptBR }), leads: count });
    }
    setWeeklyLeadsData(weeks);

    // Monthly revenue
    const monthlyData: MonthlyRevenue[] = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = subMonths(now, i);
      const mStart = format(startOfMonth(monthDate), "yyyy-MM-dd");
      const mEnd = format(endOfMonth(monthDate), "yyyy-MM-dd");
      const { data: mParcelas } = await supabase.from("parcelas").select("valor").eq("status", "pago").gte("data_pagamento", mStart).lte("data_pagamento", mEnd);
      const dev = (mParcelas || []).reduce((s, p) => s + Number(p.valor), 0);
      monthlyData.push({ mes: format(monthDate, "MMM", { locale: ptBR }), desenvolvimento: dev, recorrente: receitaRecorrente });
    }
    setMonthlyRevenueData(monthlyData);
    setLoading(false);
  }

  async function handleToggleTarefa(id: string, concluida: boolean) {
    const { error } = await supabase.from("tarefas").update({ concluida, status: concluida ? "concluida" : "a_fazer" }).eq("id", id);
    if (error) {
      toast({ title: "Erro ao atualizar tarefa", variant: "destructive" });
    } else {
      toast({ title: concluida ? "Tarefa concluída!" : "Tarefa reaberta" });
      setTarefasHoje(prev => prev.filter(t => t.id !== id));
    }
  }

  const kpiCards = [
    { title: "Leads do Mês", value: String(kpis.leadsDoMes), icon: Users },
    { title: "Reuniões Agendadas", value: String(kpis.reunioesAgendadas), icon: Calendar },
    { title: "Taxa Abertura Email", value: `${kpis.taxaAberturaEmail}%`, icon: Mail },
    { title: "Taxa Resposta WhatsApp", value: `${kpis.taxaRespostaWhatsapp}%`, icon: MessageSquare },
    { title: "Faturamento do Mês", value: formatCurrency(kpis.faturamentoMes), icon: DollarSign },
    { title: "Margem Líquida", value: formatCurrency(kpis.margemLiquida), icon: TrendingUp, subtitle: kpis.faturamentoMes > 0 ? `${Math.round((kpis.margemLiquida / kpis.faturamentoMes) * 100)}%` : "0%" },
  ];

  const chartTooltipStyle = { backgroundColor: "hsl(0 0% 7%)", border: "1px solid hsl(0 0% 14%)", borderRadius: "8px", color: "hsl(0 0% 95%)" };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="gap-1.5" variant="outline" onClick={() => navigate("/tarefas")}>
          <Plus className="h-3.5 w-3.5" />Nova Tarefa
        </Button>
        <Button size="sm" className="gap-1.5" variant="outline" onClick={() => navigate("/crm")}>
          <Users className="h-3.5 w-3.5" />Novo Lead
        </Button>
        <Button size="sm" className="gap-1.5" variant="outline" onClick={() => navigate("/contratos")}>
          <FileText className="h-3.5 w-3.5" />Gerar Contrato
        </Button>
        <Button size="sm" className="gap-1.5" variant="outline" onClick={() => navigate("/comunicacoes")}>
          <Upload className="h-3.5 w-3.5" />Importar Emails
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiCards.map((kpi) => (
          <Card key={kpi.title} className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{kpi.title}</CardTitle>
              <kpi.icon className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">{kpi.value}</div>
              {"subtitle" in kpi && kpi.subtitle && (
                <p className="text-xs text-muted-foreground mt-1">{kpi.subtitle}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Metas de Faturamento e MRR */}
      {(metaFaturamento > 0 || metaMRR > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {metaFaturamento > 0 && (
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4 text-primary" />Meta de Faturamento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between mb-2">
                  <p className="text-xl font-bold text-primary">{formatCurrency(kpis.faturamentoMes)}</p>
                  <p className="text-xs text-muted-foreground">de {formatCurrency(metaFaturamento)}</p>
                </div>
                <Progress value={Math.min((kpis.faturamentoMes / metaFaturamento) * 100, 100)} className="h-2.5" />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {Math.round((kpis.faturamentoMes / metaFaturamento) * 100)}% — faltam {formatCurrency(Math.max(metaFaturamento - kpis.faturamentoMes, 0))}
                </p>
              </CardContent>
            </Card>
          )}
          {metaMRR > 0 && (
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4 text-accent" />Meta de MRR</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between mb-2">
                  <p className="text-xl font-bold text-accent">{formatCurrency(mrrAtual)}</p>
                  <p className="text-xs text-muted-foreground">de {formatCurrency(metaMRR)}</p>
                </div>
                <Progress value={Math.min((mrrAtual / metaMRR) * 100, 100)} className="h-2.5" />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {Math.round((mrrAtual / metaMRR) * 100)}% — faltam {formatCurrency(Math.max(metaMRR - mrrAtual, 0))}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Tarefas de Hoje */}
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <CheckSquare className="h-4 w-4 text-warning" />
            <CardTitle className="text-sm">Tarefas de Hoje</CardTitle>
            <Badge variant="outline" className="ml-auto text-xs">{tarefasHoje.length}</Badge>
          </CardHeader>
          <CardContent>
            {tarefasHoje.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma tarefa pendente para hoje 🎉</p>
            ) : (
              <div className="space-y-2">
                {tarefasHoje.map((t) => (
                  <div key={t.id} className="flex items-start gap-2 py-1.5 border-b border-border last:border-0">
                    <Checkbox
                      checked={t.concluida}
                      onCheckedChange={(checked) => handleToggleTarefa(t.id, !!checked)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.titulo}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {t.tipo === "atrasada" && <AlertTriangle className="h-3 w-3 text-destructive" />}
                        {t.tipo === "hoje" && <Clock className="h-3 w-3 text-warning" />}
                        <span className={`text-[10px] ${t.tipo === "atrasada" ? "text-destructive" : "text-muted-foreground"}`}>
                          {t.tipo === "atrasada" ? "Atrasada" : "Vence hoje"}
                        </span>
                        <Badge variant="outline" className="text-[10px] capitalize ml-1">{t.prioridade}</Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cadência de Emails */}
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Mail className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Cadência de Emails</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-3 rounded-lg bg-secondary/30">
                <p className="text-2xl font-bold text-warning">{emailStats.fila}</p>
                <p className="text-[10px] text-muted-foreground">Na fila</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-secondary/30">
                <p className="text-2xl font-bold text-primary">{emailStats.enviados}</p>
                <p className="text-[10px] text-muted-foreground">Enviados</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-secondary/30">
                <p className="text-2xl font-bold text-accent">{emailStats.abertos}</p>
                <p className="text-[10px] text-muted-foreground">Abertos</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-secondary/30">
                <p className="text-2xl font-bold">{emailStats.taxaAbertura}%</p>
                <p className="text-[10px] text-muted-foreground">Taxa abertura</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contratos Pendentes */}
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <FileText className="h-4 w-4 text-accent" />
            <CardTitle className="text-sm">Contratos Pendentes</CardTitle>
            <Badge variant="outline" className="ml-auto text-xs">{contratosPendentes.length}</Badge>
          </CardHeader>
          <CardContent>
            {contratosPendentes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum contrato pendente</p>
            ) : (
              <div className="space-y-2">
                {contratosPendentes.map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{c.cliente_nome}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant="outline" className="text-[10px] capitalize">{c.status.replace("_", " ")}</Badge>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-primary ml-2">{formatCurrency(c.valor_total)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* IA / WhatsApp Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* WhatsApp Hoje */}
        <Card className="glass-card cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate("/crm")}>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <MessageCircle className="h-4 w-4 text-green-500" />
            <CardTitle className="text-sm">WhatsApp Hoje</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xl font-bold text-green-500">{wppStats.recebidas}</p>
                <p className="text-[10px] text-muted-foreground">Recebidas</p>
              </div>
              <div>
                <p className="text-xl font-bold text-primary">{wppStats.enviadas}</p>
                <p className="text-[10px] text-muted-foreground">Enviadas</p>
              </div>
              <div>
                <p className="text-xl font-bold">{wppStats.leads_novos}</p>
                <p className="text-[10px] text-muted-foreground">Leads ativos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Último Relatório */}
        <Card className="glass-card cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate("/relatorios")}>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <BarChart2 className="h-4 w-4 text-accent" />
            <CardTitle className="text-sm">Último Relatório</CardTitle>
          </CardHeader>
          <CardContent>
            {ultimoRelatorio ? (
              <>
                <p className="text-xs text-muted-foreground mb-2">
                  {new Date(ultimoRelatorio.semana_inicio + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} —{" "}
                  {new Date(ultimoRelatorio.semana_fim + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xl font-bold">{ultimoRelatorio.total_leads_abordados}</p>
                    <p className="text-[10px] text-muted-foreground">Abordados</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-primary">{ultimoRelatorio.taxa_resposta}%</p>
                    <p className="text-[10px] text-muted-foreground">Responderam</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-accent">{ultimoRelatorio.taxa_conversao}%</p>
                    <p className="text-[10px] text-muted-foreground">Conversão</p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-3">Nenhum relatório ainda</p>
            )}
          </CardContent>
        </Card>

        {/* Sugestões da IA */}
        <Card className="glass-card cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate("/crm")}>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Bot className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Sugestões da IA</CardTitle>
            {sugestoesIaPendentes > 0 && (
              <Badge className="ml-auto text-[10px] bg-warning/20 text-warning border-warning/20">
                {sugestoesIaPendentes} pendente{sugestoesIaPendentes > 1 ? "s" : ""}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {sugestoesIaPendentes === 0 ? (
              <div className="text-center py-3">
                <Bot className="h-8 w-8 text-muted-foreground/30 mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Nenhuma sugestão pendente</p>
              </div>
            ) : (
              <div className="text-center py-2">
                <p className="text-3xl font-bold text-primary">{sugestoesIaPendentes}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  mudança{sugestoesIaPendentes > 1 ? "s" : ""} de estágio para revisar
                </p>
                <p className="text-xs text-primary mt-2">Abrir CRM →</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="glass-card">
          <CardHeader><CardTitle className="text-sm">Leads por Semana</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyLeadsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 14%)" />
                <XAxis dataKey="semana" tick={{ fill: "hsl(0 0% 55%)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(0 0% 55%)", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="leads" fill="url(#gradientBar)" radius={[4, 4, 0, 0]} />
                <defs>
                  <linearGradient id="gradientBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(252 100% 64%)" />
                    <stop offset="100%" stopColor="hsl(187 100% 50%)" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader><CardTitle className="text-sm">Faturamento — Últimos 6 Meses</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyRevenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 14%)" />
                <XAxis dataKey="mes" tick={{ fill: "hsl(0 0% 55%)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(0 0% 55%)", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(value: number) => formatCurrency(value)} />
                <Legend wrapperStyle={{ color: "hsl(0 0% 55%)" }} />
                <Bar dataKey="desenvolvimento" name="Desenvolvimento" fill="hsl(252 100% 64%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="recorrente" name="Recorrente" fill="hsl(187 100% 50%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="glass-card">
          <CardHeader><CardTitle className="text-sm">Leads Recentes</CardTitle></CardHeader>
          <CardContent>
            {leadsRecentes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum lead cadastrado ainda.</p>
            ) : (
              <div className="space-y-3">
                {leadsRecentes.map((lead) => (
                  <div key={lead.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium">{lead.nome}</p>
                      <p className="text-xs text-muted-foreground">{lead.empresa || "Sem empresa"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-xs ${getScoreColor(lead.score)}`}>{lead.score ?? 0}</Badge>
                      <Badge variant="outline" className="text-xs capitalize">{lead.status || "novo"}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader><CardTitle className="text-sm">Pagamentos Próximos (7 dias)</CardTitle></CardHeader>
          <CardContent>
            {pagamentosProximos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum pagamento pendente nos próximos 7 dias.</p>
            ) : (
              <div className="space-y-3">
                {pagamentosProximos.map((pag) => (
                  <div key={pag.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium">{pag.cliente_nome}</p>
                      <p className="text-xs text-muted-foreground">Vence em {format(new Date(pag.data_vencimento + "T00:00:00"), "dd/MM/yyyy")}</p>
                    </div>
                    <span className="text-sm font-semibold text-warning">{formatCurrency(pag.valor)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
