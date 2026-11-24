import { useCallback, useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Cpu, Loader2, Sparkles, Trash2, AlertCircle, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import UsoAssinatura from "./UsoAssinatura";

export type TipoOperario = "relatorio_semanal" | "briefing_conselho" | "analise_anuncios" | "analise_metricas";

type Pedido = {
  id: string;
  tipo: TipoOperario;
  status: "pendente" | "processando" | "concluido" | "erro";
  resultado_md: string | null;
  erro: string | null;
  origem: "manual" | "agendado";
  criado_em: string;
  concluido_em: string | null;
};

const TITULOS: Record<TipoOperario, string> = {
  relatorio_semanal: "Relatório semanal",
  briefing_conselho: "Briefing do Conselho",
  analise_anuncios: "Análise de anúncios",
  analise_metricas: "Análise de métricas",
};

const db = supabase as any;

// Análise feita pelo Claude Code no PC do Wesley, com a assinatura (skill operario-ia).
// O botão cria um pedido em fila_ia; o operário do Agendador do Windows processa em até 5 min.
export default function PainelOperario({ tipo }: { tipo: TipoOperario }) {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [criando, setCriando] = useState(false);
  const { toast } = useToast();

  const carregar = useCallback(async () => {
    const { data, error } = await db
      .from("fila_ia").select("*").eq("tipo", tipo).order("criado_em", { ascending: false }).limit(12);
    if (error) toast({ title: "Erro ao carregar análises", description: error.message, variant: "destructive" });
    setPedidos((data as Pedido[]) || []);
    setLoading(false);
  }, [tipo, toast]);

  const emAndamento = pedidos.find((p) => p.status === "pendente" || p.status === "processando");

  useEffect(() => { carregar(); }, [carregar]);
  // Enquanto houver pedido na fila, confere a cada 20s
  useEffect(() => {
    if (!emAndamento) return;
    const t = setInterval(carregar, 20_000);
    return () => clearInterval(t);
  }, [emAndamento, carregar]);

  async function gerar() {
    setCriando(true);
    const { error } = await db.from("fila_ia").insert({ tipo });
    setCriando(false);
    if (error) {
      toast({ title: "Erro ao pedir a análise", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Pedido na fila", description: "O Claude Code do seu PC processa em até 5 minutos (o PC precisa estar ligado)." });
    setSelecionado(null);
    carregar();
  }

  async function tentarDeNovo(id: string) {
    const { error } = await db.from("fila_ia").update({ status: "pendente", erro: null, iniciado_em: null }).eq("id", id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Pedido devolvido para a fila" }); carregar(); }
  }

  async function excluir(id: string) {
    const { error } = await db.from("fila_ia").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Análise excluída" });
    if (selecionado === id) setSelecionado(null);
    carregar();
  }

  const concluidos = pedidos.filter((p) => p.status === "concluido");
  const erros = pedidos.filter((p) => p.status === "erro");
  const atual = concluidos.find((p) => p.id === selecionado) ?? concluidos[0];

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> {TITULOS[tipo]}
            <Badge variant="outline" className="text-[10px] font-normal gap-1"><Cpu className="h-3 w-3" /> sua assinatura</Badge>
          </CardTitle>
          <Button size="sm" onClick={gerar} disabled={criando || !!emAndamento} className="gap-1.5">
            {criando || emAndamento ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {emAndamento ? (emAndamento.status === "processando" ? "Analisando…" : "Na fila…") : "Gerar agora"}
          </Button>
        </div>
        <UsoAssinatura />
      </CardHeader>

      <CardContent className="space-y-4">
        {emAndamento && (
          <p className="text-xs text-muted-foreground">
            {emAndamento.status === "processando"
              ? "O Claude Code está analisando os dados agora."
              : `Pedido feito ${formatDistanceToNow(new Date(emAndamento.criado_em), { addSuffix: true, locale: ptBR })}. Roda na próxima rodada do operário (até 5 min, com o PC ligado).`}
          </p>
        )}

        {erros.slice(0, 1).map((e) => (
          <div key={e.id} className="text-xs rounded-md border border-destructive/30 bg-destructive/10 p-3 flex items-start justify-between gap-2">
            <span className="flex gap-2"><AlertCircle className="h-4 w-4 text-destructive shrink-0" /> {e.erro || "Falhou sem motivo registrado."}</span>
            <div className="flex gap-1 shrink-0">
              <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={() => tentarDeNovo(e.id)}>
                <RotateCcw className="h-3 w-3" /> Tentar de novo
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => excluir(e.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}

        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : atual ? (
          <>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Gerado {format(new Date(atual.concluido_em ?? atual.criado_em), "dd/MM 'às' HH:mm", { locale: ptBR })}
                {atual.origem === "agendado" && " · automático"}
              </span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-6 text-xs gap-1"><Trash2 className="h-3 w-3" /> Excluir</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir esta análise?</AlertDialogTitle>
                    <AlertDialogDescription>Ela some do histórico. Esta ação não pode ser desfeita.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => excluir(atual.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <div className="prose prose-sm prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{atual.resultado_md ?? ""}</ReactMarkdown>
            </div>
            {concluidos.length > 1 && (
              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border">
                <span className="text-[10px] text-muted-foreground self-center mr-1">Anteriores:</span>
                {concluidos.map((p) => (
                  <Button
                    key={p.id}
                    size="sm"
                    variant={p.id === atual.id ? "secondary" : "ghost"}
                    className="h-6 text-[10px] px-2"
                    onClick={() => setSelecionado(p.id)}
                  >
                    {format(new Date(p.concluido_em ?? p.criado_em), "dd/MM")}
                  </Button>
                ))}
              </div>
            )}
          </>
        ) : !emAndamento ? (
          <p className="text-sm text-muted-foreground">Nenhuma análise ainda. Clique em "Gerar agora".</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
