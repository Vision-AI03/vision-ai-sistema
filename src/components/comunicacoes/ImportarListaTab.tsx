import { useState, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import mammoth from "mammoth";

// Importação manual de lista a partir de arquivo. Os contatos NÃO viram leads do
// CRM — entram direto como membros da lista (lista_membros.lead_id = null), com
// nome/empresa preenchidos a partir do arquivo para o copy sair personalizado.
// Listas vindas da Prospecção continuam apontando para leads normalmente.

const NICHOS = [
  { value: "clinicas", label: "Clínicas" },
  { value: "imobiliarias", label: "Imobiliárias" },
  { value: "contabilidade", label: "Contabilidade" },
  { value: "transportadoras", label: "Transportadoras" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "restaurantes", label: "Restaurantes" },
  { value: "outro", label: "Outro" },
];

interface Props {
  onImported?: () => void;
}

interface ParsedContact {
  nome?: string;
  email: string;
  empresa?: string;
  cargo?: string;
  telefone?: string;
  [key: string]: any;
}

export function ImportarListaTab({ onImported }: Props) {
  const { toast } = useToast();

  const [nome, setNome] = useState("");
  const [nicho, setNicho] = useState("");
  const [nichoCustom, setNichoCustom] = useState("");
  const [cidade, setCidade] = useState("");
  const [parsedContacts, setParsedContacts] = useState<ParsedContact[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({
    nome: "", email: "", empresa: "", cargo: "", telefone: "",
  });

  function resetForm() {
    setNome("");
    setNicho("");
    setNichoCustom("");
    setCidade("");
    setParsedContacts([]);
    setFileName("");
    setAvailableColumns([]);
    setColumnMap({ nome: "", email: "", empresa: "", cargo: "", telefone: "" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParsing(true);

    const ext = file.name.split(".").pop()?.toLowerCase();

    try {
      if (ext === "docx" || ext === "doc") {
        const buffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buffer });
        const text = result.value;

        const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
        const emails = [...new Set(text.match(emailRegex) || [])];

        if (emails.length === 0) {
          toast({ title: "Nenhum email encontrado no documento", variant: "destructive" });
          setParsing(false);
          return;
        }

        // Tenta extrair o nome da linha que contém o email
        const lines = text.split(/\r?\n/);
        const contacts: ParsedContact[] = emails.map(email => {
          const line = lines.find(l => l.includes(email)) || "";
          const namePart = line.replace(email, "").replace(/[|;,\t]+/g, " ").trim();
          return { email, nome: namePart || "" };
        });

        setParsedContacts(contacts);
        toast({ title: `${contacts.length} emails encontrados no documento Word` });
      } else if (ext === "csv" || ext === "xlsx" || ext === "xls") {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

        if (jsonData.length === 0) {
          toast({ title: "Arquivo vazio", variant: "destructive" });
          setParsing(false);
          return;
        }

        const cols = Object.keys(jsonData[0]);
        setAvailableColumns(cols);

        const autoMap: Record<string, string> = { nome: "", email: "", empresa: "", cargo: "", telefone: "" };
        for (const col of cols) {
          const lower = col.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (lower.includes("nome") || lower.includes("name")) autoMap.nome = col;
          else if (lower.includes("email") || lower.includes("e-mail")) autoMap.email = col;
          else if (lower.includes("empresa") || lower.includes("company")) autoMap.empresa = col;
          else if (lower.includes("cargo") || lower.includes("position") || lower.includes("title")) autoMap.cargo = col;
          else if (lower.includes("telefone") || lower.includes("phone") || lower.includes("tel")) autoMap.telefone = col;
        }
        setColumnMap(autoMap);

        const contacts: ParsedContact[] = jsonData.map(row => ({
          nome: autoMap.nome ? String(row[autoMap.nome] || "") : "",
          email: autoMap.email ? String(row[autoMap.email] || "") : "",
          empresa: autoMap.empresa ? String(row[autoMap.empresa] || "") : "",
          cargo: autoMap.cargo ? String(row[autoMap.cargo] || "") : "",
          telefone: autoMap.telefone ? String(row[autoMap.telefone] || "") : "",
        })).filter(c => c.email && c.email.includes("@"));

        setParsedContacts(contacts);
        toast({ title: `${contacts.length} contatos encontrados` });
      } else if (ext === "pdf") {
        const text = await file.text();
        const { data, error } = await supabase.functions.invoke("parse-pdf-contacts", {
          body: { pdf_text: text },
        });

        if (error) throw error;
        const contacts = (data?.contatos || []).filter((c: any) => c.email?.includes("@"));
        setParsedContacts(contacts);
        toast({ title: `${contacts.length} contatos extraídos do PDF` });
      } else {
        toast({ title: "Formato não suportado. Use .csv, .xlsx, .xls, .docx, .doc ou .pdf", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erro ao processar arquivo", description: err.message, variant: "destructive" });
    } finally {
      setParsing(false);
    }
  }

  async function handleSaveList() {
    if (!nome || !nicho || !cidade || parsedContacts.length === 0) {
      toast({ title: "Preencha nome, nicho e cidade, e importe um arquivo", variant: "destructive" });
      return;
    }

    setSaving(true);
    const finalNicho = nicho === "outro" ? nichoCustom || "outro" : nicho;

    try {
      // Dedupe por email dentro do próprio arquivo — o índice parcial no banco
      // rejeitaria o lote inteiro se houvesse repetido.
      const vistos = new Set<string>();
      const contatos = parsedContacts.filter(c => {
        const email = c.email.trim().toLowerCase();
        if (!email || vistos.has(email)) return false;
        vistos.add(email);
        return true;
      });

      // listas_email tem UNIQUE (nicho, cidade, lote): o lote é sequencial por
      // combinação, então descobrimos o próximo antes de inserir.
      const { data: ultimo } = await supabase
        .from("listas_email")
        .select("lote")
        .eq("nicho", finalNicho)
        .eq("cidade", cidade)
        .order("lote", { ascending: false })
        .limit(1)
        .maybeSingle();

      const proximoLote = ((ultimo as { lote: number } | null)?.lote ?? 0) + 1;

      const { data: lista, error: listErr } = await supabase
        .from("listas_email")
        .insert({
          nicho: finalNicho,
          cidade,
          lote: proximoLote,
          nome,
          status: "aberta",
        })
        .select("id")
        .single();

      if (listErr) throw listErr;

      const batchSize = 100;
      for (let i = 0; i < contatos.length; i += batchSize) {
        const batch = contatos.slice(i, i + batchSize).map(c => ({
          lista_id: lista.id,
          lead_id: null,
          email: c.email.trim().toLowerCase(),
          nome: c.nome || null,
          empresa: c.empresa || null,
        }));

        const { error: batchErr } = await supabase.from("lista_membros").insert(batch);
        if (batchErr) throw batchErr;
      }

      const ignorados = parsedContacts.length - contatos.length;
      toast({
        title: "Lista importada",
        description: ignorados > 0
          ? `${contatos.length} contatos salvos (${ignorados} duplicados ignorados). Gere o copy na aba Listas por Nicho.`
          : `${contatos.length} contatos salvos. Gere o copy na aba Listas por Nicho.`,
      });
      resetForm();
      onImported?.();
    } catch (err: any) {
      toast({ title: "Erro ao salvar lista", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Arquivo (.csv, .xlsx, .xls, .docx, .doc, .pdf)</Label>
        <div
          className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.docx,.doc,.pdf"
            className="hidden"
            onChange={handleFileUpload}
          />
          {parsing ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Processando arquivo...</span>
            </div>
          ) : fileName ? (
            <div className="flex items-center justify-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <span className="text-sm">{fileName}</span>
              <Badge className="bg-primary/20 text-primary text-[10px]">{parsedContacts.length} contatos</Badge>
            </div>
          ) : (
            <div>
              <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Clique para selecionar ou arraste um arquivo</p>
              <p className="text-xs text-muted-foreground mt-1">CSV, XLSX, XLS, DOCX, DOC ou PDF</p>
            </div>
          )}
        </div>
      </div>

      {/* Mapeamento de colunas (só planilhas) */}
      {availableColumns.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Mapeamento de Colunas (auto-detectado)</Label>
          <div className="grid grid-cols-2 gap-2">
            {(["email", "nome", "empresa", "cargo", "telefone"] as const).map(field => (
              <div key={field} className="flex items-center gap-2">
                <span className="text-xs w-16 text-muted-foreground capitalize">{field}:</span>
                <Select
                  value={columnMap[field] || "none"}
                  onValueChange={(v) => setColumnMap(prev => ({ ...prev, [field]: v === "none" ? "" : v }))}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Não mapear —</SelectItem>
                    {availableColumns.map(col => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Só nome e empresa são gravados — são o que personaliza o email. Cargo e telefone servem para você conferir o arquivo.
          </p>
        </div>
      )}

      {/* Preview */}
      {parsedContacts.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Preview (primeiros 5 contatos)</Label>
          <div className="rounded border border-border overflow-auto max-h-48">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Nome</TableHead>
                  <TableHead className="text-xs">Email</TableHead>
                  <TableHead className="text-xs">Empresa</TableHead>
                  <TableHead className="text-xs">Cargo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedContacts.slice(0, 5).map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs">{c.nome || "—"}</TableCell>
                    <TableCell className="text-xs">{c.email}</TableCell>
                    <TableCell className="text-xs">{c.empresa || "—"}</TableCell>
                    <TableCell className="text-xs">{c.cargo || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Nome da Lista</Label>
        <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Clínicas SP - Março 2026" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Nicho</Label>
          <Select value={nicho || "none"} onValueChange={(v) => setNicho(v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Selecione...</SelectItem>
              {NICHOS.map(n => (
                <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {nicho === "outro" && (
            <Input value={nichoCustom} onChange={e => setNichoCustom(e.target.value)} placeholder="Nome do nicho" className="mt-1" />
          )}
        </div>
        <div className="space-y-2">
          <Label>Cidade</Label>
          <Input value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Ex: Ribeirão Preto" />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button onClick={handleSaveList} disabled={saving || parsedContacts.length === 0} className="gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {saving ? "Salvando..." : `Importar ${parsedContacts.length} contatos`}
        </Button>
      </div>
    </div>
  );
}
