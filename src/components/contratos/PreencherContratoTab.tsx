import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sparkles, Loader2, Copy, Check, Download, Save, ChevronDown, ChevronUp,
  User, Building2, DollarSign, FileText,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import JSZip from "jszip";

interface Modelo { id: string; nome: string; conteudo_texto: string | null; }
interface Lead { id: string; nome: string; empresa: string | null; email: string | null; telefone: string | null; }

interface DadosPrestador {
  nome_completo: string; cpf_cnpj: string; endereco: string;
  cidade_uf: string; telefone: string; email: string; nome_empresa: string;
}

interface DadosCliente {
  nome_completo: string; cpf_cnpj: string; endereco: string;
  cidade_uf: string; telefone: string; email: string;
}

interface Valores {
  valor_setup: string; valor_mensalidade: string; descricao_servico: string;
  data_inicio: string; vigencia_meses: string;
}

const EMPTY_PRESTADOR: DadosPrestador = {
  nome_completo: "", cpf_cnpj: "", endereco: "", cidade_uf: "", telefone: "", email: "", nome_empresa: "",
};

const EMPTY_CLIENTE: DadosCliente = {
  nome_completo: "", cpf_cnpj: "", endereco: "", cidade_uf: "", telefone: "", email: "",
};

const EMPTY_VALORES: Valores = {
  valor_setup: "", valor_mensalidade: "", descricao_servico: "", data_inicio: "", vigencia_meses: "12",
};

// Gera .docx mínimo válido via JSZip
async function gerarDocx(texto: string): Promise<Blob> {
  const paragrafos = texto.split("\n").map(linha => {
    const escapado = linha
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    return `<w:p><w:r><w:t xml:space="preserve">${escapado}</w:t></w:r></w:p>`;
  }).join("\n");

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
  xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
  xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
  mc:Ignorable="w14 wp14 cx">
  <w:body>
    ${paragrafos}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const wordRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypesXml);
  zip.file("_rels/.rels", relsXml);
  zip.file("word/document.xml", documentXml);
  zip.file("word/_rels/document.xml.rels", wordRelsXml);

  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

interface PreencherContratoTabProps {
  modelos: Modelo[];
  onContratoCriado: () => void;
}

