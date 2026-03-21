import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  FileText, Plus, Loader2, Sparkles, Copy, Check, Send,
  Calendar, DollarSign, User, ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Proposta {
  id: string;
  titulo: string;
  tipo_servico: string;
  contexto_cliente: string;
  conteudo_gerado: string | null;
  valor_estimado: number | null;
  status: string;
  created_at: string;
  lead_id: string | null;
}

interface Lead {
  id: string;
  nome: string;
  empresa: string | null;
}

const TIPO_LABELS: Record<string, string> = {
  agente_ia: "Agente de IA",
  automacao: "Automação",
  sistema: "Sistema Personalizado",
};

const STATUS_COLORS: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  enviada: "bg-primary/20 text-primary",
  aceita: "bg-success/20 text-success",
  recusada: "bg-destructive/20 text-destructive",
};

function renderMarkdown(text: string) {
  return text
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold mt-4 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold mt-4 mb-2">$1</h1>')
    .replace(/^\*\*(.+)\*\*$/gm, '<strong>$1</strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^---$/gm, '<hr class="border-border my-3" />')
    .replace(/\n\n/g, '</p><p class="mb-2">')
    .replace(/\n/g, '<br />');
}

export default function Propostas() {
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedProposta, setSelectedProposta] = useState<Proposta | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { toast } = useToast();

  // Form state
  const [titulo, setTitulo] = useState("");
  const [tipoServico, setTipoServico] = useState("agente_ia");
  const [leadId, setLeadId] = useState<string>("none");
  const [contextoCliente, setContextoCliente] = useState("");
  const [valorEstimado, setValorEstimado] = useState("");
  const [conteudoGerado, setConteudoGerado] = useState("");

  useEffect(() => {
    fetchPropostas();
    fetchLeads();
  }, []);

  async function fetchPropostas() {
    setLoading(true);
    const { data } = await supabase
      .from("propostas")
      .select("*")
      .order("created_at", { ascending: false });
    setPropostas((data || []) as Proposta[]);
    setLoading(false);
  }

  async function fetchLeads() {
    const { data } = await supabase
      .from("leads")
      .select("id, nome, empresa")
      .not("status", "eq", "perdido")
      .order("nome");
    setLeads((data || []) as Lead[]);
  }

  async function handleGenerate() {
    if (!contextoCliente.trim()) {
      toast({ title: "Informe o contexto do cliente", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-proposal", {
        body: {
          lead_id: leadId !== "none" ? leadId : null,
          tipo_servico: tipoServico,
          contexto_cliente: contextoCliente,
          titulo,
        },
      });
      if (error || data?.error) {
        toast({ title: "Erro ao gerar proposta", description: error?.message || data?.error, variant: "destructive" });
      } else {
        setConteudoGerado(data.conteudo);
        if (!titulo) {
          const lead = leads.find(l => l.id === leadId);
          setTitulo(`Proposta ${TIPO_LABELS[tipoServico]} — ${lead?.empresa || lead?.nome || "Cliente"}`);
        }
        toast({ title: "Proposta gerada com sucesso!" });
      }
    } catch {
      toast({ title: "Erro ao gerar proposta", variant: "destructive" });
    }
    setGenerating(false);
  }

  async function handleSave() {
    if (!conteudoGerado || !titulo.trim()) {
      toast({ title: "Gere a proposta antes de salvar", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("propostas").insert({
      user_id: user.id,
      titulo: titulo.trim(),
      tipo_servico: tipoServico,
      contexto_cliente: contextoCliente,
      conteudo_gerado: conteudoGerado,
      valor_estimado: valorEstimado ? parseFloat(valorEstimado.replace(",", ".")) : null,
      lead_id: leadId !== "none" ? leadId : null,
      status: "rascunho",
    } as any);

    if (error) {
      toast({ title: "Erro ao salvar proposta", variant: "destructive" });
    } else {
      toast({ title: "Proposta salva!" });
      fetchPropostas();
      // Reset form
      setTitulo("");
      setContextoCliente("");
      setConteudoGerado("");
      setValorEstimado("");
      setLeadId("none");
    }
    setSaving(false);
  }

  async function handleStatusChange(propostaId: string, status: string) {
    await supabase.from("propostas").update({
      status,
      enviada_em: status === "enviada" ? new Date().toISOString() : undefined,
    } as any).eq("id", propostaId);
    fetchPropostas();
    if (selectedProposta?.id === propostaId) {
      setSelectedProposta(prev => prev ? { ...prev, status } : prev);
    }
  }

  function handleCopyConteudo() {
    const text = selectedProposta?.conteudo_gerado || conteudoGerado;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Propostas Comerciais</h1>
        <Badge variant="outline">{propostas.length} propostas</Badge>
      </div>

      <Tabs defaultValue="gerar">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="gerar"><Plus className="h-3.5 w-3.5 mr-1.5" />Gerar Proposta</TabsTrigger>
          <TabsTrigger value="lista"><FileText className="h-3.5 w-3.5 mr-1.5" />Minhas Propostas</TabsTrigger>
        </TabsList>

        {/* ABA: GERAR */}
        <TabsContent value="gerar" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Formulário */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Configurar Proposta</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Tipo de Serviço</Label>
                  <Select value={tipoServico} onValueChange={setTipoServico}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agente_ia">Agente de IA</SelectItem>
                      <SelectItem value="automacao">Automação de Processos</SelectItem>
                      <SelectItem value="sistema">Sistema Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Lead Vinculado (opcional)</Label>
                  <Select value={leadId} onValueChange={setLeadId}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecionar lead..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {leads.map(l => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.nome}{l.empresa ? ` — ${l.empresa}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Título da Proposta</Label>
                  <Input
                    value={titulo}
                    onChange={e => setTitulo(e.target.value)}
                    placeholder="Ex: Proposta Agente IA — Empresa XYZ"
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Valor Estimado (R$)</Label>
                  <Input
                    value={valorEstimado}
                    onChange={e => setValorEstimado(e.target.value)}
                    placeholder="Ex: 5000"
                    className="h-9 text-sm"
                    type="number"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Contexto do Cliente <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    value={contextoCliente}
                    onChange={e => setContextoCliente(e.target.value)}
                    placeholder="Descreva o cliente, o problema/oportunidade identificada, o que foi conversado, o que ele precisa, maturidade digital, etc. Quanto mais contexto, melhor a proposta."
                    className="min-h-[160px] text-sm resize-none bg-secondary/30"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Dica: inclua segmento, tamanho da empresa, principais dores e o que foi discutido na conversa.
                  </p>
                </div>

                <Button
                  onClick={handleGenerate}
                  disabled={generating || !contextoCliente.trim()}
                  className="w-full gradient-primary text-primary-foreground gap-2"
                >
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {generating ? "Gerando proposta..." : "Gerar Proposta com IA"}
                </Button>
              </CardContent>
            </Card>

            {/* Preview */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">Preview da Proposta</CardTitle>
                  {conteudoGerado && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleCopyConteudo}>
                        {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                        {copied ? "Copiado!" : "Copiar"}
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={saving}
                        className="h-7 text-xs gradient-primary text-primary-foreground gap-1"
                      >
                        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                        Salvar
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!conteudoGerado ? (
                  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground text-sm">
                    <FileText className="h-10 w-10 mb-3 opacity-30" />
                    <p>A proposta gerada aparecerá aqui</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[520px]">
                    <div
                      className="text-sm prose prose-sm max-w-none leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: `<p>${renderMarkdown(conteudoGerado)}</p>` }}
                    />
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ABA: LISTA */}
        <TabsContent value="lista" className="mt-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : propostas.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Nenhuma proposta ainda. Gere a primeira!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {propostas.map(proposta => (
                <Card
                  key={proposta.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => { setSelectedProposta(proposta); setDrawerOpen(true); }}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm line-clamp-2">{proposta.titulo}</p>
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{TIPO_LABELS[proposta.tipo_servico]}</Badge>
                      <Badge className={`text-[10px] ${STATUS_COLORS[proposta.status] || ""}`}>
                        {proposta.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(proposta.created_at), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                      {proposta.valor_estimado && (
                        <span className="flex items-center gap-1 text-success font-medium">
                          <DollarSign className="h-3 w-3" />
                          {Number(proposta.valor_estimado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Drawer de detalhe */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-2xl p-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-6 space-y-4">
              {selectedProposta && (
                <>
                  <SheetHeader>
                    <SheetTitle className="text-lg">{selectedProposta.titulo}</SheetTitle>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">{TIPO_LABELS[selectedProposta.tipo_servico]}</Badge>
                      <Badge className={STATUS_COLORS[selectedProposta.status] || ""}>
                        {selectedProposta.status}
                      </Badge>
                      {selectedProposta.valor_estimado && (
                        <span className="text-sm text-success font-medium flex items-center gap-1">
                          <DollarSign className="h-3.5 w-3.5" />
                          R$ {Number(selectedProposta.valor_estimado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                  </SheetHeader>

                  <div className="flex gap-2 flex-wrap">
                    {["rascunho", "enviada", "aceita", "recusada"].map(s => (
                      <Button
                        key={s}
                        size="sm"
                        variant={selectedProposta.status === s ? "default" : "outline"}
                        className="h-7 text-xs capitalize"
                        onClick={() => handleStatusChange(selectedProposta.id, s)}
                      >
                        {s === "enviada" && <Send className="h-3 w-3 mr-1" />}
                        {s}
                      </Button>
                    ))}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => {
                        navigator.clipboard.writeText(selectedProposta.conteudo_gerado || "");
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                    >
                      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                      Copiar
                    </Button>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contexto Fornecido</p>
                    <p className="text-sm bg-secondary/30 rounded p-3 whitespace-pre-wrap">{selectedProposta.contexto_cliente}</p>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Proposta Gerada</p>
                    {selectedProposta.conteudo_gerado ? (
                      <div
                        className="text-sm leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: `<p>${renderMarkdown(selectedProposta.conteudo_gerado)}</p>` }}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">Proposta não gerada.</p>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Criada em {format(new Date(selectedProposta.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
