import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatBRL } from "@/lib/currency";

type EmpresaRadar = {
  empresa_id: string;
  nome: string;
  plano: string | null;
  status: string | null;
  valor_contratado: number | null;
  cotacoes_30d: number;
  cotacoes_total: number;
  ctes_30d: number;
  dias_ativos_30d: number;
  usuarios: number;
  ultimo_uso: string | null;
  criada_em: string;
  sinal: string;
  motivo: string;
  lead: { id: string; nome: string; status: string | null } | null;
};

// Ordem = prioridade de ação. "interna" (cortesias, demos, parceiros) fica recolhida.
const SINAIS: { id: string; titulo: string; dica: string; cor: string }[] = [
  { id: "inadimplente", titulo: "Inadimplente", dica: "Cobrar antes que vire cancelamento", cor: "bg-destructive/20 text-destructive" },
  { id: "risco_churn", titulo: "Risco de churn", dica: "Pagante sem usar há 14 dias ou mais", cor: "bg-destructive/20 text-destructive" },
  { id: "esfriou_trial", titulo: "Esfriou no trial", dica: "Testou e parou: retomar com as rotas dele", cor: "bg-warning/20 text-warning" },
  { id: "pronto_upsell", titulo: "Pronto para upsell", dica: "Uso alto: hora de oferecer agente, sistema ou automação", cor: "bg-success/20 text-success" },
  { id: "ativando", titulo: "Ativando", dica: "Trial em uso: acompanhar até a 1ª mensalidade", cor: "bg-primary/20 text-primary" },
  { id: "pagante", titulo: "Pagante", dica: "Assinatura ativa e em uso", cor: "bg-success/20 text-success" },
  { id: "cancelada", titulo: "Cancelada ou suspensa", dica: "", cor: "bg-muted text-muted-foreground" },
  { id: "interna", titulo: "Cortesias, demos e parceiros", dica: "Fora dos sinais", cor: "bg-muted text-muted-foreground" },
];

export default function RadarCotai({ onAbrirLead }: { onAbrirLead: (leadId: string) => void }) {
  const [empresas, setEmpresas] = useState<EmpresaRadar[]>([]);
  const [loading, setLoading] = useState(true);
  const [mostrarInternas, setMostrarInternas] = useState(false);
  const { toast } = useToast();

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("cotai-radar", { body: {} });
    if (error || !data?.ok) {
      toast({ title: "Erro ao ler a COT-AI", description: error?.message || data?.error, variant: "destructive" });
    } else {
      setEmpresas(data.empresas as EmpresaRadar[]);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { carregar(); }, [carregar]);

  const clientes = empresas.filter((e) => e.sinal !== "interna");
  const mrr = clientes
    .filter((e) => ["pagante", "pronto_upsell", "risco_churn"].includes(e.sinal))
    .reduce((s, e) => s + Number(e.valor_contratado ?? 0), 0);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{clientes.length}</span> cliente{clientes.length !== 1 ? "s" : ""} na COT-AI
          {" · "}
          <span className="font-medium text-foreground">{formatBRL(mrr)}</span> em assinaturas ativas
        </p>
        <Button size="sm" variant="outline" onClick={carregar} className="gap-1.5">
          <RefreshCw className="h-4 w-4" /> Atualizar
        </Button>
      </div>

      {SINAIS.map((s) => {
        const itens = empresas.filter((e) => e.sinal === s.id);
        if (itens.length === 0) return null;
        const recolhido = s.id === "interna" && !mostrarInternas;
        return (
          <div key={s.id} className="space-y-2">
            <button
              className="flex items-center gap-2 text-sm font-semibold"
              onClick={() => s.id === "interna" && setMostrarInternas((v) => !v)}
            >
              {s.id === "interna" && (recolhido ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
              <Badge className={`font-normal ${s.cor}`}>{s.titulo}</Badge>
              <span className="text-muted-foreground font-normal">{itens.length}</span>
              {s.dica && <span className="text-xs text-muted-foreground font-normal">· {s.dica}</span>}
            </button>
            {!recolhido && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {itens.map((e) => (
                  <Card key={e.empresa_id}>
                    <CardContent className="p-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{e.nome}</p>
                          <p className="text-xs text-muted-foreground">{e.motivo}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs uppercase text-muted-foreground">{e.plano ?? "—"} · {e.status}</p>
                          {Number(e.valor_contratado) > 0 && <p className="text-xs font-medium">{formatBRL(Number(e.valor_contratado))}/mês</p>}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span>{e.cotacoes_30d} cotações/30d</span>
                        <span>{e.cotacoes_total} no total</span>
                        <span>{e.dias_ativos_30d} dias ativos/30d</span>
                        {e.ctes_30d > 0 && <span>{e.ctes_30d} CT-es auditados</span>}
                        <span>{e.usuarios} usuário{e.usuarios !== 1 ? "s" : ""}</span>
                        <span>
                          {e.ultimo_uso
                            ? `último uso ${formatDistanceToNow(new Date(e.ultimo_uso), { locale: ptBR, addSuffix: true })}`
                            : "nunca usou"}
                        </span>
                      </div>
                      {s.id !== "interna" && (
                        e.lead ? (
                          <Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={() => onAbrirLead(e.lead!.id)}>
                            Abrir lead: {e.lead.nome}
                          </Button>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">
                            Sem lead no CRM (cadastre o telefone da empresa na COT-AI para ligar automaticamente)
                          </p>
                        )
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {clientes.length === 0 && <p className="text-sm text-muted-foreground">Nenhum cliente fora das contas internas ainda.</p>}
    </div>
  );
}