export default function PreencherContratoTab({ modelos, onContratoCriado }: PreencherContratoTabProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [modeloSelecionado, setModeloSelecionado] = useState<string>("none");
  const [leadSelecionado, setLeadSelecionado] = useState<string>("none");
  const [prestador, setPrestador] = useState<DadosPrestador>(EMPTY_PRESTADOR);
  const [prestadorOpen, setPrestadorOpen] = useState(false);
  const [prestadorId, setPrestadorId] = useState<string | null>(null);
  const [cliente, setCliente] = useState<DadosCliente>(EMPTY_CLIENTE);
  const [valores, setValores] = useState<Valores>(EMPTY_VALORES);
  const [filling, setFilling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPrestador, setSavingPrestador] = useState(false);
  const [conteudoGerado, setConteudoGerado] = useState("");
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchLeads();
    fetchPerfil();
  }, []);

  // Preenche dados do cliente quando lead é selecionado
  useEffect(() => {
    if (leadSelecionado !== "none") {
      const lead = leads.find(l => l.id === leadSelecionado);
      if (lead) {
        setCliente(prev => ({
          ...prev,
          nome_completo: lead.nome,
          email: lead.email || "",
          telefone: lead.telefone || "",
        }));
      }
    }
  }, [leadSelecionado, leads]);

  async function fetchLeads() {
    const { data } = await supabase.from("leads").select("id, nome, empresa, email, telefone").order("nome");
    setLeads((data || []) as Lead[]);
  }

  async function fetchPerfil() {
    const { data } = await supabase.from("perfil_prestador").select("*").maybeSingle();
    if (data) {
      setPrestadorId(data.id);
      setPrestador({
        nome_completo: data.nome_completo || "",
        cpf_cnpj: data.cpf_cnpj || "",
        endereco: data.endereco || "",
        cidade_uf: data.cidade_uf || "",
        telefone: data.telefone || "",
        email: data.email || "",
        nome_empresa: data.nome_empresa || "",
      });
    }
  }

  async function handleSalvarPerfil() {
    setSavingPrestador(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const payload = { user_id: user.id, ...prestador, updated_at: new Date().toISOString() };
    let error;

    if (prestadorId) {
      ({ error } = await supabase.from("perfil_prestador").update(payload as any).eq("id", prestadorId));
    } else {
      const { data, error: insertError } = await supabase.from("perfil_prestador").insert(payload as any).select().single();
      error = insertError;
      if (data) setPrestadorId(data.id);
    }

    if (error) {
      toast({ title: "Erro ao salvar perfil", variant: "destructive" });
    } else {
      toast({ title: "Perfil salvo! Será reutilizado em todos os contratos." });
    }
    setSavingPrestador(false);
  }

  function updatePrestador(key: keyof DadosPrestador, val: string) {
    setPrestador(prev => ({ ...prev, [key]: val }));
  }

  function updateCliente(key: keyof DadosCliente, val: string) {
    setCliente(prev => ({ ...prev, [key]: val }));
  }

  function updateValores(key: keyof Valores, val: string) {
    setValores(prev => ({ ...prev, [key]: val }));
  }

  async function handlePreencher() {
    const modelo = modelos.find(m => m.id === modeloSelecionado);
    if (!modelo) {
      toast({ title: "Selecione um modelo", variant: "destructive" });
      return;
    }
    if (!modelo.conteudo_texto) {
      toast({ title: "Modelo sem conteúdo de texto", description: "Edite o modelo e adicione o texto do contrato.", variant: "destructive" });
      return;
    }
    if (!cliente.nome_completo) {
      toast({ title: "Informe o nome do cliente", variant: "destructive" });
      return;
    }

    setFilling(true);
    try {
      const { data, error } = await supabase.functions.invoke("fill-contract-model", {
        body: {
          modelo_texto: modelo.conteudo_texto,
          dados_prestador: prestador,
          dados_cliente: cliente,
          valores,
        },
      });

      if (error || data?.error) {
        toast({ title: "Erro ao preencher contrato", description: error?.message || data?.error, variant: "destructive" });
      } else {
        setConteudoGerado(data.conteudo);
        toast({ title: "Contrato preenchido com sucesso!" });
      }
    } catch {
      toast({ title: "Erro ao preencher contrato", variant: "destructive" });
    }
    setFilling(false);
  }

  async function handleSalvar() {
    if (!conteudoGerado) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("contratos_preenchidos").insert({
      user_id: user.id,
      modelo_id: modeloSelecionado !== "none" ? modeloSelecionado : null,
      lead_id: leadSelecionado !== "none" ? leadSelecionado : null,
      nome_cliente: cliente.nome_completo,
      conteudo_preenchido: conteudoGerado,
      dados_formulario: { prestador, cliente, valores },
      status: "gerado",
    } as any);

    if (error) {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } else {
      toast({ title: "Contrato salvo!" });
      onContratoCriado();
      setConteudoGerado("");
    }
    setSaving(false);
  }

  async function handleDownloadDocx() {
    if (!conteudoGerado) return;
    const blob = await gerarDocx(conteudoGerado);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Contrato - ${cliente.nome_completo || "cliente"}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCopy() {
    navigator.clipboard.writeText(conteudoGerado);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {/* Coluna esquerda: formulário */}
      <div className="space-y-4">
        {/* Seleção de modelo e lead */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Configuração
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Modelo de Contrato <span className="text-destructive">*</span></Label>
              <Select value={modeloSelecionado} onValueChange={setModeloSelecionado}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um modelo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>Selecione um modelo...</SelectItem>
                  {modelos.length === 0 ? (
                    <SelectItem value="empty" disabled>Nenhum modelo cadastrado</SelectItem>
                  ) : (
                    modelos.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {modelos.length === 0 && (
                <p className="text-[10px] text-muted-foreground">Cadastre modelos na aba "Modelos" primeiro.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Vincular a Lead (opcional)</Label>
              <Select value={leadSelecionado} onValueChange={setLeadSelecionado}>
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
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
          </CardContent>
        </Card>

        {/* Meus dados (prestador) */}
        <Card>
          <CardContent className="p-0">
            <Collapsible open={prestadorOpen} onOpenChange={setPrestadorOpen}>
              <CollapsibleTrigger className="w-full flex items-center justify-between p-4 hover:bg-secondary/20 transition-colors rounded-lg">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Meus dados (prestador)</span>
                  {prestadorId && (
                    <span className="text-[10px] text-success bg-success/10 px-1.5 py-0.5 rounded-full">Salvo</span>
                  )}
                </div>
                {prestadorOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 space-y-3">
                  <Separator className="mb-3" />
                  <p className="text-[10px] text-muted-foreground">Preenchido uma vez e reutilizado automaticamente em todos os contratos.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1 col-span-2">
                      <Label className="text-[10px]">Nome Completo</Label>
                      <Input value={prestador.nome_completo} onChange={e => updatePrestador("nome_completo", e.target.value)} className="h-8 text-xs" placeholder="Seu nome completo" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">CPF / CNPJ</Label>
                      <Input value={prestador.cpf_cnpj} onChange={e => updatePrestador("cpf_cnpj", e.target.value)} className="h-8 text-xs" placeholder="000.000.000-00" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Nome da Empresa</Label>
                      <Input value={prestador.nome_empresa} onChange={e => updatePrestador("nome_empresa", e.target.value)} className="h-8 text-xs" placeholder="Vision AI LTDA" />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-[10px]">Endereço</Label>
                      <Input value={prestador.endereco} onChange={e => updatePrestador("endereco", e.target.value)} className="h-8 text-xs" placeholder="Rua, número, bairro" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Cidade / UF</Label>
                      <Input value={prestador.cidade_uf} onChange={e => updatePrestador("cidade_uf", e.target.value)} className="h-8 text-xs" placeholder="São Paulo / SP" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Telefone</Label>
                      <Input value={prestador.telefone} onChange={e => updatePrestador("telefone", e.target.value)} className="h-8 text-xs" placeholder="(11) 99999-0000" />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-[10px]">E-mail</Label>
                      <Input value={prestador.email} onChange={e => updatePrestador("email", e.target.value)} className="h-8 text-xs" placeholder="seu@email.com" />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleSalvarPerfil}
                    disabled={savingPrestador}
                    className="w-full h-8 text-xs gradient-primary text-primary-foreground gap-1.5"
                  >
                    {savingPrestador ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    {savingPrestador ? "Salvando..." : "Salvar Meu Perfil"}
                  </Button>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        {/* Dados do cliente */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Dados do Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1 col-span-2">
                <Label className="text-[10px]">Nome Completo <span className="text-destructive">*</span></Label>
                <Input value={cliente.nome_completo} onChange={e => updateCliente("nome_completo", e.target.value)} className="h-8 text-xs" placeholder="Nome do cliente" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">CPF / CNPJ</Label>
                <Input value={cliente.cpf_cnpj} onChange={e => updateCliente("cpf_cnpj", e.target.value)} className="h-8 text-xs" placeholder="000.000.000-00" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Telefone</Label>
                <Input value={cliente.telefone} onChange={e => updateCliente("telefone", e.target.value)} className="h-8 text-xs" placeholder="(11) 99999-0000" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-[10px]">Endereço</Label>
                <Input value={cliente.endereco} onChange={e => updateCliente("endereco", e.target.value)} className="h-8 text-xs" placeholder="Rua, número, bairro" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Cidade / UF</Label>
                <Input value={cliente.cidade_uf} onChange={e => updateCliente("cidade_uf", e.target.value)} className="h-8 text-xs" placeholder="Cidade / UF" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">E-mail</Label>
                <Input value={cliente.email} onChange={e => updateCliente("email", e.target.value)} className="h-8 text-xs" placeholder="cliente@email.com" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Valores */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Valores e Escopo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px]">Valor do Setup (R$)</Label>
                <Input type="number" value={valores.valor_setup} onChange={e => updateValores("valor_setup", e.target.value)} className="h-8 text-xs" placeholder="5000" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Valor da Mensalidade (R$)</Label>
                <Input type="number" value={valores.valor_mensalidade} onChange={e => updateValores("valor_mensalidade", e.target.value)} className="h-8 text-xs" placeholder="1500" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Data de Início</Label>
                <Input type="date" value={valores.data_inicio} onChange={e => updateValores("data_inicio", e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Vigência (meses)</Label>
                <Input type="number" value={valores.vigencia_meses} onChange={e => updateValores("vigencia_meses", e.target.value)} className="h-8 text-xs" placeholder="12" min="1" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-[10px]">Descrição do Serviço</Label>
                <Textarea
                  value={valores.descricao_servico}
                  onChange={e => updateValores("descricao_servico", e.target.value)}
                  className="text-xs resize-none"
                  rows={3}
                  placeholder="Desenvolvimento e implantação de agente de IA para atendimento ao cliente..."
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Button
          onClick={handlePreencher}
          disabled={filling || modeloSelecionado === "none"}
          className="w-full gradient-primary text-primary-foreground gap-2 h-10"
        >
          {filling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {filling ? "Preenchendo contrato..." : "Preencher Contrato com IA"}
        </Button>
      </div>

      {/* Coluna direita: preview */}
      <div className="space-y-3">
        <Card className="h-full min-h-[400px]">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Contrato Preenchido</CardTitle>
              {conteudoGerado && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleCopy}>
                    {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copiado!" : "Copiar"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleDownloadDocx}>
                    <Download className="h-3 w-3" />
                    .docx
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs gradient-primary text-primary-foreground gap-1"
                    onClick={handleSalvar}
                    disabled={saving}
                  >
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Salvar
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!conteudoGerado ? (
              <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground text-sm">
                <Sparkles className="h-10 w-10 mb-3 opacity-30" />
                <p>O contrato preenchido aparecerá aqui</p>
                <p className="text-xs mt-1 text-center max-w-xs">Selecione um modelo, preencha os dados e clique em "Preencher Contrato com IA"</p>
              </div>
            ) : (
              <ScrollArea className="h-[600px]">
                <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed text-foreground">
                  {conteudoGerado}
                </pre>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
