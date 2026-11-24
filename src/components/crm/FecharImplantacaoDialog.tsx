import { useEffect, useState } from "react";
import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { parseBRL, formatBRL } from "@/lib/currency";
import type { Tables } from "@/integrations/supabase/types";

type Lead = Tables<"leads">;

interface Props {
  lead: Lead | null;
  onClose: () => void;
  onDone: () => void;
}

// Mover o lead para "Implantação" lança no Financeiro: contrato COT-AI ativo,
// parcela da implantação (hoje), parcela da 1ª mensalidade (+30 dias) e recorrência.
export default function FecharImplantacaoDialog({ lead, onClose, onDone }: Props) {
  const [implantacao, setImplantacao] = useState("500");
  const [mensalidade, setMensalidade] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Sugere a mensalidade do último contrato COT-AI.
  useEffect(() => {
    if (!lead) return;
    setImplantacao("500");
    (async () => {
      const { data } = await supabase
        .from("recorrencias")
        .select("valor_mensal, contratos!inner(tipo_servico)")
        .eq("contratos.tipo_servico", "cot_ai")
        .order("criado_em", { ascending: false })
        .limit(1);
      const ultimo = (data as any)?.[0]?.valor_mensal;
      setMensalidade(ultimo ? String(ultimo) : "");
    })();
  }, [lead]);

  async function confirmar() {
    if (!lead) return;
    const valorMensal = parseBRL(mensalidade);
    if (valorMensal <= 0) {
      toast({ title: "Informe o valor da mensalidade", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).rpc("fechar_implantacao_cotai", {
      p_lead_id: lead.id,
      p_valor_mensal: valorMensal,
      p_valor_implantacao: parseBRL(implantacao),
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao fechar implantação", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Implantação fechada!", description: "Contrato, parcelas e recorrência lançados no Financeiro." });
    onDone();
  }

  const primeira = addDays(new Date(), 30);

  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fechar implantação COT-AI</DialogTitle>
          <DialogDescription>
            {lead?.empresa || lead?.nome} — lança contrato, parcelas e recorrência no Financeiro.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Implantação (cobrada hoje)</Label>
            <CurrencyInput value={implantacao} onChange={setImplantacao} />
          </div>
          <div className="space-y-1.5">
            <Label>Mensalidade</Label>
            <CurrencyInput value={mensalidade} onChange={setMensalidade} />
            <p className="text-xs text-muted-foreground">
              1ª mensalidade em {format(primeira, "dd 'de' MMMM", { locale: ptBR })}
              {parseBRL(mensalidade) > 0 && ` · ${formatBRL(parseBRL(mensalidade))}/mês no MRR`}.
              Ao marcar essa parcela como paga, o lead vira Assinante.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={confirmar} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Fechar implantação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
