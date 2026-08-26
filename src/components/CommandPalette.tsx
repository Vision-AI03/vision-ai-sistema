import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
// eslint-disable-next-line no-unused-vars
type OnOpenChange = (open: boolean) => void;
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import {
  Sun, LayoutDashboard, Users, Target, MessageSquare, ScrollText, FileText,
  DollarSign, CheckSquare, CalendarDays, BrainCircuit, BarChart2, Zap, KeyRound,
  Webhook, DatabaseBackup, Activity, Bell, User,
} from "lucide-react";

const NAV: { label: string; to: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { label: "Hoje", to: "/", icon: Sun },
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "CRM", to: "/crm", icon: Users },
  { label: "Prospecção", to: "/prospeccao", icon: Target },
  { label: "Comunicações", to: "/comunicacoes", icon: MessageSquare },
  { label: "Propostas", to: "/propostas", icon: ScrollText },
  { label: "Contratos", to: "/contratos", icon: FileText },
  { label: "Financeiro", to: "/financeiro", icon: DollarSign },
  { label: "Tarefas", to: "/tarefas", icon: CheckSquare },
  { label: "Reuniões", to: "/reunioes", icon: CalendarDays },
  { label: "Métricas", to: "/metricas", icon: BrainCircuit },
  { label: "Relatórios", to: "/relatorios", icon: BarChart2 },
  { label: "Notificações", to: "/notificacoes", icon: Bell },
  { label: "Automações", to: "/configuracoes/automacoes", icon: Zap },
  { label: "Credenciais", to: "/configuracoes/credenciais", icon: KeyRound },
  { label: "Integrações", to: "/configuracoes/integracoes", icon: Webhook },
  { label: "Saúde do Sistema", to: "/configuracoes/saude", icon: Activity },
  { label: "Backup", to: "/configuracoes/backup", icon: DatabaseBackup },
];

type Hit = { id: string; label: string; sub?: string | null; to: string; icon: React.ComponentType<{ className?: string }> };

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: OnOpenChange }) {
  const [query, setQuery] = useState("");
  const [leads, setLeads] = useState<Hit[]>([]);
  const [contratos, setContratos] = useState<Hit[]>([]);
  const [tarefas, setTarefas] = useState<Hit[]>([]);
  const navigate = useNavigate();

  // busca dinâmica (debounce leve). Import dinâmico do client evita ciclo.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setLeads([]); setContratos([]); setTarefas([]);
      return;
    }
    const t = setTimeout(async () => {
      const like = `%${q}%`;
      const [l, c, tf] = await Promise.all([
        supabase.from("leads").select("id, nome, empresa").or(`nome.ilike.${like},empresa.ilike.${like}`).limit(6),
        supabase.from("contratos").select("id, cliente_nome").ilike("cliente_nome", like).limit(5),
        supabase.from("tarefas").select("id, titulo").ilike("titulo", like).limit(5),
      ]);
      setLeads((l.data ?? []).map((x: { id: string; nome: string; empresa: string | null }) =>
        ({ id: x.id, label: x.nome, sub: x.empresa, to: "/crm", icon: User })));
      setContratos((c.data ?? []).map((x: { id: string; cliente_nome: string }) =>
        ({ id: x.id, label: x.cliente_nome, to: "/contratos", icon: FileText })));
      setTarefas((tf.data ?? []).map((x: { id: string; titulo: string }) =>
        ({ id: x.id, label: x.titulo, to: "/tarefas", icon: CheckSquare })));
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  const go = useCallback((to: string) => {
    onOpenChange(false);
    setQuery("");
    navigate(to);
  }, [navigate, onOpenChange]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Buscar módulos, leads, contratos, tarefas…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>Nada encontrado.</CommandEmpty>

        <CommandGroup heading="Navegação">
          {NAV.map((n) => (
            <CommandItem key={n.to} value={n.label} onSelect={() => go(n.to)}>
              <n.icon className="mr-2 h-4 w-4" />
              {n.label}
            </CommandItem>
          ))}
        </CommandGroup>

        {leads.length > 0 && (
          <CommandGroup heading="Leads">
            {leads.map((h) => (
              <CommandItem key={h.id} value={`${h.label} ${h.sub ?? ""} ${h.id}`} onSelect={() => go(h.to)}>
                <User className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">{h.label}</span>
                {h.sub && <span className="ml-2 text-xs text-muted-foreground truncate">· {h.sub}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {contratos.length > 0 && (
          <CommandGroup heading="Contratos">
            {contratos.map((h) => (
              <CommandItem key={h.id} value={`${h.label} ${h.id}`} onSelect={() => go(h.to)}>
                <FileText className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">{h.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {tarefas.length > 0 && (
          <CommandGroup heading="Tarefas">
            {tarefas.map((h) => (
              <CommandItem key={h.id} value={`${h.label} ${h.id}`} onSelect={() => go(h.to)}>
                <CheckSquare className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">{h.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
