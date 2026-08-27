import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Megaphone, Loader2, RefreshCw, Sparkles, DollarSign, MousePointerClick,
  Target, TrendingUp, Trash2, Image as ImageIcon, History,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// tabelas novas ainda não estão nos types gerados — cast pontual
const db = supabase as any;

interface Metrica {
  data: string; nivel: string; ref_id: string; nome: string | null;
  gasto: number; impressoes: number; cliques: number; cpc: number; cpm: number;
  ctr: number; alcance: number; frequencia: number; leads: number; compras: number; valor_conversao: number;
}
interface Criativo {
  ad_id: string; campaign_id: string | null; nome: string | null; titulo: string | null;
  thumbnail_url: string | null; status: string | null;
}
interface Analise {
  id: string; tipo: string; periodo_inicio: string; periodo_fim: string;
  resumo: string | null; conteudo: string | null; gerado_em: string;
}

const PERIODOS: Record<string, { label: string; dias: number }> = {
  "30d": { label: "Últimos 30 dias", dias: 30 },
  "90d": { label: "Últimos 90 dias", dias: 90 },
  "12m": { label: "Últimos 12 meses", dias: 365 },
  tudo: { label: "Todo o período", dias: 3650 },
};

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtInt = (v: number) => new Intl.NumberFormat("pt-BR").format(Math.round(v || 0));

function agregar(rows: Metrica[]) {
  const gasto = rows.reduce((s, r) => s + Number(r.gasto), 0);
  const impressoes = rows.reduce((s, r) => s + Number(r.impressoes), 0);
  const cliques = rows.reduce((s, r) => s + Number(r.cliques), 0);
  const leads = rows.reduce((s, r) => s + Number(r.leads), 0);
  const valor = rows.reduce((s, r) => s + Number(r.valor_conversao), 0);
  return {
    gasto, impressoes, cliques, leads, valor,
    ctr: impressoes ? (cliques / impressoes) * 100 : 0,
    cpc: cliques ? gasto / cliques : 0,
    cpm: impressoes ? (gasto / impressoes) * 1000 : 0,
    custoPorLead: leads ? gasto / leads : 0,
    roas: gasto ? valor / gasto : 0,
  };
}

