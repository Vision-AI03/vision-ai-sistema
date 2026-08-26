import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Sparkles, Copy, ExternalLink, MessageCircle } from "lucide-react";

type Lead = {
  id: string;
  nome: string | null;
  empresa: string | null;
  telefone: string | null;
  segmento: string | null;
  whatsapp_link: string | null;
  whatsapp_enviado_em: string | null;
  origem_metadata: any;
};

const META_DIARIA = 10;

export function WhatsAppTab() {
  const { toast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pendentes" | "aguardando">("pendentes");
  const [gerandoId, setGerandoId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ lead: Lead; mensagem: string } | null>(null);
  const [toquesHoje, setToquesHoje] = useState(0);

  const fetchAll = useCallback(async () => {
    const q = supabase
      .from("leads")
      .select("id, nome, empresa, telefone, segmento, whatsapp_link, whatsapp_enviado_em, origem_metadata")
      .not("whatsapp_link", "is", null)
      .order("criado_em", { ascending: false })
      .limit(200);

    if (filter === "pendentes") q.is("whatsapp_enviado_em", null);
    else q.not("whatsapp_enviado_em", "is", null);

    const { data } = await q;
    setLeads((data ?? []) as Lead[]);

    const hojeISO = new Date(); hojeISO.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .gte("whatsapp_enviado_em", hojeISO.toISOString());
    setToquesHoje(count ?? 0);
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function gerar(lead: Lead) {
    setGerandoId(lead.id);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-abordagem", {
        body: { lead_id: lead.id },
      });
      if (error) throw new Error(error.message);
      const msg = (data as any)?.mensagem;
      if (!msg) throw new Error("Sem mensagem retornada");
      setModal({ lead, mensagem: msg });
    } catch (e: any) {
      toast({ title: "Erro ao gerar abordagem", description: e.message, variant: "destructive" });
    } finally {
      setGerandoId(null);
    }
  }

  async function copiar() {
    if (!modal) return;
    await navigator.clipboard.writeText(modal.mensagem);
    toast({ title: "Mensagem copiada" });
  }

  async function abrirWhats() {
    if (!modal || !modal.lead.whatsapp_link) return;
    const url = `${modal.lead.whatsapp_link}?text=${encodeURIComponent(modal.mensagem)}`;
    window.open(url, "_blank");
    await supabase.from("leads").update({ whatsapp_enviado_em: new Date().toISOString() }).eq("id", modal.lead.id);
    toast({ title: "Lead movido para Aguardando resposta" });
    setModal(null);
    fetchAll();
  }

  function agruparPorNicho(ls: Lead[]) {
    const grupos = new Map<string, Lead[]>();
    for (const l of ls) {
      const k = l.segmento || "Sem nicho";
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k)!.push(l);
    }
    return Array.from(grupos.entries());
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button size="sm" variant={filter === "pendentes" ? "default" : "outline"} onClick={() => setFilter("pendentes")}>
            Pendentes
          </Button>
          <Button size="sm" variant={filter === "aguardando" ? "default" : "outline"} onClick={() => setFilter("aguardando")}>
            Aguardando resposta
          </Button>
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">Toques de hoje:</span>{" "}
          <span className={`font-bold ${toquesHoje >= META_DIARIA ? "text-green-600" : "text-foreground"}`}>{toquesHoje}/{META_DIARIA}</span>
        </div>
      </div>

      {leads.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl py-16 text-center">
          <MessageCircle className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {filter === "pendentes" ? "Sem leads pendentes com telefone." : "Nenhum toque enviado ainda."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {agruparPorNicho(leads).map(([nicho, grupo]) => (
            <div key={nicho} className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">{nicho} ({grupo.length})</h3>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {grupo.map((lead) => (
                  <div key={lead.id} className="border border-border rounded-xl bg-card p-4 space-y-2">
                    <div>
                      <p className="font-medium text-sm truncate">{lead.empresa || lead.nome}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {lead.origem_metadata?.cidade || "—"}
                        {lead.origem_metadata?.categoria && ` · ${lead.origem_metadata.categoria}`}
                      </p>
                    </div>
                    {lead.whatsapp_enviado_em && (
                      <Badge variant="outline" className="text-xs">
                        Enviado {new Date(lead.whatsapp_enviado_em).toLocaleDateString("pt-BR")}
                      </Badge>
                    )}
                    <Button size="sm" className="w-full" onClick={() => gerar(lead)} disabled={gerandoId === lead.id}>
                      {gerandoId === lead.id
                        ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Gerando...</>
                        : <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Gerar abordagem</>}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!modal} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Abordagem · {modal?.lead.empresa || modal?.lead.nome}</DialogTitle>
          </DialogHeader>
          {modal && (
            <div className="space-y-3">
              <Textarea
                value={modal.mensagem}
                onChange={(e) => setModal({ ...modal, mensagem: e.target.value })}
                rows={6}
                className="text-sm font-mono"
              />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={copiar}>
                  <Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar
                </Button>
                <Button className="flex-1" onClick={abrirWhats}>
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Abrir WhatsApp
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
