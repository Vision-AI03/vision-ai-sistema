import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  DollarSign, TrendingUp, TrendingDown, Plus, BarChart3, ArrowUpRight, ArrowDownRight,
  Building2, User, CalendarIcon, Filter, Wallet, PieChart, Pencil, Trash2, Target, Loader2, FileText,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, subMonths, differenceInMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CurrencyInput } from "@/components/ui/currency-input";
import { parseBRL } from "@/lib/currency";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart as RechartsPie, Pie, Cell,
} from "recharts";
import type { Tables } from "@/integrations/supabase/types";

type Contrato = Tables<"contratos">;
type Parcela = Tables<"parcelas">;
type Recorrencia = Tables<"recorrencias">;
type Custo = Tables<"custos">;

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const CATEGORIA_LABELS: Record<string, string> = {
  vps: "VPS", api: "API", token: "Token", ferramenta: "Ferramenta", outro: "Outro",
};

const CATEGORIAS_DESPESA = ["Alimentação", "Transporte", "Moradia", "Saúde", "Lazer", "Educação", "Investimentos", "Outros"];
const CATEGORIAS_RECEITA = ["Freelance", "Salário", "Investimentos", "Outros"];
const METODOS_PAGAMENTO = ["Pix", "Cartão Crédito", "Cartão Débito", "Boleto", "Dinheiro"];

const PIE_COLORS = [
  "hsl(252 100% 64%)", "hsl(187 100% 50%)", "hsl(142 71% 45%)", "hsl(38 92% 50%)",
  "hsl(0 72% 51%)", "hsl(280 65% 60%)", "hsl(200 80% 50%)", "hsl(60 70% 50%)",
];

interface TransacaoPessoal {
  id: string;
  user_id: string;
  tipo: string;
  categoria: string;
  descricao: string;
  valor: number;
  data: string;
  recorrente: boolean;
  dia_recorrencia: number | null;
  metodo_pagamento: string | null;
  tags: any;
  created_at: string;
  updated_at: string;
}

