import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock } from "lucide-react";

type EnviadoRow = {
  id: string;
  email: string;
  assunto: string | null;
  enviado_em: string;
  status_envio: string;
  variacao_copy: number | null;
  listas_email: { nome: string } | null;
};

export function HistoricoTab() {
  const [rows, setRows] = useState<EnviadoRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("lista_membros")
        .select("id, email, assunto, enviado_em, status_envio, variacao_copy, listas_email(nome)")
        .not("enviado_em", "is", null)
        .order("enviado_em", { ascending: false })
        .limit(100);
      setRows((data ?? []) as any);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-border rounded-xl py-16 text-center">
        <Clock className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Nenhum email enviado ainda.</p>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden divide-y divide-border">
      {rows.map((r) => (
        <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{r.assunto || "(sem assunto)"}</p>
            <p className="text-xs text-muted-foreground truncate">
              {r.email} · {r.listas_email?.nome || "—"}
              {r.variacao_copy && ` · v${r.variacao_copy}`}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">{new Date(r.enviado_em).toLocaleString("pt-BR")}</p>
            <Badge variant="outline" className="text-xs mt-1">{r.status_envio}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
