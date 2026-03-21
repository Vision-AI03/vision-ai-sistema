import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Trash2, StickyNote } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Nota {
  id: string;
  conteudo: string;
  created_at: string;
}

interface NotasTabProps {
  leadId: string;
}

export function NotasTab({ leadId }: NotasTabProps) {
  const [notas, setNotas] = useState<Nota[]>([]);
  const [novaNota, setNovaNota] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchNotas();
  }, [leadId]);

  async function fetchNotas() {
    setLoading(true);
    const { data } = await supabase
      .from("lead_notas")
      .select("id, conteudo, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });
    setNotas((data as Nota[]) || []);
    setLoading(false);
  }

  async function salvarNota() {
    if (!novaNota.trim()) return;
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("lead_notas").insert({
      lead_id: leadId,
      user_id: user.id,
      conteudo: novaNota.trim(),
    });

    if (error) {
      toast({ title: "Erro ao salvar nota", variant: "destructive" });
    } else {
      setNovaNota("");
      fetchNotas();
    }
    setSaving(false);
  }

  async function excluirNota(id: string) {
    const { error } = await supabase.from("lead_notas").delete().eq("id", id);
    if (!error) {
      setNotas(prev => prev.filter(n => n.id !== id));
    }
  }

  return (
    <div className="space-y-3">
      {/* Input nova nota */}
      <div className="space-y-2">
        <Textarea
          value={novaNota}
          onChange={(e) => setNovaNota(e.target.value)}
          placeholder="Adicione uma anotação interna..."
          className="text-xs bg-secondary/30 min-h-[80px] resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              salvarNota();
            }
          }}
        />
        <Button
          size="sm"
          onClick={salvarNota}
          disabled={saving || !novaNota.trim()}
          className="gradient-primary text-primary-foreground text-xs h-7 gap-1.5"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <StickyNote className="h-3 w-3" />}
          {saving ? "Salvando..." : "Adicionar Nota"}
        </Button>
      </div>

      {/* Lista de notas */}
      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : notas.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">
          Nenhuma anotação ainda. Use Ctrl+Enter para salvar rapidamente.
        </p>
      ) : (
        <div className="space-y-2">
          {notas.map((nota) => (
            <div key={nota.id} className="bg-secondary/30 rounded-lg p-2.5 space-y-1 group">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  {format(new Date(nota.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
                <button
                  onClick={() => excluirNota(nota.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <p className="text-xs whitespace-pre-wrap">{nota.conteudo}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
