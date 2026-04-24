import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText, Plus, Loader2, Sparkles, Copy, Check, Send,
  Calendar, DollarSign, ChevronRight, Download, Trash2, Pencil,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CurrencyInput } from "@/components/ui/currency-input";
import { parseBRL } from "@/lib/currency";

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

const MODELOS_COBRANCA = [
  { value: "agente_mensalidade", label: "Agente IA — Setup + Mensalidade" },
  { value: "sistema_5050",       label: "Sistema Personalizado — 50% entrada + 50% entrega" },
  { value: "sistema_3070",       label: "Sistema Personalizado — 30% entrada + 70% entrega" },
  { value: "automacao_unico",    label: "Automação — Valor único" },
  { value: "personalizado",      label: "Personalizado" },
] as const;

function formatarValor(valor: number | string): string {
  const num = typeof valor === "string" ? parseBRL(valor) : valor;
  if (!num) return "";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
}

// ─── Billing model fields ────────────────────────────────────────────────────
function CamposCobranca({ modelo, onChange }: {
  modelo: string;
  onChange: (resumo: string, valorNumerico: string) => void;
}) {
  const [setup, setSetup] = useState("");
  const [mensalidade, setMensalidade] = useState("");
  const [total, setTotal] = useState("");
  const [personalizado, setPersonalizado] = useState("");

  function emitir(newSetup = setup, newMens = mensalidade, newTotal = total, newCustom = personalizado) {
    let resumo = "";
    let valor = "";
    if (modelo === "agente_mensalidade") {
      resumo = `Setup: ${formatarValor(newSetup) || "R$ —"} + Mensalidade: ${formatarValor(newMens) || "R$ —"}/mês`;
      valor = newSetup;
    } else if (modelo === "sistema_5050") {
      const t = parseBRL(newTotal);
      resumo = `50%/50% — Entrada: ${formatarValor(t * 0.5)} | Na entrega: ${formatarValor(t * 0.5)}`;
      valor = newTotal;
    } else if (modelo === "sistema_3070") {
      const t = parseBRL(newTotal);
      resumo = `30%/70% — Entrada: ${formatarValor(t * 0.3)} | Na entrega: ${formatarValor(t * 0.7)}`;
      valor = newTotal;
    } else if (modelo === "automacao_unico") {
      resumo = `Valor único: ${formatarValor(newTotal) || "R$ —"}`;
      valor = newTotal;
    } else if (modelo === "personalizado") {
      resumo = newCustom;
      valor = "";
    }
    onChange(resumo, valor);
  }

  if (modelo === "agente_mensalidade") return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Valor do Setup (R$)</Label>
          <CurrencyInput value={setup} placeholder="3.000,00"
            onChange={v => { setSetup(v); emitir(v, mensalidade, total, personalizado); }} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Mensalidade (R$)</Label>
          <CurrencyInput value={mensalidade} placeholder="500,00"
            onChange={v => { setMensalidade(v); emitir(setup, v, total, personalizado); }} />
        </div>
      </div>
      {(setup || mensalidade) && (
        <p className="text-xs text-primary font-medium">
          Setup: {formatarValor(setup) || "R$ —"} + Mensalidade: {formatarValor(mensalidade) || "R$ —"}/mês
        </p>
      )}
    </div>
  );

  if (modelo === "sistema_5050" || modelo === "sistema_3070") {
    const pct = modelo === "sistema_5050" ? [0.5, 0.5] : [0.3, 0.7];
    const t = parseBRL(total);
    return (
      <div className="space-y-2">
        <div className="space-y-1">
          <Label className="text-xs">Valor Total do Projeto (R$)</Label>
          <CurrencyInput value={total} placeholder="10.000,00"
            onChange={v => { setTotal(v); emitir(setup, mensalidade, v, personalizado); }} />
        </div>
        {total && (
          <p className="text-xs text-primary font-medium">
            Entrada: {formatarValor(t * pct[0])} | Na entrega: {formatarValor(t * pct[1])}
          </p>
        )}
      </div>
    );
  }

  if (modelo === "automacao_unico") return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-xs">Valor Total (R$)</Label>
        <CurrencyInput value={total} placeholder="5.000,00"
          onChange={v => { setTotal(v); emitir(setup, mensalidade, v, personalizado); }} />
      </div>
      {total && <p className="text-xs text-primary font-medium">Valor único: {formatarValor(total)}</p>}
    </div>
  );

  if (modelo === "personalizado") return (
    <div className="space-y-1">
      <Label className="text-xs">Descrição do modelo de cobrança</Label>
      <Input value={personalizado} placeholder="Ex: 3 parcelas mensais de R$ 1.500,00"
        onChange={e => { setPersonalizado(e.target.value); emitir(setup, mensalidade, total, e.target.value); }} />
    </div>
  );

  return null;
}

