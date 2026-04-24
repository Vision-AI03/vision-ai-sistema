import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Plus, FileText, Upload, Sparkles, Loader2, FolderOpen, Wand2, Files } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, addMonths } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { CurrencyInput } from "@/components/ui/currency-input";
import { parseBRL } from "@/lib/currency";
import ContratoDrawer from "@/components/contratos/ContratoDrawer";
import ModelosTab from "@/components/contratos/ModelosTab";
import PreencherContratoTab from "@/components/contratos/PreencherContratoTab";
import ContratosPreenchidosTab from "@/components/contratos/ContratosPreenchidosTab";
import type { Tables } from "@/integrations/supabase/types";

type Contrato = Tables<"contratos">;

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function getStatusBadge(status: string) {
  switch (status) {
    case "ativo": return "bg-success/20 text-success";
    case "encerrado": return "bg-muted text-muted-foreground";
    case "pendente_assinatura": return "bg-warning/20 text-warning";
    default: return "bg-muted text-muted-foreground";
  }
}

const TIPO_SERVICO_LABELS: Record<string, string> = {
  agente_ia: "Agente IA",
  automacao: "Automação",
  sistema: "Sistema",
  manutencao: "Manutenção",
};

export default function Contratos() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [modelos, setModelos] = useState<any[]>([]);
  const [contratosPreenchidos, setContratosPreenchidos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoOpen, setNovoOpen] = useState(false);
  const [drawerContrato, setDrawerContrato] = useState<Contrato | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("contratos");
  const { toast } = useToast();

  // Form state for manual contracts
  const [clienteNome, setClienteNome] = useState("");
  const [clienteEmail, setClienteEmail] = useState("");
  const [clienteTelefone, setClienteTelefone] = useState("");
  const [tipoServico, setTipoServico] = useState("agente_ia");
  const [valorTotal, setValorTotal] = useState("");
  const [numParcelas, setNumParcelas] = useState("1");
  const [valorEntrada, setValorEntrada] = useState("");
  const [valorRecorrencia, setValorRecorrencia] = useState("");
  const [diaVencimento, setDiaVencimento] = useState("10");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    const [cRes, mRes, pRes] = await Promise.all([
      supabase.from("contratos").select("*").order("criado_em", { ascending: false }),
      supabase.from("modelo_contratos").select("*").order("created_at", { ascending: false }),
      supabase
        .from("contratos_preenchidos")
        .select("*, modelo_contratos(nome)")
        .order("created_at", { ascending: false }),
    ]);
    setContratos(cRes.data || []);
    setModelos((mRes.data as any[]) || []);
    setContratosPreenchidos((pRes.data as any[]) || []);
    setLoading(false);
  }

  function resetForm() {
    setClienteNome(""); setClienteEmail(""); setClienteTelefone("");
    setTipoServico("agente_ia"); setValorTotal(""); setNumParcelas("1");
    setValorEntrada(""); setValorRecorrencia(""); setDiaVencimento("10");
    setPdfFile(null); setExtracting(false);
  }

  async function handlePdfUpload(file: File) {
    setPdfFile(file);
    setExtracting(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      const { data, error } = await supabase.functions.invoke("extract-contract-data", {
        body: { pdf_base64: base64, file_name: file.name },
      });
      if (error || data?.error) {
        toast({ title: "Erro na extração com IA", description: error?.message || data?.error, variant: "destructive" });
        setExtracting(false);
        return;
      }
      const d = data.data;
      if (d.cliente_nome) setClienteNome(d.cliente_nome);
      if (d.cliente_email) setClienteEmail(d.cliente_email);
      if (d.cliente_telefone) setClienteTelefone(d.cliente_telefone);
      if (d.tipo_servico) setTipoServico(d.tipo_servico);
      if (d.valor_total != null) setValorTotal(String(d.valor_total));
      if (d.num_parcelas != null) setNumParcelas(String(d.num_parcelas));
      if (d.valor_entrada != null) setValorEntrada(String(d.valor_entrada));
      if (d.valor_recorrencia != null) setValorRecorrencia(String(d.valor_recorrencia));
      if (d.dia_vencimento != null) setDiaVencimento(String(d.dia_vencimento));
      toast({ title: "Dados extraídos com IA!", description: "Revise os campos preenchidos automaticamente." });
    } catch {
      toast({ title: "Erro ao processar PDF", variant: "destructive" });
    }
    setExtracting(false);
  }

  async function handleSalvar() {
    if (!clienteNome || !valorTotal) {
      toast({ title: "Preencha nome do cliente e valor total", variant: "destructive" });
      return;
    }
    setSaving(true);
    let pdfUrl: string | null = null;
    if (pdfFile) {
      const fileName = `${Date.now()}_${pdfFile.name}`;
      const { error: uploadError } = await supabase.storage.from("contratos-pdf").upload(fileName, pdfFile);
      if (uploadError) {
        toast({ title: "Erro ao enviar PDF", description: uploadError.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      pdfUrl = fileName;
    }
    const { data: contrato, error } = await supabase.from("contratos").insert({
      cliente_nome: clienteNome.trim(),
      cliente_email: clienteEmail.trim() || null,
      cliente_telefone: clienteTelefone.trim() || null,
      tipo_servico: tipoServico,
      valor_total: parseBRL(valorTotal),
      status: "pendente_assinatura",
      pdf_url: pdfUrl,
    }).select().maybeSingle();
    if (error || !contrato) {
      toast({ title: "Erro ao criar contrato", description: error?.message, variant: "destructive" });
      setSaving(false);
      return;
    }
    const total = parseBRL(valorTotal);
    const entrada = parseBRL(valorEntrada);
    const parcelas = parseInt(numParcelas) || 1;
    const valorRestante = total - entrada;
    const valorParcela = parcelas > 0 ? valorRestante / parcelas : 0;
    const parcelasInsert = [];
    if (entrada > 0) {
      parcelasInsert.push({ contrato_id: contrato.id, descricao: "Entrada", valor: entrada, data_vencimento: format(new Date(), "yyyy-MM-dd"), status: "pendente" });
    }
    for (let i = 0; i < parcelas; i++) {
      parcelasInsert.push({ contrato_id: contrato.id, descricao: `Parcela ${i + 1}/${parcelas}`, valor: Math.round(valorParcela * 100) / 100, data_vencimento: format(addMonths(new Date(), i + 1), "yyyy-MM-dd"), status: "pendente" });
    }
    if (parcelasInsert.length > 0) await supabase.from("parcelas").insert(parcelasInsert);
    const recorrencia = parseBRL(valorRecorrencia);
    if (recorrencia > 0) {
      await supabase.from("recorrencias").insert({ contrato_id: contrato.id, valor_mensal: recorrencia, dia_vencimento: parseInt(diaVencimento) || 10, ativo: false });
    }
    toast({ title: "Contrato criado com sucesso!" });
    setNovoOpen(false);
    resetForm();
    fetchAll();
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Contratos</h1>
        <p className="text-sm text-muted-foreground">Gerencie contratos, modelos e utilize IA para preencher automaticamente.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="contratos" className="gap-2">
            <FileText className="h-4 w-4" />
            Contratos
            {contratos.length > 0 && <Badge variant="secondary" className="ml-1 text-xs">{contratos.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="modelos" className="gap-2">
            <FolderOpen className="h-4 w-4" />
            Modelos
            {modelos.length > 0 && <Badge variant="secondary" className="ml-1 text-xs">{modelos.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="preencher" className="gap-2">
            <Wand2 className="h-4 w-4" />
            Preencher com IA
          </TabsTrigger>
          <TabsTrigger value="preenchidos" className="gap-2">
            <Files className="h-4 w-4" />
            Preenchidos
            {contratosPreenchidos.length > 0 && <Badge variant="secondary" className="ml-1 text-xs">{contratosPreenchidos.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* Contratos (manual/legacy) */}
        <TabsContent value="contratos">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="h-4 w-4 mr-2" />Novo Contrato Manual</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-xl bg-card border-border max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Novo Contrato</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>PDF do Contrato (opcional)</Label>
                      <label className="flex-1 cursor-pointer block">
                        <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border p-4 hover:border-primary/50 transition-colors">
                          {extracting ? (
                            <><Loader2 className="h-5 w-5 text-primary animate-spin" /><span className="text-sm text-primary">Extraindo dados com IA...</span></>
                          ) : (
                            <>{pdfFile ? <Sparkles className="h-5 w-5 text-primary" /> : <Upload className="h-5 w-5 text-muted-foreground" />}<span className="text-sm text-muted-foreground">{pdfFile ? pdfFile.name : "Envie um PDF para preencher automaticamente"}</span></>
                          )}
                        </div>
                        <input type="file" accept=".pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfUpload(f); }} />
                      </label>
                    </div>
                    <Separator />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5"><Label className="text-xs">Nome do Cliente *</Label><Input value={clienteNome} onChange={e => setClienteNome(e.target.value)} placeholder="Nome completo" /></div>
                      <div className="space-y-1.5"><Label className="text-xs">Email</Label><Input type="email" value={clienteEmail} onChange={e => setClienteEmail(e.target.value)} placeholder="email@cliente.com" /></div>
                      <div className="space-y-1.5"><Label className="text-xs">Telefone</Label><Input value={clienteTelefone} onChange={e => setClienteTelefone(e.target.value)} placeholder="(11) 99999-0000" /></div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Tipo de Serviço</Label>
                        <Select value={tipoServico} onValueChange={setTipoServico}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="agente_ia">Agente IA</SelectItem><SelectItem value="automacao">Automação</SelectItem><SelectItem value="sistema">Sistema</SelectItem><SelectItem value="manutencao">Manutenção</SelectItem></SelectContent></Select>
                      </div>
                    </div>
                    <Separator />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5"><Label className="text-xs">Valor Total *</Label><CurrencyInput value={valorTotal} onChange={setValorTotal} placeholder="5.000,00" /></div>
                      <div className="space-y-1.5"><Label className="text-xs">Valor da Entrada</Label><CurrencyInput value={valorEntrada} onChange={setValorEntrada} placeholder="0,00" /></div>
                      <div className="space-y-1.5"><Label className="text-xs">Número de Parcelas</Label><Input type="number" value={numParcelas} onChange={e => setNumParcelas(e.target.value)} placeholder="3" min="1" /></div>
                    </div>
                    <Separator />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5"><Label className="text-xs">Recorrência Mensal (R$)</Label><CurrencyInput value={valorRecorrencia} onChange={setValorRecorrencia} placeholder="0,00 = sem recorrência" /></div>
                      <div className="space-y-1.5"><Label className="text-xs">Dia do Vencimento</Label><Input type="number" value={diaVencimento} onChange={e => setDiaVencimento(e.target.value)} placeholder="10" min="1" max="31" /></div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" onClick={() => setNovoOpen(false)}>Cancelar</Button>
                      <Button onClick={handleSalvar} disabled={saving}>{saving ? "Salvando..." : "Salvar Contrato"}</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {contratos.length === 0 ? (
              <Card className="glass-card">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground">Nenhum contrato cadastrado ainda.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {contratos.map(c => (
                  <Card key={c.id} className="glass-card cursor-pointer hover:border-primary/30 transition-colors" onClick={() => { setDrawerContrato(c); setDrawerOpen(true); }}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold truncate">{c.cliente_nome}</p>
                            <Badge className={`text-[10px] ${getStatusBadge(c.status)}`}>{c.status.replace("_", " ")}</Badge>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>{TIPO_SERVICO_LABELS[c.tipo_servico] || c.tipo_servico}</span>
                            <span>{formatCurrency(Number(c.valor_total))}</span>
                            <span>{format(new Date(c.criado_em), "dd/MM/yyyy")}</span>
                          </div>
                        </div>
                        {c.pdf_url && <FileText className="h-4 w-4 text-primary flex-shrink-0" />}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Modelos */}
        <TabsContent value="modelos">
          <ModelosTab modelos={modelos} onRefresh={fetchAll} />
        </TabsContent>

        {/* Preencher com IA */}
        <TabsContent value="preencher">
          <PreencherContratoTab
            modelos={modelos}
            onContratoCriado={() => { fetchAll(); setActiveTab("preenchidos"); }}
          />
        </TabsContent>

        {/* Preenchidos */}
        <TabsContent value="preenchidos">
          <ContratosPreenchidosTab contratos={contratosPreenchidos} onRefresh={fetchAll} />
        </TabsContent>
      </Tabs>

      <ContratoDrawer contrato={drawerContrato} open={drawerOpen} onClose={() => setDrawerOpen(false)} onUpdate={fetchAll} />
    </div>
  );
}
