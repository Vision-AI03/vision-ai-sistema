import { useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Gauge } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";

type Uso = {
  cinco_horas_pct: number | null;
  cinco_horas_reset: string | null;
  sete_dias_pct: number | null;
  sete_dias_reset: string | null;
  atualizado_em: string;
};

// Janela de uso da assinatura do Claude. Vem da status line do Claude Code
// (sessões interativas) e sobe para uso_assinatura pelo operário a cada 5 min.
export default function UsoAssinatura() {
  const [uso, setUso] = useState<Uso | null>(null);

  useEffect(() => {
    const carregar = async () => {
      const { data } = await (supabase as any).from("uso_assinatura").select("*").eq("conta", "claude").maybeSingle();
      setUso(data ?? null);
    };
    carregar();
    const t = setInterval(carregar, 60_000);
    return () => clearInterval(t);
  }, []);

  if (!uso) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Gauge className="h-3.5 w-3.5" /> Uso da assinatura aparece depois da primeira sessão do Claude Code com a status line ligada.
      </p>
    );
  }

  const agora = Date.now();
  // Janela que já renovou não vale mais: o uso voltou a zero
  const valido = (reset: string | null) => !reset || new Date(reset).getTime() > agora;
  const cinco = valido(uso.cinco_horas_reset) ? Number(uso.cinco_horas_pct ?? 0) : 0;
  const sete = valido(uso.sete_dias_reset) ? Number(uso.sete_dias_pct ?? 0) : 0;
  const cor = (p: number) => (p >= 85 ? "text-destructive" : p >= 60 ? "text-warning" : "text-muted-foreground");

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="flex items-center gap-1.5 font-medium"><Gauge className="h-3.5 w-3.5" /> Janela de 5h</span>
          <span className={cor(cinco)}>
            {Math.round(cinco)}%
            {uso.cinco_horas_reset && valido(uso.cinco_horas_reset) && ` · renova às ${format(new Date(uso.cinco_horas_reset), "HH:mm")}`}
          </span>
        </div>
        <Progress value={cinco} className="h-1.5" />
      </div>
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="font-medium">Semana</span>
          <span className={cor(sete)}>
            {Math.round(sete)}%
            {uso.sete_dias_reset && valido(uso.sete_dias_reset) && ` · renova ${format(new Date(uso.sete_dias_reset), "EEE HH:mm", { locale: ptBR })}`}
          </span>
        </div>
        <Progress value={sete} className="h-1.5" />
      </div>
      <p className="sm:col-span-2 text-[10px] text-muted-foreground">
        Atualizado {formatDistanceToNow(new Date(uso.atualizado_em), { addSuffix: true, locale: ptBR })}
      </p>
    </div>
  );
}