// ─── Auto-growing iframe ─────────────────────────────────────────────────────
function PropostaIframe({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(800);

  function adjustHeight() {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc?.body) {
        setHeight(Math.max(doc.body.scrollHeight, 600));
      }
    } catch {
      setHeight(window.innerHeight);
    }
  }

  return (
    <iframe
      ref={iframeRef}
      srcDoc={html}
      onLoad={adjustHeight}
      style={{ width: "100%", height, display: "block", border: "none" }}
      title="Proposta gerada"
      sandbox="allow-same-origin"
    />
  );
}

// ─── Preview skeleton ─────────────────────────────────────────────────────────
function PropostaSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <Skeleton className="h-48 w-full rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Skeleton className="h-32 w-full rounded-lg" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
      <Skeleton className="h-20 w-full rounded-lg" />
    </div>
  );
}

// ─── PDF export ──────────────────────────────────────────────────────────────
async function exportarPDF(html: string, titulo: string) {
  if (!(window as any).html2pdf) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Falha ao carregar html2pdf"));
      document.head.appendChild(s);
    });
  }
  const container = document.createElement("div");
  container.innerHTML = html;
  container.style.position = "fixed";
  container.style.left = "-9999px";
  document.body.appendChild(container);
  const filename = `proposta-${titulo.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.pdf`;
  await (window as any).html2pdf().set({
    margin: 0,
    filename,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
  }).from(container).save();
  document.body.removeChild(container);
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function Propostas() {
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [selectedProposta, setSelectedProposta] = useState<Proposta | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [propostaToDelete, setPropostaToDelete] = useState<Proposta | null>(null);
  const [propostaToEdit, setPropostaToEdit] = useState<Proposta | null>(null);
  const [editTitulo, setEditTitulo] = useState("");
  const [editTipoServico, setEditTipoServico] = useState("agente_ia");
  const [editValor, setEditValor] = useState("");
  const [editStatus, setEditStatus] = useState("rascunho");
  const [editSaving, setEditSaving] = useState(false);
  const { toast } = useToast();

  // Form state
  const [titulo, setTitulo] = useState("");
  const [tipoServico, setTipoServico] = useState("agente_ia");
  const [leadId, setLeadId] = useState<string>("none");
  const [contextoCliente, setContextoCliente] = useState("");
  const [modeloCobranca, setModeloCobranca] = useState("agente_mensalidade");
  const [resumoCobranca, setResumoCobranca] = useState("");
  const [valorNumerico, setValorNumerico] = useState("");
  const [conteudoGerado, setConteudoGerado] = useState("");

  useEffect(() => { fetchPropostas(); fetchLeads(); }, []);

  async function fetchPropostas() {
    setLoading(true);
    const { data } = await supabase.from("propostas").select("*").order("created_at", { ascending: false });
    setPropostas((data || []) as Proposta[]);
    setLoading(false);
  }

  async function fetchLeads() {
    const { data } = await supabase.from("leads").select("id, nome, empresa").not("status", "eq", "perdido").order("nome");
    setLeads((data || []) as Lead[]);
  }

  async function handleGenerate() {
    if (!contextoCliente.trim()) {
      toast({ title: "Informe o contexto do cliente", variant: "destructive" });
      return;
    }
    setGenerating(true);
    setConteudoGerado("");
    try {
      const contextoCompleto = resumoCobranca
        ? `${contextoCliente}\n\nModelo de cobrança: ${resumoCobranca}`
        : contextoCliente;

      const { data, error } = await supabase.functions.invoke("generate-proposal", {
        body: {
          lead_id: leadId !== "none" ? leadId : null,
          tipo_servico: tipoServico,
          contexto_cliente: contextoCompleto,
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

    const valorNum = valorNumerico ? parseBRL(valorNumerico) : null;

    const { error } = await supabase.from("propostas").insert({
      user_id: user.id, titulo: titulo.trim(), tipo_servico: tipoServico,
      contexto_cliente: contextoCliente, conteudo_gerado: conteudoGerado,
      valor_estimado: valorNum, lead_id: leadId !== "none" ? leadId : null, status: "rascunho",
    } as any);

    if (error) {
      toast({ title: "Erro ao salvar proposta", variant: "destructive" });
    } else {
      toast({ title: "Proposta salva!" });
      fetchPropostas();
      setTitulo(""); setContextoCliente(""); setConteudoGerado(""); setValorNumerico(""); setLeadId("none"); setResumoCobranca("");
    }
    setSaving(false);
  }

  async function handleStatusChange(propostaId: string, status: string) {
    await supabase.from("propostas").update({
      status,
      enviada_em: status === "enviada" ? new Date().toISOString() : undefined,
    } as any).eq("id", propostaId);
    fetchPropostas();
    if (selectedProposta?.id === propostaId) setSelectedProposta(prev => prev ? { ...prev, status } : prev);
  }

  function openEdit(proposta: Proposta) {
    setPropostaToEdit(proposta);
    setEditTitulo(proposta.titulo);
    setEditTipoServico(proposta.tipo_servico);
    setEditValor(proposta.valor_estimado != null ? String(proposta.valor_estimado) : "");
    setEditStatus(proposta.status);
  }

  async function handleSaveEdit() {
    if (!propostaToEdit) return;
    setEditSaving(true);
    const { error } = await supabase.from("propostas").update({
      titulo: editTitulo.trim(),
      tipo_servico: editTipoServico,
      valor_estimado: editValor ? parseBRL(editValor) : null,
      status: editStatus,
    } as any).eq("id", propostaToEdit.id);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Proposta atualizada!" });
      fetchPropostas();
      setPropostaToEdit(null);
    }
    setEditSaving(false);
  }

  async function handleDelete(proposta: Proposta) {
    const { error } = await supabase.from("propostas").delete().eq("id", proposta.id);
    if (error) {
      toast({ title: "Erro ao excluir proposta", variant: "destructive" });
    } else {
      setPropostas(prev => prev.filter(p => p.id !== proposta.id));
      if (selectedProposta?.id === proposta.id) {
        setDrawerOpen(false);
        setSelectedProposta(null);
      }
      toast({ title: "Proposta excluída" });
    }
    setPropostaToDelete(null);
  }

  async function handleExportPDF(html: string, tituloDoc: string) {
    setExportingPdf(true);
    try {
      await exportarPDF(html, tituloDoc);
    } catch (e) {
      toast({ title: "Erro ao exportar PDF", description: String(e), variant: "destructive" });
    }
    setExportingPdf(false);
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
                        <SelectItem key={l.id} value={l.id}>{l.nome}{l.empresa ? ` — ${l.empresa}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Título da Proposta</Label>
                  <Input value={titulo} onChange={e => setTitulo(e.target.value)}
                    placeholder="Ex: Proposta Agente IA — Empresa XYZ" className="h-9 text-sm" />
                </div>

                {/* Modelo de cobrança */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Modelo de Cobrança</Label>
                  <Select value={modeloCobranca} onValueChange={v => { setModeloCobranca(v); setResumoCobranca(""); setValorNumerico(""); }}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MODELOS_COBRANCA.map(m => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <CamposCobranca
                  modelo={modeloCobranca}
                  onChange={(resumo, valor) => { setResumoCobranca(resumo); setValorNumerico(valor); }}
                />

                <div className="space-y-1.5">
                  <Label className="text-xs">Contexto do Cliente <span className="text-destructive">*</span></Label>
                  <Textarea value={contextoCliente} onChange={e => setContextoCliente(e.target.value)}
                    placeholder="Descreva o cliente, o problema/oportunidade identificada, o que foi conversado, maturidade digital, etc."
                    className="min-h-[140px] text-sm resize-none bg-secondary/30" />
                  <p className="text-[10px] text-muted-foreground">Dica: inclua segmento, tamanho da empresa, principais dores.</p>
                </div>

                <Button onClick={handleGenerate} disabled={generating || !contextoCliente.trim()}
                  className="w-full gradient-primary text-primary-foreground gap-2">
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
                  {conteudoGerado && !generating && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                        onClick={() => { navigator.clipboard.writeText(conteudoGerado); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                        {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                        {copied ? "Copiado!" : "Copiar"}
                      </Button>
                      <Button size="sm" onClick={handleSave} disabled={saving}
                        className="h-7 text-xs gradient-primary text-primary-foreground gap-1">
                        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                        Salvar
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0 overflow-hidden rounded-b-lg">
                {generating ? (
                  <PropostaSkeleton />
                ) : !conteudoGerado ? (
                  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground text-sm">
                    <FileText className="h-10 w-10 mb-3 opacity-30" />
                    <p>A proposta gerada aparecerá aqui</p>
                  </div>
                ) : (
                  <div className="overflow-y-auto max-h-[600px]">
                    <PropostaIframe html={conteudoGerado} />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ABA: LISTA */}
        <TabsContent value="lista" className="mt-4">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : propostas.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Nenhuma proposta ainda. Gere a primeira!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {propostas.map(proposta => (
                <Card key={proposta.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors group relative"
                  onClick={() => { setSelectedProposta(proposta); setDrawerOpen(true); }}>
                  {/* Edit + Trash — visible on card hover */}
                  <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="p-1.5 rounded hover:bg-primary/10"
                      onClick={e => { e.stopPropagation(); openEdit(proposta); }}
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button
                      className="p-1.5 rounded hover:bg-destructive/10"
                      onClick={e => { e.stopPropagation(); setPropostaToDelete(proposta); }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  </div>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2 pr-6">
                      <p className="font-medium text-sm line-clamp-2">{proposta.titulo}</p>
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{TIPO_LABELS[proposta.tipo_servico]}</Badge>
                      <Badge className={`text-[10px] ${STATUS_COLORS[proposta.status] || ""}`}>{proposta.status}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(proposta.created_at), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                      {proposta.valor_estimado != null && (
                        <span className="flex items-center gap-1 text-success font-medium">
                          <DollarSign className="h-3 w-3" />
                          {formatarValor(proposta.valor_estimado)}
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

      {/* Fullscreen dialog */}
      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogContent
          className="flex flex-col p-0 overflow-hidden"
          style={{ maxWidth: "95vw", width: "95vw", height: "95vh", maxHeight: "95vh" }}
        >
          {selectedProposta && (
            <>
              {/* Fixed header */}
              <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-border space-y-3">
                <DialogHeader>
                  <div className="flex items-start justify-between gap-4 pr-8">
                    <div className="space-y-1 min-w-0">
                      <h2 className="text-lg font-semibold truncate">{selectedProposta.titulo}</h2>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline">{TIPO_LABELS[selectedProposta.tipo_servico]}</Badge>
                        <Badge className={STATUS_COLORS[selectedProposta.status] || ""}>{selectedProposta.status}</Badge>
                        {selectedProposta.valor_estimado != null && (
                          <span className="text-sm text-success font-medium flex items-center gap-1">
                            <DollarSign className="h-3.5 w-3.5" />
                            {formatarValor(selectedProposta.valor_estimado)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </DialogHeader>

                <div className="flex gap-2 flex-wrap">
                  {["rascunho", "enviada", "aceita", "recusada"].map(s => (
                    <Button key={s} size="sm"
                      variant={selectedProposta.status === s ? "default" : "outline"}
                      className="h-7 text-xs capitalize"
                      onClick={() => handleStatusChange(selectedProposta.id, s)}>
                      {s === "enviada" && <Send className="h-3 w-3 mr-1" />}
                      {s}
                    </Button>
                  ))}
                  {selectedProposta.conteudo_gerado && (
                    <Button size="sm" variant="outline"
                      className="h-7 text-xs gap-1 text-primary border-primary/30 hover:bg-primary/10"
                      onClick={() => handleExportPDF(selectedProposta.conteudo_gerado!, selectedProposta.titulo)}
                      disabled={exportingPdf}>
                      {exportingPdf ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                      {exportingPdf ? "Gerando..." : "Exportar PDF"}
                    </Button>
                  )}
                  <Button size="sm" variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => openEdit(selectedProposta)}>
                    <Pencil className="h-3 w-3" />
                    Editar
                  </Button>
                  <Button size="sm" variant="outline"
                    className="h-7 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => setPropostaToDelete(selectedProposta)}>
                    <Trash2 className="h-3 w-3" />
                    Excluir
                  </Button>
                </div>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto">
                {/* Contexto */}
                <div className="px-6 py-4 space-y-2 border-b border-border">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contexto Fornecido</p>
                  <p className="text-sm bg-secondary/30 rounded p-3 whitespace-pre-wrap">{selectedProposta.contexto_cliente}</p>
                </div>

                {/* Proposta gerada — iframe fullwidth */}
                <div className="py-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-6">Proposta Gerada</p>
                  {selectedProposta.conteudo_gerado ? (
                    <PropostaIframe html={selectedProposta.conteudo_gerado} />
                  ) : (
                    <p className="text-sm text-muted-foreground px-6">Proposta não gerada.</p>
                  )}
                </div>

                <div className="px-6 pb-4 text-xs text-muted-foreground">
                  Criada em {format(new Date(selectedProposta.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!propostaToEdit} onOpenChange={open => { if (!open) setPropostaToEdit(null); }}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader><DialogTitle>Editar Proposta</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Título</Label>
              <Input value={editTitulo} onChange={e => setEditTitulo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de Serviço</Label>
              <Select value={editTipoServico} onValueChange={setEditTipoServico}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agente_ia">Agente de IA</SelectItem>
                  <SelectItem value="automacao">Automação</SelectItem>
                  <SelectItem value="sistema">Sistema Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Valor Estimado (R$)</Label>
              <CurrencyInput value={editValor} onChange={setEditValor} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rascunho">Rascunho</SelectItem>
                  <SelectItem value="enviada">Enviada</SelectItem>
                  <SelectItem value="aceita">Aceita</SelectItem>
                  <SelectItem value="recusada">Recusada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setPropostaToEdit(null)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={editSaving} className="gradient-primary text-primary-foreground">
              {editSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!propostaToDelete} onOpenChange={open => { if (!open) setPropostaToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir proposta</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a proposta "{propostaToDelete?.titulo}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => propostaToDelete && handleDelete(propostaToDelete)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
