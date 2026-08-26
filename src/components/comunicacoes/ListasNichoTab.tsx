import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Sparkles, Eye, Inbox } from "lucide-react";

type Lista = {
  id: string;
  nicho: string;
  cidade: string;
  lote: number;
  nome: string;
  status: "aberta" | "completa" | "enviando" | "concluida";
  copy_gerado: boolean;
  criado_em: string;
};

type Membro = {
  id: string;
  email: string;
  variacao_copy: number | null;
  assunto: string | null;
  corpo: string | null;
  horario_envio: string | null;
  status_envio: string;
  validado: boolean | null;
};

const STATUS_LABEL: Record<Lista["status"], string> = {
  aberta: "Aberta",
  completa: "Completa",
  enviando: "Enviando",
  concluida: "Concluída",
};

export function ListasNichoTab() {
  const { toast } = useToast();
  const [listas, setListas] = useState<Lista[]>([]);
  const [stats, setStats] = useState<Record<string, { total: number; enviados: number; abertos: number; respondidos: number }>>({});
  const [loading, setLoading] = useState(true);
  const [gerandoId, setGerandoId] = useState<string | null>(null);
  const [verMembros, setVerMembros] = useState<{ lista: Lista; membros: Membro[] } | null>(null);

  const fetchAll = useCallback(async () => {
    const { data: listasData } = await supabase
      .from("listas_email")
      .select("*")
      .order("criado_em", { ascending: false });

    const ls = (listasData ?? []) as Lista[];
    setListas(ls);

    if (ls.length) {
      const { data: agg } = await supabase
        .from("lista_membros")
        .select("lista_id, status_envio")
        .in("lista_id", ls.map(l => l.id));
      const s: typeof stats = {};
      for (const l of ls) s[l.id] = { total: 0, enviados: 0, abertos: 0, respondidos: 0 };
      for (const m of (agg ?? []) as any[]) {
        const e = s[m.lista_id];
        if (!e) continue;
        e.total++;
        if (m.status_envio === "enviado") e.enviados++;
        if (m.status_envio === "aberto") { e.enviados++; e.abertos++; }
        if (m.status_envio === "respondido") { e.enviados++; e.abertos++; e.respondidos++; }
      }
      setStats(s);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const ch = supabase
      .channel("listas-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "listas_email" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "lista_membros" }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchAll]);

  async function gerarCopy(lista: Lista) {
    setGerandoId(lista.id);
    try {
      const { error } = await supabase.functions.invoke("generate-lista-emails", {
        body: { lista_id: lista.id },
      });
      if (error) throw new Error(error.message);
      toast({ title: "Copy gerado", description: "3 variações distribuídas e horários agendados." });
      fetchAll();
    } catch (e: any) {
      toast({ title: "Erro ao gerar copy", description: e.message, variant: "destructive" });
    } finally {
      setGerandoId(null);
    }
  }

  async function abrirMembros(lista: Lista) {
    const { data } = await supabase
      .from("lista_membros")
      .select("id, email, variacao_copy, assunto, corpo, horario_envio, status_envio, validado")
      .eq("lista_id", lista.id)
      .order("horario_envio", { ascending: true });
    setVerMembros({ lista, membros: (data ?? []) as Membro[] });
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (listas.length === 0) {
    return (
      <div className="border border-dashed border-border rounded-xl py-16 text-center">
        <Inbox className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Nenhuma lista ainda.</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Extraia leads na Prospecção — listas se formam automaticamente por nicho + cidade.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {listas.map((l) => {
        const s = stats[l.id] || { total: 0, enviados: 0, abertos: 0, respondidos: 0 };
        const progresso = s.total ? Math.round((s.enviados / s.total) * 100) : 0;
        return (
          <div key={l.id} className="border border-border rounded-xl bg-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{l.nicho} · {l.cidade}</p>
                <p className="text-xs text-muted-foreground">Lote {l.lote}</p>
              </div>
              <Badge variant={l.status === "concluida" ? "default" : l.status === "aberta" ? "secondary" : "outline"} className="text-xs shrink-0">
                {STATUS_LABEL[l.status]}
              </Badge>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{s.enviados}/{s.total} enviados</span>
                <span>{progresso}%</span>
              </div>
              <Progress value={progresso} className="h-1.5" />
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>{s.abertos} abertos</span>
                <span>·</span>
                <span>{s.respondidos} respondidos</span>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              {l.status === "completa" && !l.copy_gerado && (
                <Button size="sm" className="flex-1" onClick={() => gerarCopy(l)} disabled={gerandoId === l.id}>
                  {gerandoId === l.id
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Gerando...</>
                    : <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Gerar copy IA</>}
                </Button>
              )}
              <Button size="sm" variant="outline" className="flex-1" onClick={() => abrirMembros(l)}>
                <Eye className="h-3.5 w-3.5 mr-1.5" /> Ver mensagens
              </Button>
            </div>
          </div>
        );
      })}

      <Dialog open={!!verMembros} onOpenChange={(o) => !o && setVerMembros(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{verMembros?.lista.nome}</DialogTitle>
          </DialogHeader>
          {verMembros && (
            <div className="space-y-3">
              {verMembros.membros.map((m) => (
                <div key={m.id} className="border border-border rounded-lg p-3 text-sm space-y-1.5">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{m.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.variacao_copy ? `Variação ${m.variacao_copy}` : "—"}
                        {m.horario_envio && ` · agendado ${new Date(m.horario_envio).toLocaleString("pt-BR")}`}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">{m.status_envio}</Badge>
                  </div>
                  {m.assunto && <p className="text-xs font-medium">Assunto: {m.assunto}</p>}
                  {m.corpo && <pre className="text-xs whitespace-pre-wrap text-muted-foreground bg-muted/40 p-2 rounded">{m.corpo}</pre>}
                </div>
              ))}
              {verMembros.membros.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Sem membros nesta lista.</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
