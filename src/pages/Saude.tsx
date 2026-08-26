import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity, RefreshCw, Clock, CheckCircle2, AlertTriangle,
  MessageSquare, Users, Sparkles, Mail, Lightbulb,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Cron = { jobname: string; schedule: string; active: boolean };
type Health = {
  gerado_em: string;
  crons: Cron[];
  wa: {
    eventos_pendentes: number;
    eventos_erro_24h: number;
    ultimo_evento: string | null;
    conversas: number;
    mensagens: number;
    minhas_mensagens: number;
    bloqueados: number;
  };
  leads: {
    total: number;
    enriquecidos: number;
    ultimo_enriquecimento: string | null;
    via_whatsapp: number;
  };
  emails_hoje: number | null;
  licoes_ativas: number;
};

function relativo(ts: string | null): string {
  if (!ts) return "nunca";
  return formatDistanceToNow(new Date(ts), { addSuffix: true, locale: ptBR });
}

function Stat({ icon: Icon, label, value, hint, tone = "default" }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "warn" | "ok";
}) {
  const toneClass =
    tone === "warn" ? "text-destructive" : tone === "ok" ? "text-emerald-500" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </div>
        <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export default function Saude() {
  const [data, setData] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const carregar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const { data: res, error } = await supabase.rpc("system_health");
    if (error) {
      toast({ title: "Erro ao carregar saúde", description: error.message, variant: "destructive" });
    } else {
      setData(res as unknown as Health);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    carregar();
    const t = setInterval(() => carregar(true), 30000); // auto-refresh 30s
    return () => clearInterval(t);
  }, [carregar]);

  const crons = data?.crons ?? [];
  const cronsInativos = crons.filter((c) => !c.active).length;
  const waPendentes = data?.wa.eventos_pendentes ?? 0;
  const waErros = data?.wa.eventos_erro_24h ?? 0;

  const problemas =
    (crons.length === 0 ? 1 : 0) + cronsInativos + (waPendentes > 50 ? 1 : 0) + (waErros > 0 ? 1 : 0);
  const tudoOk = data && problemas === 0;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" /> Saúde do Sistema
          </h1>
          <p className="text-sm text-muted-foreground">
            {data ? `Atualizado ${relativo(data.gerado_em)}` : "Carregando…"}
            {tudoOk && (
              <span className="ml-2 inline-flex items-center gap-1 text-emerald-500">
                <CheckCircle2 className="h-3.5 w-3.5" /> tudo saudável
              </span>
            )}
            {data && !tudoOk && (
              <span className="ml-2 inline-flex items-center gap-1 text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" /> {problemas} ponto(s) de atenção
              </span>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => carregar()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {loading && !data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : data ? (
        <>
          {/* Crons */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" /> Agendamentos (pg_cron)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {crons.length === 0 ? (
                <div className="text-sm text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Nenhum cron ativo — o pg_cron pode estar desabilitado.
                </div>
              ) : (
                crons.map((c) => (
                  <div key={c.jobname} className="flex items-center justify-between text-sm border-b border-border/50 pb-1.5 last:border-0">
                    <span className="font-mono">{c.jobname}</span>
                    <div className="flex items-center gap-3">
                      <code className="text-xs text-muted-foreground">{c.schedule}</code>
                      <Badge variant={c.active ? "default" : "destructive"}>
                        {c.active ? "ativo" : "inativo"}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* WhatsApp pipeline */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Pipeline WhatsApp (UazAPI)
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={Clock} label="Eventos pendentes" value={waPendentes}
                tone={waPendentes > 50 ? "warn" : "ok"}
                hint={waPendentes > 50 ? "normalizador pode ter parado" : "fila em dia"} />
              <Stat icon={AlertTriangle} label="Erros (24h)" value={waErros}
                tone={waErros > 0 ? "warn" : "ok"} />
              <Stat icon={Clock} label="Último evento" value={relativo(data.wa.ultimo_evento)} />
              <Stat icon={MessageSquare} label="Conversas" value={data.wa.conversas}
                hint={`${data.wa.minhas_mensagens} minhas / ${data.wa.mensagens} msgs`} />
            </div>
          </div>

          {/* Leads + resto */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
              <Users className="h-4 w-4" /> Leads & IA
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={Users} label="Leads" value={data.leads.total}
                hint={`${data.leads.via_whatsapp} via WhatsApp`} />
              <Stat icon={Sparkles} label="Enriquecidos" value={data.leads.enriquecidos}
                hint={`último ${relativo(data.leads.ultimo_enriquecimento)}`} />
              <Stat icon={Mail} label="Emails hoje" value={data.emails_hoje ?? "—"} />
              <Stat icon={Lightbulb} label="Lições ativas" value={data.licoes_ativas} />
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Bloqueados no WhatsApp: {data.wa.bloqueados} · auto-atualiza a cada 30s
          </p>
        </>
      ) : null}
    </div>
  );
}
