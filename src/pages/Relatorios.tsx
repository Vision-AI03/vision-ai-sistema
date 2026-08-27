import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BarChart2, TrendingUp, TrendingDown, Minus, Loader2,
  ChevronLeft, RefreshCw, Users, MessageSquare, Target, Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Relatorio {
  id: string;
  semana_inicio: string;
  semana_fim: string;
  resumo_executivo: string;
  total_leads_abordados: number;
  total_perdidos: number;
  taxa_conversao: number;
  relatorio_completo: string;
  metadata: Record<string, any> | null;
  created_at: string;
}

function TrendBadge({ valor, anterior }: { valor: number; anterior?: number }) {
  if (anterior === undefined) return null;
  const diff = valor - anterior;
  if (diff > 0) return <span className="text-xs text-green-500 flex items-center gap-0.5"><TrendingUp className="h-3 w-3" />+{diff}</span>;
  if (diff < 0) return <span className="text-xs text-destructive flex items-center gap-0.5"><TrendingDown className="h-3 w-3" />{diff}</span>;
  return <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Minus className="h-3 w-3" />0</span>;
}

export default function Relatorios() {
  const [relatorios, setRelatorios] = useState<Relatorio[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Relatorio | null>(null);
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchRelatorios();
  }, []);

  async function fetchRelatorios() {
    setLoading(true);
    const { data } = await supabase
      .from("relatorios_semanais")
      .select("*")
      .order("semana_inicio", { ascending: false })
      .limit(20);
    setRelatorios(data || []);
    setLoading(false);
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.functions.invoke("generate-weekly-report", {
        body: { user_id: user?.id },
      });
      if (error) throw error;
      toast({ title: "Relatório gerado com sucesso!" });
      await fetchRelatorios();
    } catch (err: any) {
      toast({ title: "Erro ao gerar relatório", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  function formatSemana(inicio: string, fim: string) {
    const i = new Date(inicio + "T12:00:00");
    const f = new Date(fim + "T12:00:00");
    return `${format(i, "dd/MM", { locale: ptBR })} — ${format(f, "dd/MM/yyyy", { locale: ptBR })}`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Detail view
  if (selected) {
    const taxaResposta = selected.metadata?.taxa_resposta ?? 0;
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setSelected(null)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Semana {formatSemana(selected.semana_inicio, selected.semana_fim)}</h1>
            <p className="text-xs text-muted-foreground">Gerado em {format(new Date(selected.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Abordados</p>
              <p className="text-2xl font-bold">{selected.total_leads_abordados}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" /> Taxa Resposta</p>
              <p className="text-2xl font-bold">{taxaResposta}%</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Target className="h-3.5 w-3.5" /> Perdidos</p>
              <p className="text-2xl font-bold text-destructive">{selected.total_perdidos}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><BarChart2 className="h-3.5 w-3.5" /> Conversão</p>
              <p className="text-2xl font-bold">{selected.taxa_conversao}%</p>
            </CardContent>
          </Card>
        </div>

        {/* Full Report */}
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <ScrollArea className="max-h-[calc(100vh-400px)]">
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
                  {selected.relatorio_completo}
                </ReactMarkdown>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Relatórios Semanais</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Análise de performance comercial gerada por IA</p>
        </div>
        <Button onClick={handleGenerate} disabled={generating} className="gap-1.5">
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {generating ? "Gerando..." : "Gerar Relatório Agora"}
        </Button>
      </div>

      {relatorios.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-10 text-center">
            <BarChart2 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhum relatório gerado ainda.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Clique em "Gerar Relatório Agora" para criar o primeiro, ou aguarde o cron de domingo às 23h.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {relatorios.map((r, idx) => {
            const anterior = relatorios[idx + 1];
            const taxaResposta = r.metadata?.taxa_resposta ?? 0;
            return (
              <Card
                key={r.id}
                className="bg-card border-border hover:border-primary/30 transition-colors cursor-pointer"
                onClick={() => setSelected(r)}
              >
                <CardHeader className="pb-2 pt-4 px-5">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">
                      Semana {formatSemana(r.semana_inicio, r.semana_fim)}
                    </CardTitle>
                    {anterior && (
                      r.total_leads_abordados > anterior.total_leads_abordados
                        ? <Badge className="bg-green-500/20 text-green-600 border-green-500/20 text-[10px]">
                            <TrendingUp className="h-2.5 w-2.5 mr-1" />Melhora
                          </Badge>
                        : r.total_leads_abordados < anterior.total_leads_abordados
                        ? <Badge className="bg-destructive/20 text-destructive border-destructive/20 text-[10px]">
                            <TrendingDown className="h-2.5 w-2.5 mr-1" />Queda
                          </Badge>
                        : <Badge variant="outline" className="text-[10px]">Estável</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-4 space-y-3">
                  <p className="text-xs text-muted-foreground line-clamp-2">{r.resumo_executivo}</p>
                  <div className="flex gap-4 text-xs">
                    <span className="text-muted-foreground">
                      <span className="font-semibold text-foreground">{r.total_leads_abordados}</span> abordados
                    </span>
                    <span className="text-muted-foreground">
                      <span className="font-semibold text-foreground">{taxaResposta}%</span> responderam
                    </span>
                    <span className="text-muted-foreground">
                      <span className="font-semibold text-destructive">{r.total_perdidos}</span> perdidos
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
