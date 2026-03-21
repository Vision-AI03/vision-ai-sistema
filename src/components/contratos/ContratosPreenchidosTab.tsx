import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Files, Eye, Download, Trash2, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ContratoPreenchido {
  id: string;
  nome_cliente: string | null;
  conteudo_preenchido: string | null;
  created_at: string;
  modelo_id: string | null;
  modelo_contratos?: { nome: string } | null;
}

interface ContratosPreenchidosTabProps {
  contratos: ContratoPreenchido[];
  onRefresh: () => void;
}

async function gerarDocx(texto: string): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  const paragrafos = texto.split("\n").map((linha) => {
    const escapada = linha
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<w:p><w:r><w:t xml:space="preserve">${escapada}</w:t></w:r></w:p>`;
  });

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${paragrafos.join("\n    ")}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
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

  zip.file("_rels/.rels", relsXml);
  zip.file("word/document.xml", docXml);
  zip.file("word/_rels/document.xml.rels", wordRelsXml);
  zip.file("[Content_Types].xml", contentTypesXml);

  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ContratosPreenchidosTab({ contratos, onRefresh }: ContratosPreenchidosTabProps) {
  const [viewContrato, setViewContrato] = useState<ContratoPreenchido | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const { toast } = useToast();

  async function handleDownload(c: ContratoPreenchido) {
    if (!c.conteudo_preenchido) {
      toast({ title: "Sem conteúdo para baixar", variant: "destructive" });
      return;
    }
    setDownloading(c.id);
    try {
      const blob = await gerarDocx(c.conteudo_preenchido);
      const nome = c.nome_cliente ? `contrato_${c.nome_cliente.replace(/\s+/g, "_")}` : `contrato_${c.id.slice(0, 8)}`;
      downloadBlob(blob, `${nome}.docx`);
    } catch (e) {
      toast({ title: "Erro ao gerar .docx", description: String(e), variant: "destructive" });
    }
    setDownloading(null);
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("contratos_preenchidos").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    } else {
      toast({ title: "Contrato excluído" });
      onRefresh();
    }
  }

  if (contratos.length === 0) {
    return (
      <Card className="glass-card">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Files className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">Nenhum contrato preenchido ainda.</p>
          <p className="text-xs text-muted-foreground mt-1">Use a aba "Preencher com IA" para gerar contratos.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {contratos.length} contrato{contratos.length !== 1 ? "s" : ""} preenchido{contratos.length !== 1 ? "s" : ""}
      </p>

      {contratos.map((c) => (
        <Card key={c.id} className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{c.nome_cliente || "Cliente não informado"}</p>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {c.modelo_contratos?.nome && (
                    <Badge variant="outline" className="text-[10px]">
                      {c.modelo_contratos.nome}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(c.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                </div>
              </div>

              <div className="flex gap-1 flex-shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => setViewContrato(c)}
                  title="Visualizar"
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => handleDownload(c)}
                  disabled={downloading === c.id}
                  title="Baixar .docx"
                >
                  {downloading === c.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Download className="h-3.5 w-3.5" />
                  }
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir contrato?</AlertDialogTitle>
                      <AlertDialogDescription>
                        O contrato de "{c.nome_cliente}" será excluído permanentemente.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(c.id)}
                        className="bg-destructive text-destructive-foreground"
                      >
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={!!viewContrato} onOpenChange={(o) => !o && setViewContrato(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Contrato — {viewContrato?.nome_cliente || "Sem nome"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto border border-border rounded-md p-4 bg-secondary/20">
            <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed">
              {viewContrato?.conteudo_preenchido || "Sem conteúdo disponível."}
            </pre>
          </div>
          <div className="flex justify-end pt-2">
            <Button
              className="gradient-primary text-primary-foreground gap-2"
              onClick={() => viewContrato && handleDownload(viewContrato)}
              disabled={downloading === viewContrato?.id}
            >
              {downloading === viewContrato?.id
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Download className="h-4 w-4" />
              }
              Baixar .docx
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