function Kpi({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: any }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <p className="text-2xl font-bold">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

const tooltipStyle = {
  background: "hsl(var(--card))", border: "1px solid hsl(var(--border))",
  borderRadius: 6, fontSize: 12,
};

export default function Anuncios() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [metricas, setMetricas] = useState<Metrica[]>([]);
  const [criativos, setCriativos] = useState<Criativo[]>([]);
  const [analises, setAnalises] = useState<Analise[]>([]);
  const [periodo, setPeriodo] = useState<string>("tudo");
  const { toast } = useToast();

  async function fetchAll() {
    setLoading(true);
    const dias = PERIODOS[periodo]?.dias ?? 3650;
    const desde = new Date(Date.now() - dias * 86400000).toISOString().split("T")[0];
    const [mRes, cRes, aRes] = await Promise.all([
      db.from("ads_metricas_diarias").select("*").gte("data", desde).order("data", { ascending: true }),
      db.from("ads_criativos").select("ad_id, campaign_id, nome, titulo, thumbnail_url, status"),
      db.from("ads_analises_ia").select("*").order("gerado_em", { ascending: false }).limit(20),
    ]);
    setMetricas((mRes.data ?? []) as Metrica[]);
    setCriativos((cRes.data ?? []) as Criativo[]);
    setAnalises((aRes.data ?? []) as Analise[]);
    setLoading(false);
  }

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, [periodo]);

  async function handleSync() {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-ads-sync", { body: {} });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
      toast({ title: "Sincronizado!", description: `${data?.campanhas ?? 0} campanhas, ${data?.metricas ?? 0} métricas.` });
      await fetchAll();
    } catch (e: any) {
      toast({ title: "Erro ao sincronizar", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }

  async function handleBackfill() {
    setBackfilling(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-ads-sync", { body: { preset: "maximum" } });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
      toast({ title: "Histórico puxado!", description: `${data?.metricas ?? 0} métricas importadas.` });
      await fetchAll();
    } catch (e: any) {
      toast({ title: "Erro no histórico", description: e.message, variant: "destructive" });
    } finally {
      setBackfilling(false);
    }
  }

  async function handleAnalisar() {
    setAnalisando(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-ads-analise", { body: { tipo: "manual" } });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
      toast({ title: "Análise gerada!" });
      await fetchAll();
    } catch (e: any) {
      toast({ title: "Erro ao analisar", description: e.message, variant: "destructive" });
    } finally {
      setAnalisando(false);
    }
  }

  async function handleDeleteAnalise(id: string) {
    const { error } = await db.from("ads_analises_ia").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    } else {
      toast({ title: "Análise excluída" });
      setAnalises((prev) => prev.filter((a) => a.id !== id));
    }
  }

  const conta = useMemo(() => metricas.filter((m) => m.nivel === "conta"), [metricas]);
  const total = useMemo(() => agregar(conta), [conta]);

  const serieDiaria = useMemo(() =>
    conta.map((r) => ({
      dia: format(new Date(r.data + "T12:00:00"), "dd/MM", { locale: ptBR }),
      gasto: Number(r.gasto),
      cpc: Number(r.cpc),
    })), [conta]);

  const campanhas = useMemo(() => {
    const grp: Record<string, Metrica[]> = {};
    for (const m of metricas.filter((x) => x.nivel === "campanha")) (grp[m.ref_id] ??= []).push(m);
    return Object.entries(grp).map(([id, rows]) => ({
      id, nome: rows[0]?.nome ?? id, ...agregar(rows),
    })).sort((a, b) => b.gasto - a.gasto);
  }, [metricas]);

  const anuncios = useMemo(() => {
    const critMap = new Map(criativos.map((c) => [c.ad_id, c]));
    const grp: Record<string, Metrica[]> = {};
    for (const m of metricas.filter((x) => x.nivel === "anuncio")) (grp[m.ref_id] ??= []).push(m);
    return Object.entries(grp).map(([id, rows]) => {
      const c = critMap.get(id);
      return {
        id, nome: rows[0]?.nome ?? id,
        titulo: c?.titulo ?? null, thumb: c?.thumbnail_url ?? null, status: c?.status ?? null,
        ...agregar(rows),
      };
    }).sort((a, b) => b.gasto - a.gasto).slice(0, 12);
  }, [metricas, criativos]);

  const ultima = analises[0];
  const semDados = conta.length === 0;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Megaphone className="h-6 w-6" /> Radar de Anúncios</h1>
          <p className="text-sm text-muted-foreground mt-1">Performance da Meta Ads ({PERIODOS[periodo]?.label.toLowerCase()}) + análise por IA</p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(PERIODOS).map(([k, v]) => (
                <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="gap-1.5">
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Sincronizando..." : "Sincronizar"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleBackfill} disabled={backfilling} className="gap-1.5">
            <History className={`h-4 w-4 ${backfilling ? "animate-spin" : ""}`} /> {backfilling ? "Puxando..." : "Puxar histórico"}
          </Button>
          <Button size="sm" onClick={handleAnalisar} disabled={analisando || semDados} className="gap-1.5">
            {analisando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {analisando ? "Analisando..." : "Analisar com IA"}
          </Button>
        </div>
      </div>

      {semDados ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Megaphone className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhuma métrica ainda.</p>
            <p className="text-xs text-muted-foreground mt-1">Clique em <b>Sincronizar</b> para puxar os dados da sua conta de anúncios da Meta.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Kpi label="Gasto" value={fmtBRL(total.gasto)} icon={DollarSign} />
            <Kpi label="CPC médio" value={fmtBRL(total.cpc)} icon={MousePointerClick} />
            <Kpi label="CTR médio" value={`${total.ctr.toFixed(2)}%`} icon={TrendingUp} />
            <Kpi label="CPM" value={fmtBRL(total.cpm)} icon={DollarSign} />
            <Kpi label="Leads" value={fmtInt(total.leads)} sub={total.leads ? `${fmtBRL(total.custoPorLead)}/lead` : undefined} icon={Target} />
            <Kpi label="Impressões" value={fmtInt(total.impressoes)} sub={`${fmtInt(total.cliques)} cliques`} icon={TrendingUp} />
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Gasto por dia</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={serieDiaria}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtBRL(v)} />
                    <Bar dataKey="gasto" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">CPC por dia</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={serieDiaria}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtBRL(v)} />
                    <Line type="monotone" dataKey="cpc" stroke="hsl(187 100% 50%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Campanhas */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Campanhas</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border">
                      <th className="px-4 py-2 font-medium">Campanha</th>
                      <th className="px-3 py-2 font-medium text-right">Gasto</th>
                      <th className="px-3 py-2 font-medium text-right">CPC</th>
                      <th className="px-3 py-2 font-medium text-right">CTR</th>
                      <th className="px-3 py-2 font-medium text-right">Leads</th>
                      <th className="px-4 py-2 font-medium text-right">Cliques</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campanhas.map((c) => (
                      <tr key={c.id} className="border-b border-border/50 last:border-0">
                        <td className="px-4 py-2 truncate max-w-[240px]">{c.nome}</td>
                        <td className="px-3 py-2 text-right">{fmtBRL(c.gasto)}</td>
                        <td className="px-3 py-2 text-right">{fmtBRL(c.cpc)}</td>
                        <td className="px-3 py-2 text-right">{c.ctr.toFixed(2)}%</td>
                        <td className="px-3 py-2 text-right">{fmtInt(c.leads)}</td>
                        <td className="px-4 py-2 text-right">{fmtInt(c.cliques)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Criativos */}
          {anuncios.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Criativos (top por gasto)</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {anuncios.map((a) => (
                    <div key={a.id} className="flex gap-3 p-3 rounded-lg border border-border">
                      {a.thumb ? (
                        <img src={a.thumb} alt="" className="h-14 w-14 rounded object-cover flex-shrink-0" />
                      ) : (
                        <div className="h-14 w-14 rounded bg-secondary/40 flex items-center justify-center flex-shrink-0">
                          <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{a.titulo || a.nome}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-muted-foreground">
                          <span>{fmtBRL(a.gasto)}</span>
                          <span>CPC {fmtBRL(a.cpc)}</span>
                          <span>CTR {a.ctr.toFixed(1)}%</span>
                          {a.leads > 0 && <span>{fmtInt(a.leads)} leads</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Análise IA */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Análise da IA</CardTitle>
              {ultima && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir esta análise?</AlertDialogTitle>
                      <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDeleteAnalise(ultima.id)}>Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </CardHeader>
            <CardContent>
              {!ultima ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>Nenhuma análise ainda. Clique em <b>Analisar com IA</b>.</p>
                </div>
              ) : (
                <>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    Gerada em {format(new Date(ultima.gerado_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    {ultima.tipo === "semanal" && <Badge variant="outline" className="ml-2 text-[10px]">semanal</Badge>}
                  </p>
                  <div className="prose prose-sm prose-invert max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          h2: ({ children }) => <h2 className="text-base font-bold mt-5 mb-2 text-foreground">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-sm font-semibold mt-4 mb-1.5 text-foreground">{children}</h3>,
                          p: ({ children }) => <p className="text-sm text-foreground/90 mb-2 leading-relaxed">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-3 text-sm text-foreground/90">{children}</ul>,
                          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                          table: ({ children }) => (
                            <div className="overflow-x-auto my-3">
                              <table className="w-full text-xs border-collapse">{children}</table>
                            </div>
                          ),
                          thead: ({ children }) => <thead className="bg-secondary/40">{children}</thead>,
                          th: ({ children }) => <th className="text-left font-semibold px-2 py-1.5 border border-border">{children}</th>,
                          td: ({ children }) => <td className="px-2 py-1.5 border border-border/60">{children}</td>,
                        }}
                      >
                        {ultima.conteudo || ""}
                      </ReactMarkdown>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
