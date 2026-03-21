import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Upload, FileText, Trash2, Edit2, Loader2, Eye, EyeOff, File } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Modelo {
  id: string;
  nome: string;
  tipo: string;
  conteudo_texto: string | null;
  created_at: string;
}

interface ModelosTabProps {
  modelos: Modelo[];
  onRefresh: () => void;
}

async function extractDocxText(file: File): Promise<string> {
  // mammoth is loaded as a global via the npm package
  const mammoth = await import("mammoth");
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

async function extractTextFromFile(file: File): Promise<string> {
  if (file.name.endsWith(".docx")) {
    return extractDocxText(file);
  }
  // For PDF, read as text best-effort
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) || "");
    reader.readAsText(file);
  });
}

function ModelCard({ modelo, onDelete, onEdit }: { modelo: Modelo; onDelete: (id: string) => void; onEdit: (m: Modelo) => void }) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <Card className="glass-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <File className="h-4 w-4 text-primary flex-shrink-0" />
            <p className="font-medium truncate">{modelo.nome}</p>
            <Badge variant="outline" className="text-[10px] uppercase flex-shrink-0">{modelo.tipo}</Badge>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setShowPreview(!showPreview)}>
              {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onEdit(modelo)}>
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir modelo?</AlertDialogTitle>
                  <AlertDialogDescription>
                    O modelo "{modelo.nome}" será excluído permanentemente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(modelo.id)} className="bg-destructive text-destructive-foreground">
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Adicionado em {format(new Date(modelo.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
        </p>

        {showPreview && modelo.conteudo_texto && (
          <div className="mt-2 border border-border rounded-md p-3 max-h-48 overflow-y-auto">
            <p className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
              {modelo.conteudo_texto.slice(0, 2000)}
              {modelo.conteudo_texto.length > 2000 && (
                <span className="text-primary"> ... [mais {modelo.conteudo_texto.length - 2000} caracteres]</span>
              )}
            </p>
          </div>
        )}

        {showPreview && !modelo.conteudo_texto && (
          <p className="text-xs text-muted-foreground italic">Sem prévia disponível.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function ModelosTab({ modelos, onRefresh }: ModelosTabProps) {
  const [uploading, setUploading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editModelo, setEditModelo] = useState<Modelo | null>(null);
  const [editNome, setEditNome] = useState("");
  const { toast } = useToast();

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const isDocx = file.name.endsWith(".docx");
    const isPdf = file.name.endsWith(".pdf");
    if (!isDocx && !isPdf) {
      toast({ title: "Formato inválido", description: "Envie um arquivo .docx ou .pdf", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let texto = "";
      if (isDocx) {
        texto = await extractDocxText(file);
      } else {
        // PDF: armazenar sem extração de texto (IA receberá aviso)
        texto = `[PDF enviado: ${file.name}]\n\nO conteúdo do PDF não pode ser extraído automaticamente no navegador. Cole o texto do contrato manualmente usando o botão "Editar" para adicionar o conteúdo de texto ao modelo.`;
      }

      const nomeSemExtensao = file.name.replace(/\.(docx|pdf)$/i, "");

      const { error } = await supabase.from("modelo_contratos").insert({
        user_id: user.id,
        nome: nomeSemExtensao,
        tipo: isDocx ? "docx" : "pdf",
        conteudo_texto: texto || null,
      } as any);

      if (error) {
        toast({ title: "Erro ao salvar modelo", variant: "destructive" });
      } else {
        toast({ title: `Modelo "${nomeSemExtensao}" adicionado!` });
        onRefresh();
      }
    } catch (err) {
      toast({ title: "Erro ao processar arquivo", description: String(err), variant: "destructive" });
    }
    setUploading(false);
    e.target.value = "";
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("modelo_contratos").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    } else {
      toast({ title: "Modelo excluído" });
      onRefresh();
    }
  }

  function openEdit(m: Modelo) {
    setEditModelo(m);
    setEditNome(m.nome);
    setEditOpen(true);
  }

  async function handleSaveEdit() {
    if (!editModelo || !editNome.trim()) return;
    const { error } = await supabase
      .from("modelo_contratos")
      .update({ nome: editNome.trim() } as any)
      .eq("id", editModelo.id);
    if (error) {
      toast({ title: "Erro ao atualizar", variant: "destructive" });
    } else {
      toast({ title: "Modelo atualizado!" });
      setEditOpen(false);
      onRefresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {modelos.length} modelo{modelos.length !== 1 ? "s" : ""} cadastrado{modelos.length !== 1 ? "s" : ""}
        </p>
        <label className="cursor-pointer">
          <Button
            asChild
            className="gradient-primary text-primary-foreground gap-2 cursor-pointer"
            disabled={uploading}
          >
            <span>
              {uploading
                ? <><Loader2 className="h-4 w-4 animate-spin" />Processando...</>
                : <><Upload className="h-4 w-4" />Upload de Modelo</>
              }
            </span>
          </Button>
          <input
            type="file"
            accept=".docx,.pdf"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      </div>

      <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
        <FileText className="h-5 w-5 mx-auto mb-1 opacity-50" />
        Suporte a <strong>.docx</strong> (extração automática de texto) e <strong>.pdf</strong>.
        Use placeholders no modelo como <code className="bg-secondary px-1 rounded">{"{{NOME_CLIENTE}}"}</code>, <code className="bg-secondary px-1 rounded">{"{{VALOR_SETUP}}"}</code>, <code className="bg-secondary px-1 rounded">{"{{CNPJ_PRESTADOR}}"}</code> etc. A IA preencherá automaticamente.
      </div>

      {modelos.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum modelo cadastrado.</p>
            <p className="text-xs mt-1">Faça upload de um contrato .docx ou .pdf para começar.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {modelos.map(m => (
            <ModelCard key={m.id} modelo={m} onDelete={handleDelete} onEdit={openEdit} />
          ))}
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar Modelo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome do Modelo</Label>
              <Input value={editNome} onChange={e => setEditNome(e.target.value)} />
            </div>
            {editModelo && (
              <div className="space-y-1.5">
                <Label className="text-xs">Conteúdo de Texto</Label>
                <textarea
                  className="w-full min-h-[200px] rounded border border-border bg-secondary/30 p-2 text-xs font-mono resize-y focus:outline-none focus:ring-1 focus:ring-primary"
                  defaultValue={editModelo.conteudo_texto || ""}
                  onChange={e => {
                    if (editModelo) setEditModelo({ ...editModelo, conteudo_texto: e.target.value });
                  }}
                  placeholder="Cole ou edite o texto do contrato aqui..."
                />
                <p className="text-[10px] text-muted-foreground">Edite o texto do modelo. Use placeholders como {"{{NOME_CLIENTE}}"} para que a IA substitua automaticamente.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button
              className="gradient-primary text-primary-foreground"
              onClick={async () => {
                if (!editModelo || !editNome.trim()) return;
                const { error } = await supabase.from("modelo_contratos").update({
                  nome: editNome.trim(),
                  conteudo_texto: editModelo.conteudo_texto,
                } as any).eq("id", editModelo.id);
                if (error) {
                  toast({ title: "Erro ao atualizar", variant: "destructive" });
                } else {
                  toast({ title: "Modelo atualizado!" });
                  setEditOpen(false);
                  onRefresh();
                }
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
