import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Landmark, RefreshCw, DollarSign, Target, MessageSquare, Users, FileText,
  CheckSquare, Sparkles, Check, Clock, X,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import PainelOperario from "@/components/operario/PainelOperario";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type Insight = {
  id: string; dominio: string; titulo: string; detalhe: string | null;
  prioridade: string; acao_sugerida: string | null; impacto_estimado: string | null;
  status: string; gerado_em: string;
};
type Briefing = {
  id: string; cadencia: string; resumo: string | null;
  prioridades: { dominio?: string; titulo: string; porque?: string; prioridade?: string }[] | null;
  destaques: string[] | null; gerado_em: string;
};

const DOMINIOS = [
  { id: "financeiro", label: "Financeiro", icon: DollarSign },
  { id: "prospeccao", label: "Prospecção", icon: Target },
  { id: "abordagens", label: "Abordagens", icon: MessageSquare },
  { id: "crm", label: "CRM", icon: Users },
  { id: "contratos", label: "Contratos", icon: FileText },
  { id: "tarefas", label: "Tarefas", icon: CheckSquare },
];

const PRIO_ORDER: Record<string, number> = { critica: 0, alta: 1, media: 2, baixa: 3 };
function prioClass(p: string): string {
  switch (p) {
    case "critica": return "bg-destructive/20 text-destructive border-destructive/30";
    case "alta": return "bg-warning/20 text-warning border-warning/30";
    case "media": return "bg-primary/20 text-primary border-primary/30";
    default: return "bg-muted text-muted-foreground";
  }
}

export default function Conselho() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const carregar = useCallback(async () => {
    const [ins, bf] = await Promise.all([
      db.from("insights").select("*").in("status", ["nova", "em_andamento"]).order("gerado_em", { ascending: false }),
      db.from("briefings").select("*").order("gerado_em", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setInsights((ins.data ?? []) as Insight[]);
    setBriefing((bf.data ?? null) as Briefing | null);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const mudarStatus = async (id: string, status: string, msg: string) => {
    const { error } = await db.from("insights").update({ status, atualizado_em: new Date().toISOString() }).eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: msg });
      carregar();
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Landmark className="h-6 w-6" /> Conselho Consultivo
          </h1>
          <p className="text-sm text-muted-foreground">
            Análise de IA por setor + síntese priorizada. Insights são sugestões — você decide.
          </p>
        </div>
      </div>

      <PainelOperario tipo="briefing_conselho" />

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <>
          {/* Insights por setor */}
          {DOMINIOS.map((dom) => {
            const items = insights
              .filter((i) => i.dominio === dom.id)
              .sort((a, b) => (PRIO_ORDER[a.prioridade] ?? 9) - (PRIO_ORDER[b.prioridade] ?? 9));
            if (items.length === 0) return null;
            return (
              <div key={dom.id}>
                <h2 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                  <dom.icon className="h-4 w-4" /> {dom.label}
                  <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
                </h2>
                <div className="space-y-2">
                  {items.map((i) => (
                    <Card key={i.id}>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge className={`text-[10px] ${prioClass(i.prioridade)}`}>{i.prioridade}</Badge>
                            <span className="text-sm font-semibold">{i.titulo}</span>
                            {i.status === "em_andamento" && <Badge variant="outline" className="text-[9px]">em andamento</Badge>}
                          </div>
                        </div>
                        {i.detalhe && <p className="text-xs text-muted-foreground">{i.detalhe}</p>}
                        {i.acao_sugerida && <p className="text-xs"><span className="text-muted-foreground">Ação:</span> {i.acao_sugerida}</p>}
                        {i.impacto_estimado && <p className="text-[11px] text-muted-foreground">Impacto: {i.impacto_estimado}</p>}
                        <div className="flex items-center gap-1.5 pt-1">
                          {i.status !== "em_andamento" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => mudarStatus(i.id, "em_andamento", "Marcado em andamento")}>
                              <Clock className="h-3 w-3 mr-1" /> Em andamento
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => mudarStatus(i.id, "resolvida", "Resolvido ✓")}>
                            <Check className="h-3 w-3 mr-1" /> Resolver
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground">
                                <X className="h-3 w-3 mr-1" /> Descartar
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Descartar este insight?</AlertDialogTitle>
                                <AlertDialogDescription>Ele sai da lista. Não afeta nenhum dado do sistema.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => mudarStatus(i.id, "descartada", "Insight descartado")}>Descartar</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}

          {insights.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum insight aberto. Conforme os setores acumulam dados, as recomendações aparecem aqui.
            </p>
          )}
        </>
      )}
    </div>
  );
}
