import { useCallback, useEffect, useState } from "react";
import { addDays, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Flame, Loader2, Send, Sparkles, Clock, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ESTAGIO_LABEL } from "@/components/crm/estagios";

type Pendente = {
  lead_id: string;
  nome: string;
  empresa: string | null;
  telefone: string | null;
  status: string;
  tipo: "aguardando_voce" | "esfriando";
  ultima_msg_em: string;
  ultima_msg_texto: string;
  ultima_msg_from_me: boolean;
  horas_parado: number;
};

// Fila "não deixe esfriar": conversas do funil que pararam no WhatsApp.
// A IA redige o próximo passo; você revisa e envia com 1 clique (wa-followup).
export default function FilaFollowup({ onAbrirLead }: { onAbrirLead?: (leadId: string) => void }) {
  const [itens, setItens] = useState<Pendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<Record<string, "sugerir" | "enviar" | "adiar">>({});
  const { toast } = useToast();

  const carregar = useCallback(async () => {
    const { data, error } = await (supabase as any).rpc("followups_pendentes");
    if (error) toast({ title: "Erro ao carregar follow-ups", description: error.message, variant: "destructive" });
    setItens((data as Pendente[]) || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 60_000);
    return () => clearInterval(t);
  }, [carregar]);

  function marcar(leadId: string, acao?: "sugerir" | "enviar" | "adiar") {
    setOcupado((prev) => {
      const n = { ...prev };
      if (acao) n[leadId] = acao; else delete n[leadId];
      return n;
    });
  }

  function descartar(leadId: string) {
    setRascunhos((prev) => {
      const n = { ...prev };
      delete n[leadId];
      return n;
    });
  }

  async function sugerir(leadId: string) {
    marcar(leadId, "sugerir");
    const { data, error } = await supabase.functions.invoke("wa-followup", { body: { acao: "sugerir", lead_id: leadId } });
    marcar(leadId);
    if (error || !data?.ok) {
      toast({ title: "Não consegui redigir", description: error?.message || data?.error, variant: "destructive" });
      return;
    }
    setRascunhos((prev) => ({ ...prev, [leadId]: data.texto }));
  }

  async function enviar(leadId: string) {
    const texto = rascunhos[leadId];
    if (!texto?.trim()) return;
    marcar(leadId, "enviar");
    const { data, error } = await supabase.functions.invoke("wa-followup", { body: { acao: "enviar", lead_id: leadId, texto } });
    marcar(leadId);
    if (error || !data?.ok) {
      toast({ title: "Erro ao enviar", description: error?.message || data?.error, variant: "destructive" });
      return;
    }
    toast({ title: "Mensagem enviada no WhatsApp" });
    descartar(leadId);
    setItens((prev) => prev.filter((i) => i.lead_id !== leadId));
  }

  async function adiar(leadId: string) {
    marcar(leadId, "adiar");
    const { error } = await supabase
      .from("leads")
      .update({ followup_adiado_ate: addDays(new Date(), 1).toISOString() } as any)
      .eq("id", leadId);
    marcar(leadId);
    if (error) {
      toast({ title: "Erro ao adiar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Adiado para amanhã" });
    descartar(leadId);
    setItens((prev) => prev.filter((i) => i.lead_id !== leadId));
  }

  const aguardando = itens.filter((i) => i.tipo === "aguardando_voce").length;

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Flame className="h-4 w-4 text-destructive" />
          Não deixe esfriar
        </CardTitle>
        <div className="flex gap-1.5">
          {aguardando > 0 && (
            <Badge className="bg-destructive/20 text-destructive font-normal">{aguardando} aguardando você</Badge>
          )}
          <Badge variant="secondary" className="font-normal">{itens.length} conversa{itens.length !== 1 ? "s" : ""}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : itens.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma conversa parada. Todo mundo respondido.</p>
        ) : (
          <div className="space-y-3">
            {itens.map((i) => {
              const rascunho = rascunhos[i.lead_id];
              const acao = ocupado[i.lead_id];
              return (
                <div key={i.lead_id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <button className="text-left min-w-0" onClick={() => onAbrirLead?.(i.lead_id)}>
                      <p className="text-sm font-medium truncate hover:text-primary">
                        {i.nome}{i.empresa ? <span className="text-muted-foreground font-normal"> · {i.empresa}</span> : null}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        <span className="font-medium">{i.ultima_msg_from_me ? "Você" : "Cliente"}:</span> {i.ultima_msg_texto}
                      </p>
                    </button>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge
                        className={`text-[10px] font-normal ${
                          i.tipo === "aguardando_voce" ? "bg-destructive/20 text-destructive" : "bg-warning/20 text-warning"
                        }`}
                      >
                        {i.tipo === "aguardando_voce" ? "Aguardando você" : "Esfriando"}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {ESTAGIO_LABEL[i.status] ?? i.status} · {formatDistanceToNow(new Date(i.ultima_msg_em), { locale: ptBR, addSuffix: true })}
                      </span>
                    </div>
                  </div>

                  {rascunho !== undefined ? (
                    <div className="space-y-2">
                      <Textarea
                        value={rascunho}
                        onChange={(e) => setRascunhos((prev) => ({ ...prev, [i.lead_id]: e.target.value }))}
                        rows={3}
                        className="text-sm"
                      />
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => descartar(i.lead_id)} disabled={!!acao}>
                          <X className="h-3 w-3" /> Descartar
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => sugerir(i.lead_id)} disabled={!!acao}>
                          {acao === "sugerir" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Refazer
                        </Button>
                        <Button size="sm" className="h-7 text-xs gap-1" onClick={() => enviar(i.lead_id)} disabled={!!acao || !rascunho.trim()}>
                          {acao === "enviar" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Enviar no WhatsApp
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => adiar(i.lead_id)} disabled={!!acao}>
                        {acao === "adiar" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Clock className="h-3 w-3" />} Adiar 1 dia
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => sugerir(i.lead_id)} disabled={!!acao}>
                        {acao === "sugerir" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Redigir com IA
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