export default function Financeiro() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [recorrencias, setRecorrencias] = useState<Recorrencia[]>([]);
  const [custos, setCustos] = useState<Custo[]>([]);
  const [transacoes, setTransacoes] = useState<TransacaoPessoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [mrrData, setMrrData] = useState<any[]>([]);
  const { toast } = useToast();

  // Cost form
  const [novoCustoOpen, setNovoCustoOpen] = useState(false);
  const [custoNome, setCustoNome] = useState("");
  const [custoCategoria, setCustoCategoria] = useState("outro");
  const [custoValor, setCustoValor] = useState("");
  const [custoRenovacao, setCustoRenovacao] = useState("");
  const [custoEscopo, setCustoEscopo] = useState("empresa");
  const [saving, setSaving] = useState(false);

  // Transaction form
  const [novaTransOpen, setNovaTransOpen] = useState(false);
  const [transTipo, setTransTipo] = useState<"receita" | "despesa">("despesa");
  const [transCategoria, setTransCategoria] = useState("");
  const [transDescricao, setTransDescricao] = useState("");
  const [transValor, setTransValor] = useState("");
  const [transData, setTransData] = useState<Date>(new Date());
  const [transMetodo, setTransMetodo] = useState("");
  const [transRecorrente, setTransRecorrente] = useState(false);
  const [transDiaRecorrencia, setTransDiaRecorrencia] = useState("");
  const [transSaving, setTransSaving] = useState(false);

  // Filters for transactions
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroCategoria, setFiltroCategoria] = useState("todos");
  const [filtroMetodo, setFiltroMetodo] = useState("todos");

  // Edit/Delete transações
  const [editTrans, setEditTrans] = useState<TransacaoPessoal | null>(null);
  const [editTransCategoria, setEditTransCategoria] = useState("");
  const [editTransDescricao, setEditTransDescricao] = useState("");
  const [editTransValor, setEditTransValor] = useState("");
  const [editTransData, setEditTransData] = useState<Date>(new Date());
  const [editTransMetodo, setEditTransMetodo] = useState("");
  const [editTransSaving, setEditTransSaving] = useState(false);
  const [deleteTransId, setDeleteTransId] = useState<string | null>(null);

  // Edit recorrência
  const [editRec, setEditRec] = useState<any | null>(null);
  const [editRecNome, setEditRecNome] = useState("");
  const [editRecValor, setEditRecValor] = useState("");
  const [editRecDia, setEditRecDia] = useState("");
  const [editRecStatus, setEditRecStatus] = useState("ativo");
  const [editRecSaving, setEditRecSaving] = useState(false);

  // Metas
  const [metaFaturamento, setMetaFaturamento] = useState(0);
  const [metaMRR, setMetaMRR] = useState(0);
  const [editMetaFat, setEditMetaFat] = useState("");
  const [editMetaMrr, setEditMetaMrr] = useState("");
  const [metasOpen, setMetasOpen] = useState(false);

  useEffect(() => { fetchAll(); fetchMetas(); }, []);

  function findDuplicateRecIds(recs: any[]): string[] {
    const byContrato: Record<string, any[]> = {};
    recs.forEach(r => {
      if (r.ativo) {
        if (!byContrato[r.contrato_id]) byContrato[r.contrato_id] = [];
        byContrato[r.contrato_id].push(r);
      }
    });
    const toCancel: string[] = [];
    for (const activeRecs of Object.values(byContrato)) {
      if (activeRecs.length > 1) {
        activeRecs.sort((a, b) => Number(b.valor_mensal) - Number(a.valor_mensal));
        activeRecs.slice(1).forEach(r => toCancel.push(r.id));
      }
    }
    return toCancel;
  }

  async function fetchAll() {
    setLoading(true);
    const [cRes, pRes, rRes, custRes, tRes] = await Promise.all([
      supabase.from("contratos").select("*").order("criado_em", { ascending: false }),
      supabase.from("parcelas").select("*, contratos(cliente_nome)").order("data_vencimento"),
      supabase.from("recorrencias").select("*, contratos(cliente_nome)"),
      supabase.from("custos").select("*").order("criado_em", { ascending: false }),
      supabase.from("transacoes_pessoais").select("*").order("data", { ascending: false }),
    ]);

    let recorrenciasData: any[] = rRes.data || [];
    const duplicateIds = findDuplicateRecIds(recorrenciasData);
    if (duplicateIds.length > 0) {
      await Promise.all(duplicateIds.map(id => supabase.from("recorrencias").update({ ativo: false }).eq("id", id)));
      const rFixed = await supabase.from("recorrencias").select("*, contratos(cliente_nome)");
      recorrenciasData = rFixed.data || [];
    }

    setContratos(cRes.data || []);
    setParcelas(pRes.data || []);
    setRecorrencias(recorrenciasData);
    setCustos(custRes.data || []);
    setTransacoes((tRes.data as TransacaoPessoal[]) || []);
    await buildChartData(pRes.data || [], recorrenciasData, custRes.data || [], cRes.data || []);
    setLoading(false);
  }

  async function fetchMetas() {
    const { data } = await supabase.from("metas_financeiras").select("*") as any;
    if (data) {
      const fat = data.find((m: any) => m.tipo === "faturamento_mes");
      const mrr = data.find((m: any) => m.tipo === "mrr");
      if (fat) { setMetaFaturamento(Number(fat.valor)); setEditMetaFat(String(fat.valor)); }
      if (mrr) { setMetaMRR(Number(mrr.valor)); setEditMetaMrr(String(mrr.valor)); }
    }
  }

  async function handleSalvarMetas() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast({ title: "Erro de autenticação", variant: "destructive" }); return; }
    const upsertData = [
      { user_id: user.id, tipo: "faturamento_mes", valor: parseBRL(editMetaFat) },
      { user_id: user.id, tipo: "mrr", valor: parseBRL(editMetaMrr) },
    ];
    const { error } = await supabase.from("metas_financeiras").upsert(upsertData as any, { onConflict: "user_id,tipo" });
    if (error) { toast({ title: "Erro ao salvar metas", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Metas atualizadas!" }); setMetaFaturamento(parseBRL(editMetaFat)); setMetaMRR(parseBRL(editMetaMrr)); setMetasOpen(false); }
  }

  async function buildChartData(allParcelas: any[], allRecorrencias: any[], allCustos: Custo[], allContratos: Contrato[]) {
    const now = new Date();
    const mrrAtivo = allRecorrencias.filter((r: Recorrencia) => r.ativo).reduce((s: number, r: Recorrencia) => s + Number(r.valor_mensal), 0);
    const totalCustos = allCustos.filter(c => c.ativo && ((c as any).escopo === 'empresa' || !(c as any).escopo)).reduce((s, c) => s + Number(c.valor_mensal), 0);

    const monthly: any[] = [];
    const mrr: any[] = [];

    for (let i = 5; i >= 0; i--) {
      const monthDate = subMonths(now, i);
      const mStart = format(startOfMonth(monthDate), "yyyy-MM-dd");
      const mEnd = format(endOfMonth(monthDate), "yyyy-MM-dd");
      const label = format(monthDate, "MMM yy", { locale: ptBR });

      const devPagas = allParcelas.filter((p: Parcela) =>
        p.status === "pago" && p.data_pagamento && p.data_pagamento >= mStart && p.data_pagamento <= mEnd
      );
      const dev = devPagas.reduce((s: number, p: Parcela) => s + Number(p.valor), 0);

      const contratadoMes = allContratos
        .filter(c => c.criado_em >= mStart && c.criado_em <= mEnd + "T23:59:59")
        .reduce((s, c) => s + Number(c.valor_total), 0);

      monthly.push({ mes: label, desenvolvimento: dev, recorrente: mrrAtivo, custos: totalCustos, margem: dev + mrrAtivo - totalCustos, faturado: contratadoMes });
      mrr.push({ mes: label, mrr: mrrAtivo });
    }

    setMonthlyData(monthly);
    setMrrData(mrr);
  }

  // ---- HANDLERS ----
  async function handleSalvarCusto() {
    if (!custoNome || !custoValor) { toast({ title: "Preencha nome e valor", variant: "destructive" }); return; }
    setSaving(true);
    const { error } = await supabase.from("custos").insert({
      nome: custoNome.trim(), categoria: custoCategoria, valor_mensal: parseBRL(custoValor),
      data_renovacao: custoRenovacao || null, ativo: true, escopo: custoEscopo,
    } as any);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Custo cadastrado!" }); setNovoCustoOpen(false); setCustoNome(""); setCustoValor(""); setCustoRenovacao(""); setCustoCategoria("outro"); fetchAll(); }
    setSaving(false);
  }

  async function toggleCusto(id: string, ativo: boolean) { await supabase.from("custos").update({ ativo }).eq("id", id); fetchAll(); }

  async function handleExcluirCusto(id: string) {
    const { error } = await supabase.from("custos").delete().eq("id", id);
    if (error) { toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Custo excluído!" }); fetchAll(); }
  }

  async function handleEditarCusto(id: string, nome: string, categoria: string, valorMensal: string, renovacao: string) {
    if (!nome || !valorMensal) { toast({ title: "Preencha nome e valor", variant: "destructive" }); return; }
    const { error } = await supabase.from("custos").update({
      nome: nome.trim(), categoria, valor_mensal: parseBRL(valorMensal), data_renovacao: renovacao || null,
    }).eq("id", id);
    if (error) { toast({ title: "Erro ao editar", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Custo atualizado!" }); fetchAll(); }
  }

  async function handleSalvarTransacao() {
    if (!transDescricao || !transValor || !transCategoria) { toast({ title: "Preencha os campos obrigatórios", variant: "destructive" }); return; }
    setTransSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast({ title: "Erro de autenticação", variant: "destructive" }); setTransSaving(false); return; }
    const { error } = await supabase.from("transacoes_pessoais").insert({
      user_id: user.id, tipo: transTipo, categoria: transCategoria, descricao: transDescricao.trim(),
      valor: parseBRL(transValor), data: format(transData, "yyyy-MM-dd"),
      recorrente: transRecorrente, dia_recorrencia: transRecorrente ? parseInt(transDiaRecorrencia) || null : null,
      metodo_pagamento: transMetodo || null, tags: null,
    } as any);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); }
    else {
      toast({ title: "Transação salva!" }); setNovaTransOpen(false);
      setTransDescricao(""); setTransValor(""); setTransCategoria(""); setTransRecorrente(false); setTransDiaRecorrencia("");
      fetchAll();
    }
    setTransSaving(false);
  }

  function openEditTrans(t: TransacaoPessoal) {
    setEditTrans(t);
    setEditTransCategoria(t.categoria);
    setEditTransDescricao(t.descricao);
    setEditTransValor(String(t.valor));
    setEditTransData(new Date(t.data + "T00:00:00"));
    setEditTransMetodo(t.metodo_pagamento || "");
  }

  async function handleSalvarEditTrans() {
    if (!editTrans) return;
    setEditTransSaving(true);
    const { error } = await supabase.from("transacoes_pessoais").update({
      categoria: editTransCategoria, descricao: editTransDescricao.trim(),
      valor: parseBRL(editTransValor), data: format(editTransData, "yyyy-MM-dd"),
      metodo_pagamento: editTransMetodo || null,
    } as any).eq("id", editTrans.id);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Conta atualizada!" }); setEditTrans(null); fetchAll(); }
    setEditTransSaving(false);
  }

  async function handleExcluirTrans(id: string) {
    const { error } = await supabase.from("transacoes_pessoais").delete().eq("id", id);
    if (error) { toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Conta excluída!" }); setDeleteTransId(null); fetchAll(); }
  }

  function openEditRec(r: any) {
    setEditRec(r);
    setEditRecNome(r.contratos?.cliente_nome || "");
    setEditRecValor(String(r.valor_mensal));
    setEditRecDia(String(r.dia_vencimento));
    setEditRecStatus(r.ativo ? "ativo" : "cancelado");
  }

  async function handleSalvarEditRec() {
    if (!editRec) return;
    setEditRecSaving(true);
    const isAtivo = editRecStatus === "ativo";
    const { error } = await supabase.from("recorrencias").update({
      valor_mensal: parseBRL(editRecValor),
      dia_vencimento: parseInt(editRecDia),
      ativo: isAtivo,
    }).eq("id", editRec.id);
    if (!error && editRecNome.trim() && editRecNome !== editRec.contratos?.cliente_nome) {
      await supabase.from("contratos").update({ cliente_nome: editRecNome.trim() }).eq("id", editRec.contrato_id);
    }
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Recorrência atualizada!" }); setEditRec(null); fetchAll(); }
    setEditRecSaving(false);
  }

  // ---- CALCULATIONS ----
  const now = new Date();
  const mesAtualStart = format(startOfMonth(now), "yyyy-MM-dd");
  const mesAtualEnd = format(endOfMonth(now), "yyyy-MM-dd");

  // Vision AI
  const custosEmpresa = custos.filter(c => ((c as any).escopo === "empresa" || !(c as any).escopo));
  const custosPessoais = custos.filter(c => (c as any).escopo === "pessoal");
  const parcelasPagasMes = parcelas.filter((p: any) => p.status === "pago" && p.data_pagamento && p.data_pagamento >= mesAtualStart && p.data_pagamento <= mesAtualEnd);
  const receitaDev = parcelasPagasMes.reduce((s, p) => s + Number(p.valor), 0);
  const mrrAtual = recorrencias.filter(r => r.ativo).reduce((s, r) => s + Number(r.valor_mensal), 0);
  const totalCustosEmpresaMes = custosEmpresa.filter(c => c.ativo).reduce((s, c) => s + Number(c.valor_mensal), 0);
  const receitaTotal = receitaDev + mrrAtual;
  const margemLiquida = receitaTotal - totalCustosEmpresaMes;
  const margemPct = receitaTotal > 0 ? Math.round((margemLiquida / receitaTotal) * 100) : 0;
  const contratosChurn = contratos.filter(c => c.status === "encerrado").length;

  // Projeção de receita (3 meses)
  const projecaoData = useMemo(() => {
    const proj: { mes: string; valor: number }[] = [];
    for (let i = 1; i <= 3; i++) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const mStart = format(startOfMonth(monthDate), "yyyy-MM-dd");
      const mEnd = format(endOfMonth(monthDate), "yyyy-MM-dd");
      const parcelasPendentes = parcelas.filter((p: any) => p.status === "pendente" && p.data_vencimento >= mStart && p.data_vencimento <= mEnd);
      const valorParcelas = parcelasPendentes.reduce((s: number, p: any) => s + Number(p.valor), 0);
      proj.push({ mes: format(monthDate, "MMM yy", { locale: ptBR }), valor: valorParcelas + mrrAtual });
    }
    return proj;
  }, [parcelas, mrrAtual]);

  // LTV médio
  const ltvMedio = useMemo(() => {
    if (contratos.length === 0) return 0;
    const ltvs = contratos.map(c => {
      const parcelasC = parcelas.filter((p: any) => p.contrato_id === c.id && p.status === "pago");
      const receitaC = parcelasC.reduce((s: number, p: any) => s + Number(p.valor), 0);
      const recC = recorrencias.filter(r => r.contrato_id === c.id && r.ativo);
      const mrrC = recC.reduce((s, r) => s + Number(r.valor_mensal), 0);
      const meses = Math.max(1, differenceInMonths(now, new Date(c.criado_em)));
      return receitaC + (mrrC * meses);
    });
    return ltvs.reduce((s, v) => s + v, 0) / contratos.length;
  }, [contratos, parcelas, recorrencias]);

  // Dev projects
  const projetosDev = contratos.map(c => {
    const pc = parcelas.filter((p: any) => p.contrato_id === c.id);
    const recebido = pc.filter((p: any) => p.status === "pago").reduce((s: number, p: any) => s + Number(p.valor), 0);
    const pendente = pc.filter((p: any) => p.status !== "pago").reduce((s: number, p: any) => s + Number(p.valor), 0);
    return { ...c, recebido, pendente };
  });

  // Contratos em andamento (visão financeira)
  const hoje = format(now, "yyyy-MM-dd");
  const contratosAtivos = contratos.filter(c => c.status !== "encerrado");
  const totalFaturado = contratos.filter(c => c.status === "ativo").reduce((s, c) => s + Number(c.valor_total), 0);
  const caixaRecebido = parcelas.filter((p: any) => ["pago", "confirmado"].includes(p.status)).reduce((s: number, p: any) => s + Number(p.valor), 0);
  const aReceberFaturado = Math.max(totalFaturado - caixaRecebido, 0);
  const totalContratado = contratosAtivos.reduce((s, c) => s + Number(c.valor_total), 0);
  const totalPagoContratos = caixaRecebido;
  const totalAReceber = Math.max(totalContratado - caixaRecebido, 0);
  const percentualRecebido = totalContratado > 0 ? Math.round((caixaRecebido / totalContratado) * 100) : 0;

  const contratosAndamento = contratosAtivos.map(c => {
    const parcelasC = parcelas.filter((p: any) => p.contrato_id === c.id);
    const pagas = parcelasC.filter((p: any) => ["pago", "confirmado"].includes(p.status));
    const pendentes = parcelasC.filter((p: any) => !["pago", "confirmado"].includes(p.status));
    const valorPago = pagas.reduce((s: number, p: any) => s + Number(p.valor), 0);
    const valorPendente = pendentes.reduce((s: number, p: any) => s + Number(p.valor), 0);
    const pct = Number(c.valor_total) > 0 ? Math.min((valorPago / Number(c.valor_total)) * 100, 100) : 0;
    const atrasado = parcelasC.some((p: any) => !["pago", "confirmado"].includes(p.status) && p.data_vencimento < hoje);
    const pendentesOrdenadas = [...pendentes].sort((a: any, b: any) => a.data_vencimento.localeCompare(b.data_vencimento));
    const proximaParcela = pendentesOrdenadas[0] || null;
    const todasOrdenadas = [...parcelasC].sort((a: any, b: any) => a.data_vencimento.localeCompare(b.data_vencimento));
    const numProxima = proximaParcela ? todasOrdenadas.findIndex((p: any) => p.id === proximaParcela.id) + 1 : null;
    return { ...c, valorPago, valorPendente, pct, parcelasPagas: pagas.length, totalParcelas: parcelasC.length, atrasado, proximaParcela, numProxima };
  });

  // Pessoal calcs
  const mesAnteriorStart = format(startOfMonth(subMonths(now, 1)), "yyyy-MM-dd");
  const mesAnteriorEnd = format(endOfMonth(subMonths(now, 1)), "yyyy-MM-dd");

  const transMes = transacoes.filter(t => t.data >= mesAtualStart && t.data <= mesAtualEnd);
  const transMesAnterior = transacoes.filter(t => t.data >= mesAnteriorStart && t.data <= mesAnteriorEnd);

  const receitasPessoaisMes = transMes.filter(t => t.tipo === "receita").reduce((s, t) => s + Number(t.valor), 0);
  const despesasPessoaisMes = transMes.filter(t => t.tipo === "despesa").reduce((s, t) => s + Number(t.valor), 0);
  const saldoPessoalMes = receitasPessoaisMes - despesasPessoaisMes;
  const despesasMesAnterior = transMesAnterior.filter(t => t.tipo === "despesa").reduce((s, t) => s + Number(t.valor), 0);
  const variacaoDespesas = despesasMesAnterior > 0 ? Math.round(((despesasPessoaisMes - despesasMesAnterior) / despesasMesAnterior) * 100) : 0;

  // Despesas por categoria (pie)
  const despesasPorCategoria = useMemo(() => {
    const cats: Record<string, number> = {};
    transMes.filter(t => t.tipo === "despesa").forEach(t => { cats[t.categoria] = (cats[t.categoria] || 0) + Number(t.valor); });
    return Object.entries(cats).map(([name, value]) => ({ name, value }));
  }, [transMes]);

  // Receitas vs Despesas últimos 6 meses (bar)
  const pessoalBarData = useMemo(() => {
    const data: any[] = [];
    for (let i = 5; i >= 0; i--) {
      const md = subMonths(now, i);
      const s = format(startOfMonth(md), "yyyy-MM-dd");
      const e = format(endOfMonth(md), "yyyy-MM-dd");
      const rec = transacoes.filter(t => t.tipo === "receita" && t.data >= s && t.data <= e).reduce((a, t) => a + Number(t.valor), 0);
      const desp = transacoes.filter(t => t.tipo === "despesa" && t.data >= s && t.data <= e).reduce((a, t) => a + Number(t.valor), 0);
      data.push({ mes: format(md, "MMM yy", { locale: ptBR }), receitas: rec, despesas: desp });
    }
    return data;
  }, [transacoes]);

  // Evolução saldo mensal (line)
  const saldoLineData = useMemo(() => {
    const data: any[] = [];
    for (let i = 5; i >= 0; i--) {
      const md = subMonths(now, i);
      const s = format(startOfMonth(md), "yyyy-MM-dd");
      const e = format(endOfMonth(md), "yyyy-MM-dd");
      const rec = transacoes.filter(t => t.tipo === "receita" && t.data >= s && t.data <= e).reduce((a, t) => a + Number(t.valor), 0);
      const desp = transacoes.filter(t => t.tipo === "despesa" && t.data >= s && t.data <= e).reduce((a, t) => a + Number(t.valor), 0);
      data.push({ mes: format(md, "MMM yy", { locale: ptBR }), saldo: rec - desp });
    }
    return data;
  }, [transacoes]);

  // Filtered transactions
  const transacoesFiltradas = transacoes.filter(t => {
    if (filtroTipo !== "todos" && t.tipo !== filtroTipo) return false;
    if (filtroCategoria !== "todos" && t.categoria !== filtroCategoria) return false;
    if (filtroMetodo !== "todos" && t.metodo_pagamento !== filtroMetodo) return false;
    return true;
  });

  const totalCustosPessoaisMes = custosPessoais.filter(c => c.ativo).reduce((s, c) => s + Number(c.valor_mensal), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const chartTooltipStyle = { backgroundColor: "hsl(0 0% 7%)", border: "1px solid hsl(0 0% 14%)", borderRadius: "8px", color: "hsl(0 0% 95%)" };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Financeiro</h1>

      <Tabs defaultValue="empresa" className="space-y-6">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="empresa" className="gap-1.5"><Building2 className="h-4 w-4" />Vision AI</TabsTrigger>
          <TabsTrigger value="pessoal" className="gap-1.5"><User className="h-4 w-4" />Pessoal</TabsTrigger>
        </TabsList>

        {/* ============= VISION AI TAB ============= */}
        <TabsContent value="empresa" className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="glass-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-primary"><DollarSign className="h-5 w-5" /></span>
                  <p className="text-xs text-muted-foreground">Faturamento</p>
                </div>
                <p className="text-xl font-bold text-primary">{formatCurrency(totalFaturado)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Faturado — contratos ativos</p>
                <div className="mt-2 pt-2 border-t border-border/50 space-y-0.5">
                  <p className="text-[10px] text-muted-foreground">Caixa recebido: <span className="text-green-400 font-medium">{formatCurrency(caixaRecebido)}</span></p>
                  <p className="text-[10px] text-muted-foreground">A receber: <span className="text-accent font-medium">{formatCurrency(aReceberFaturado)}</span></p>
                </div>
              </CardContent>
            </Card>
            <SummaryCard icon={<TrendingDown className="h-5 w-5" />} title="Custos do Mês" value={formatCurrency(totalCustosEmpresaMes)} subtitle={`${custosEmpresa.filter(c => c.ativo).length} custos ativos`} accent="text-destructive" />
            <SummaryCard icon={margemLiquida >= 0 ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />} title="Margem Líquida" value={formatCurrency(margemLiquida)} subtitle={`${margemPct}% da receita`} accent={margemLiquida >= 0 ? "text-primary" : "text-destructive"} />
            <SummaryCard icon={<TrendingUp className="h-5 w-5" />} title="MRR Atual" value={formatCurrency(mrrAtual)} subtitle={`${recorrencias.filter(r => r.ativo).length} contratos ativos`} accent="text-accent" />
          </div>

          {/* Contratos em Andamento */}
          {contratosAndamento.length > 0 && (
            <Card className="glass-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />Contratos em Andamento
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                {contratosAndamento.map(c => (
                  <div key={c.id} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{c.cliente_nome}</span>
                      <div className="flex items-center gap-2">
                        <Badge className={c.atrasado ? "bg-destructive/20 text-destructive border-0 text-[10px] px-1.5 py-0 h-4" : "bg-green-500/20 text-green-400 border-0 text-[10px] px-1.5 py-0 h-4"}>
                          {c.atrasado ? "Atrasado" : "Em dia"}
                        </Badge>
                        <span className="text-sm font-bold">{formatCurrency(Number(c.valor_total))}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-secondary rounded-full h-2 overflow-hidden">
                        <div className="h-2 rounded-full bg-green-500 transition-all" style={{ width: `${c.pct}%` }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">{Math.round(c.pct)}% recebido</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {formatCurrency(c.valorPago)} recebidos · {formatCurrency(c.valorPendente)} pendentes{c.proximaParcela ? ` · Parcela ${c.numProxima}/${c.totalParcelas} próxima em ${format(new Date(c.proximaParcela.data_vencimento + "T00:00:00"), "dd/MM")}` : ""}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Metas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="glass-card">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4 text-primary" />Meta de Faturamento</CardTitle>
                <Dialog open={metasOpen} onOpenChange={setMetasOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"><Pencil className="h-3 w-3" />Editar Metas</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-sm bg-card border-border">
                    <DialogHeader><DialogTitle>Definir Metas</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Meta de Faturamento Mensal (R$)</Label>
                        <CurrencyInput value={editMetaFat} onChange={setEditMetaFat} placeholder="50.000,00" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Meta de MRR (R$)</Label>
                        <CurrencyInput value={editMetaMrr} onChange={setEditMetaMrr} placeholder="20.000,00" />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setMetasOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSalvarMetas} className="gradient-primary text-primary-foreground">Salvar</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {metaFaturamento > 0 ? (
                  <>
                    <div className="flex items-end justify-between mb-2">
                      <p className="text-2xl font-bold text-primary">{formatCurrency(totalFaturado)}</p>
                      <p className="text-xs text-muted-foreground">de {formatCurrency(metaFaturamento)}</p>
                    </div>
                    <Progress value={Math.min((totalFaturado / metaFaturamento) * 100, 100)} className="h-3" />
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {Math.round((totalFaturado / metaFaturamento) * 100)}% da meta — faltam {formatCurrency(Math.max(metaFaturamento - totalFaturado, 0))}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground py-2">Defina sua meta clicando em "Editar Metas"</p>
                )}
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4 text-accent" />Meta de MRR</CardTitle>
              </CardHeader>
              <CardContent>
                {metaMRR > 0 ? (
                  <>
                    <div className="flex items-end justify-between mb-2">
                      <p className="text-2xl font-bold text-accent">{formatCurrency(mrrAtual)}</p>
                      <p className="text-xs text-muted-foreground">de {formatCurrency(metaMRR)}</p>
                    </div>
                    <Progress value={Math.min((mrrAtual / metaMRR) * 100, 100)} className="h-3" />
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {Math.round((mrrAtual / metaMRR) * 100)}% da meta — faltam {formatCurrency(Math.max(metaMRR - mrrAtual, 0))}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground py-2">Defina sua meta clicando em "Editar Metas"</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="glass-card">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" />LTV Médio por Cliente</CardTitle></CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-primary">{formatCurrency(ltvMedio)}</p>
                <p className="text-xs text-muted-foreground mt-1">Receita total média por cliente durante o ciclo de vida</p>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-accent" />Projeção de Receita (3 meses)</CardTitle></CardHeader>
              <CardContent className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={projecaoData}>
                    <XAxis dataKey="mes" tick={{ fill: "hsl(0 0% 55%)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="valor" fill="hsl(187 100% 50%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Sub-tabs */}
          <Tabs defaultValue="resumo" className="space-y-4">
            <TabsList className="bg-secondary/50">
              <TabsTrigger value="resumo" className="gap-1.5"><BarChart3 className="h-4 w-4" />Resumo</TabsTrigger>
              <TabsTrigger value="desenvolvimento" className="gap-1.5"><DollarSign className="h-4 w-4" />Desenvolvimento</TabsTrigger>
              <TabsTrigger value="mrr" className="gap-1.5"><TrendingUp className="h-4 w-4" />MRR</TabsTrigger>
              <TabsTrigger value="custos" className="gap-1.5"><TrendingDown className="h-4 w-4" />Custos Fixos</TabsTrigger>
            </TabsList>

            <TabsContent value="resumo" className="space-y-4">
              <Card className="glass-card">
                <CardHeader><CardTitle className="text-sm">Comparativo — Últimos 6 Meses</CardTitle></CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 14%)" />
                      <XAxis dataKey="mes" tick={{ fill: "hsl(0 0% 55%)", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "hsl(0 0% 55%)", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                      <Legend wrapperStyle={{ color: "hsl(0 0% 55%)" }} />
                      <Bar dataKey="faturado" name="Faturado" fill="hsl(270 70% 62%)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="recorrente" name="Recorrente" fill="hsl(187 100% 50%)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="custos" name="Custos" fill="hsl(0 72% 51%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardHeader><CardTitle className="text-sm">Margem Líquida — Últimos 6 Meses</CardTitle></CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 14%)" />
                      <XAxis dataKey="mes" tick={{ fill: "hsl(0 0% 55%)", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "hsl(0 0% 55%)", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                      <Line type="monotone" dataKey="margem" name="Margem" stroke="hsl(142 71% 45%)" strokeWidth={2} dot={{ fill: "hsl(142 71% 45%)", r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="desenvolvimento" className="space-y-4">
              <Card className="glass-card">
                <CardHeader><CardTitle className="text-sm">Receita de Desenvolvimento por Mês</CardTitle></CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 14%)" />
                      <XAxis dataKey="mes" tick={{ fill: "hsl(0 0% 55%)", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "hsl(0 0% 55%)", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                      <Bar dataKey="desenvolvimento" name="Desenvolvimento" fill="url(#gradDev)" radius={[4, 4, 0, 0]} />
                      <defs><linearGradient id="gradDev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(252 100% 64%)" /><stop offset="100%" stopColor="hsl(187 100% 50%)" /></linearGradient></defs>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              {projetosDev.length === 0 ? (
                <Card className="glass-card"><CardContent className="py-8 text-center text-muted-foreground text-sm">Nenhum projeto cadastrado.</CardContent></Card>
              ) : (
                <div className="grid gap-3">
                  {projetosDev.map(p => (
                    <Card key={p.id} className="glass-card">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-semibold">{p.cliente_nome}</p>
                          <span className="text-sm font-bold">{formatCurrency(Number(p.valor_total))}</span>
                        </div>
                        <div className="w-full bg-secondary rounded-full h-2 mb-2">
                          <div className="h-2 rounded-full gradient-primary transition-all" style={{ width: `${Number(p.valor_total) > 0 ? Math.min((p.recebido / Number(p.valor_total)) * 100, 100) : 0}%` }} />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Recebido: {formatCurrency(p.recebido)}</span>
                          <span>Pendente: {formatCurrency(p.pendente)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="mrr" className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="glass-card"><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">MRR Atual</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-accent">{formatCurrency(mrrAtual)}</p></CardContent></Card>
                <Card className="glass-card"><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Contratos Ativos</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{recorrencias.filter(r => r.ativo).length}</p></CardContent></Card>
                <Card className="glass-card"><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Churn</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-destructive">{contratosChurn}</p></CardContent></Card>
              </div>
              <Card className="glass-card">
                <CardHeader><CardTitle className="text-sm">Evolução do MRR</CardTitle></CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mrrData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 14%)" />
                      <XAxis dataKey="mes" tick={{ fill: "hsl(0 0% 55%)", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "hsl(0 0% 55%)", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                      <Line type="monotone" dataKey="mrr" name="MRR" stroke="hsl(187 100% 50%)" strokeWidth={2} dot={{ fill: "hsl(187 100% 50%)", r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              {recorrencias.length > 0 && (
                <div className="grid gap-3">
                  {recorrencias.map((r: any) => (
                    <Card key={r.id} className="glass-card">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold">{r.contratos?.cliente_nome || "—"}</p>
                            <p className="text-xs text-muted-foreground">Dia {r.dia_vencimento} — {formatCurrency(Number(r.valor_mensal))}/mês</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={r.ativo ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}>
                              {r.ativo ? "Ativo" : "Inativo"}
                            </Badge>
                            <Button variant="ghost" size="icon" className="h-7 w-7 -mr-1" onClick={() => openEditRec(r)}>
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="custos" className="space-y-4">
              <CustosSection custos={custosEmpresa} totalCusto={totalCustosEmpresaMes} novoCustoOpen={novoCustoOpen} setNovoCustoOpen={setNovoCustoOpen}
                custoNome={custoNome} setCustoNome={setCustoNome} custoCategoria={custoCategoria} setCustoCategoria={setCustoCategoria}
                custoValor={custoValor} setCustoValor={setCustoValor} custoRenovacao={custoRenovacao} setCustoRenovacao={setCustoRenovacao}
                saving={saving} handleSalvarCusto={() => { setCustoEscopo("empresa"); handleSalvarCusto(); }} toggleCusto={toggleCusto}
                handleExcluirCusto={handleExcluirCusto} handleEditarCusto={handleEditarCusto} />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ============= PESSOAL TAB ============= */}
        <TabsContent value="pessoal" className="space-y-6">
          <Tabs defaultValue="contas" className="space-y-4">
            <TabsList className="bg-secondary/50">
              <TabsTrigger value="contas" className="gap-1.5"><DollarSign className="h-4 w-4" />Contas a Pagar</TabsTrigger>
              <TabsTrigger value="custos-pessoais" className="gap-1.5"><TrendingDown className="h-4 w-4" />Custos Fixos</TabsTrigger>
            </TabsList>

            <TabsContent value="contas" className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
                  <SelectTrigger className="w-[160px]"><Filter className="h-3 w-3 mr-1" /><SelectValue placeholder="Categoria" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas</SelectItem>
                    {CATEGORIAS_DESPESA.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filtroMetodo} onValueChange={setFiltroMetodo}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Método" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {METODOS_PAGAMENTO.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex-1" />
                <Dialog open={novaTransOpen} onOpenChange={setNovaTransOpen}>
                  <DialogTrigger asChild>
                    <Button className="gradient-primary text-primary-foreground gap-1.5"><Plus className="h-4 w-4" />Nova Conta</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md bg-card border-border">
                    <DialogHeader><DialogTitle>Nova Conta / Despesa</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Categoria *</Label>
                        <Input value={transCategoria} onChange={e => setTransCategoria(e.target.value)} placeholder="Ex: Aluguel, Internet, Luz" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Descrição *</Label>
                        <Input value={transDescricao} onChange={e => setTransDescricao(e.target.value)} placeholder="Ex: Conta de luz" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Valor *</Label>
                          <CurrencyInput value={transValor} onChange={setTransValor} placeholder="99,90" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Data</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !transData && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {transData ? format(transData, "dd/MM/yyyy") : "Selecione"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar mode="single" selected={transData} onSelect={(d) => d && setTransData(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Método de Pagamento</Label>
                        <Select value={transMetodo} onValueChange={setTransMetodo}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>{METODOS_PAGAMENTO.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-3">
                        <Switch checked={transRecorrente} onCheckedChange={setTransRecorrente} />
                        <Label className="text-xs">Recorrente</Label>
                        {transRecorrente && <Input type="number" className="w-20" placeholder="Dia" value={transDiaRecorrencia} onChange={e => setTransDiaRecorrencia(e.target.value)} />}
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setNovaTransOpen(false)}>Cancelar</Button>
                        <Button onClick={() => { setTransTipo("despesa"); handleSalvarTransacao(); }} disabled={transSaving} className="gradient-primary text-primary-foreground">{transSaving ? "Salvando..." : "Salvar"}</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {transacoesFiltradas.length === 0 ? (
                <Card className="glass-card"><CardContent className="py-8 text-center text-muted-foreground text-sm">Nenhuma conta encontrada.</CardContent></Card>
              ) : (
                <>
                  <Card className="glass-card overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow><TableHead>Data</TableHead><TableHead>Descrição</TableHead><TableHead>Categoria</TableHead><TableHead>Método</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="w-20"></TableHead></TableRow>
                      </TableHeader>
                      <TableBody>
                        {transacoesFiltradas.slice(0, 50).map(t => (
                          <TableRow key={t.id}>
                            <TableCell className="text-xs">{format(new Date(t.data + "T00:00:00"), "dd/MM/yy")}</TableCell>
                            <TableCell className="text-sm font-medium">{t.descricao}</TableCell>
                            <TableCell><Badge variant="outline" className="text-[10px]">{t.categoria}</Badge></TableCell>
                            <TableCell className="text-xs text-muted-foreground">{t.metodo_pagamento || "—"}</TableCell>
                            <TableCell className="text-right font-bold text-sm text-destructive">
                              -{formatCurrency(Number(t.valor))}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditTrans(t)}>
                                  <Pencil className="h-3 w-3 text-muted-foreground" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteTransId(t.id)}>
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                  <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-secondary/30">
                    <span className="text-sm text-muted-foreground">
                      Total ({transacoesFiltradas.length} {transacoesFiltradas.length === 1 ? "item" : "itens"}{filtroTipo !== "todos" || filtroCategoria !== "todos" || filtroMetodo !== "todos" ? " filtrados" : ""})
                    </span>
                    <span className="text-base font-bold text-destructive">
                      -{formatCurrency(transacoesFiltradas.reduce((s, t) => s + Number(t.valor), 0))}
                    </span>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="custos-pessoais" className="space-y-4">
              <CustosSection custos={custosPessoais} totalCusto={totalCustosPessoaisMes} novoCustoOpen={novoCustoOpen} setNovoCustoOpen={setNovoCustoOpen}
                custoNome={custoNome} setCustoNome={setCustoNome} custoCategoria={custoCategoria} setCustoCategoria={setCustoCategoria}
                custoValor={custoValor} setCustoValor={setCustoValor} custoRenovacao={custoRenovacao} setCustoRenovacao={setCustoRenovacao}
                saving={saving} handleSalvarCusto={() => { setCustoEscopo("pessoal"); handleSalvarCusto(); }} toggleCusto={toggleCusto}
                handleExcluirCusto={handleExcluirCusto} handleEditarCusto={handleEditarCusto} escopo="pessoal" />
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      {/* Edit transação dialog */}
      <Dialog open={!!editTrans} onOpenChange={open => { if (!open) setEditTrans(null); }}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader><DialogTitle>Editar Conta</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Categoria *</Label>
              <Input value={editTransCategoria} onChange={e => setEditTransCategoria(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição *</Label>
              <Input value={editTransDescricao} onChange={e => setEditTransDescricao(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor *</Label>
                <CurrencyInput value={editTransValor} onChange={setEditTransValor} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-sm")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(editTransData, "dd/MM/yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={editTransData} onSelect={d => d && setEditTransData(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Método de Pagamento</Label>
              <Select value={editTransMetodo} onValueChange={setEditTransMetodo}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{METODOS_PAGAMENTO.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditTrans(null)}>Cancelar</Button>
            <Button onClick={handleSalvarEditTrans} disabled={editTransSaving} className="gradient-primary text-primary-foreground">
              {editTransSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete transação dialog */}
      <AlertDialog open={!!deleteTransId} onOpenChange={open => { if (!open) setDeleteTransId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza? Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTransId && handleExcluirTrans(deleteTransId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit recorrência dialog */}
      <Dialog open={!!editRec} onOpenChange={open => { if (!open) setEditRec(null); }}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader><DialogTitle>Editar Recorrência</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome do Contrato</Label>
              <Input value={editRecNome} onChange={e => setEditRecNome(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor Mensal (R$)</Label>
                <CurrencyInput value={editRecValor} onChange={setEditRecValor} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Dia de Vencimento (1–31)</Label>
                <Input type="number" min="1" max="31" value={editRecDia} onChange={e => setEditRecDia(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={editRecStatus} onValueChange={setEditRecStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="pausado">Pausado</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editRec && recorrencias.filter((r: any) =>
              r.id !== editRec.id && r.ativo && r.contratos?.cliente_nome === editRec.contratos?.cliente_nome
            ).length > 0 && (
              <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                Atenção: há outra recorrência ativa para este cliente. Verifique se há duplicação e cancele a antiga.
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditRec(null)}>Cancelar</Button>
            <Button onClick={handleSalvarEditRec} disabled={editRecSaving} className="gradient-primary text-primary-foreground">
              {editRecSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Salvar alterações
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---- Sub-components ----

function SummaryCard({ icon, title, value, subtitle, accent }: { icon: React.ReactNode; title: string; value: string; subtitle: string; accent: string }) {
  return (
    <Card className="glass-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className={accent}>{icon}</span>
          <p className="text-xs text-muted-foreground">{title}</p>
        </div>
        <p className={`text-xl font-bold ${accent}`}>{value}</p>
        <p className="text-[10px] text-muted-foreground mt-1">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

function CustosSection({ custos, totalCusto, novoCustoOpen, setNovoCustoOpen, custoNome, setCustoNome, custoCategoria, setCustoCategoria, custoValor, setCustoValor, custoRenovacao, setCustoRenovacao, saving, handleSalvarCusto, toggleCusto, handleExcluirCusto, handleEditarCusto, escopo = "empresa" }: any) {
  const isPessoal = escopo === "pessoal";
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editCategoria, setEditCategoria] = useState("outro");
  const [editValor, setEditValor] = useState("");
  const [editRenovacao, setEditRenovacao] = useState("");

  function openEdit(c: any) {
    setEditId(c.id);
    setEditNome(c.nome);
    setEditCategoria(c.categoria);
    setEditValor(String(c.valor_mensal));
    setEditRenovacao(c.data_renovacao || "");
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <Card className="glass-card flex-1 mr-4">
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingDown className="h-6 w-6 text-destructive" />
            <div>
              <p className="text-xs text-muted-foreground">Total de Custos Mensais</p>
              <p className="text-xl font-bold text-destructive">{formatCurrency(totalCusto)}</p>
            </div>
          </CardContent>
        </Card>
        <Dialog open={novoCustoOpen} onOpenChange={setNovoCustoOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground gap-1.5"><Plus className="h-4 w-4" /> Novo Custo</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md bg-card border-border">
            <DialogHeader><DialogTitle>Novo Custo Fixo</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nome *</Label>
                <Input value={custoNome} onChange={(e: any) => setCustoNome(e.target.value)} placeholder="Ex: Servidor VPS" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Categoria</Label>
                  {isPessoal ? (
                    <Input value={custoCategoria} onChange={(e: any) => setCustoCategoria(e.target.value)} placeholder="Ex: Aluguel, Internet, Luz" />
                  ) : (
                    <Select value={custoCategoria} onValueChange={setCustoCategoria}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vps">VPS</SelectItem>
                        <SelectItem value="api">API</SelectItem>
                        <SelectItem value="token">Token</SelectItem>
                        <SelectItem value="ferramenta">Ferramenta</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Valor Mensal *</Label>
                  <CurrencyInput value={custoValor} onChange={setCustoValor} placeholder="99,90" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data de Renovação</Label>
                <Input type="date" value={custoRenovacao} onChange={(e: any) => setCustoRenovacao(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setNovoCustoOpen(false)}>Cancelar</Button>
                <Button onClick={handleSalvarCusto} disabled={saving} className="gradient-primary text-primary-foreground">{saving ? "Salvando..." : "Salvar"}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {custos.length === 0 ? (
        <Card className="glass-card"><CardContent className="py-8 text-center text-muted-foreground text-sm">Nenhum custo cadastrado.</CardContent></Card>
      ) : (
        <div className="space-y-3">
        <div className="grid gap-3">
          {custos.map((c: any) => (
            <Card key={c.id} className="glass-card">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Switch checked={c.ativo} onCheckedChange={(v: boolean) => toggleCusto(c.id, v)} />
                  <div>
                    <p className={`font-semibold ${!c.ativo ? "line-through text-muted-foreground" : ""}`}>{c.nome}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-[10px]">{CATEGORIA_LABELS[c.categoria] || c.categoria}</Badge>
                      {c.data_renovacao && <span>Renova: {format(new Date(c.data_renovacao + "T00:00:00"), "dd/MM/yyyy")}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <p className={`font-bold ${c.ativo ? "text-destructive" : "text-muted-foreground"}`}>{formatCurrency(Number(c.valor_mensal))}</p>
                  <Dialog open={editId === c.id} onOpenChange={(open) => { if (!open) setEditId(null); }}>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md bg-card border-border">
                      <DialogHeader><DialogTitle>Editar Custo</DialogTitle></DialogHeader>
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Nome *</Label>
                          <Input value={editNome} onChange={(e: any) => setEditNome(e.target.value)} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Categoria</Label>
                            {isPessoal ? (
                              <Input value={editCategoria} onChange={(e: any) => setEditCategoria(e.target.value)} placeholder="Ex: Aluguel, Internet" />
                            ) : (
                              <Select value={editCategoria} onValueChange={setEditCategoria}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="vps">VPS</SelectItem>
                                  <SelectItem value="api">API</SelectItem>
                                  <SelectItem value="token">Token</SelectItem>
                                  <SelectItem value="ferramenta">Ferramenta</SelectItem>
                                  <SelectItem value="outro">Outro</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Valor Mensal *</Label>
                            <CurrencyInput value={editValor} onChange={setEditValor} />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Data de Renovação</Label>
                          <Input type="date" value={editRenovacao} onChange={(e: any) => setEditRenovacao(e.target.value)} />
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                          <Button variant="outline" onClick={() => setEditId(null)}>Cancelar</Button>
                          <Button className="gradient-primary text-primary-foreground" onClick={() => { handleEditarCusto(c.id, editNome, editCategoria, editValor, editRenovacao); setEditId(null); }}>Salvar</Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir custo</AlertDialogTitle>
                        <AlertDialogDescription>Tem certeza que deseja excluir "{c.nome}"? Esta ação não pode ser desfeita.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleExcluirCusto(c.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-secondary/30">
          <span className="text-sm text-muted-foreground">
            Total mensal ({custos.filter((c: any) => c.ativo).length} ativos)
          </span>
          <span className="text-base font-bold text-destructive">
            -{formatCurrency(totalCusto)}
          </span>
        </div>
        </div>
      )}
    </>
  );
}
