import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Separator } from "@/components/ui/separator";
import {
  CalendarDays, Plus, Loader2, Clock, MapPin, Link2, User,
  CheckCircle2, XCircle, Edit2, Trash2,
} from "lucide-react";
import { format, isSameDay, parseISO, isAfter, isBefore, addHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Reuniao {
  id: string;
  titulo: string;
  descricao: string | null;
  data_hora_inicio: string;
  data_hora_fim: string | null;
  link_videoconferencia: string | null;
  local: string | null;
  status: string;
  lead_id: string | null;
}

interface Lead {
  id: string;
  nome: string;
  empresa: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  agendada: { label: "Agendada", color: "bg-primary/20 text-primary" },
  realizada: { label: "Realizada", color: "bg-success/20 text-success" },
  cancelada: { label: "Cancelada", color: "bg-destructive/20 text-destructive" },
};

const DEFAULT_FORM = {
  titulo: "",
  descricao: "",
  data: "",
  hora_inicio: "09:00",
  hora_fim: "10:00",
  link_videoconferencia: "",
  local: "",
  lead_id: "none",
  status: "agendada",
};

export default function Reunioes() {
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const { toast } = useToast();

  useEffect(() => {
    fetchReunioes();
    fetchLeads();
  }, []);

  async function fetchReunioes() {
    setLoading(true);
    const { data } = await supabase
      .from("reunioes")
      .select("*")
      .order("data_hora_inicio", { ascending: true });
    setReunioes((data || []) as Reuniao[]);
    setLoading(false);
  }

  async function fetchLeads() {
    const { data } = await supabase.from("leads").select("id, nome, empresa").order("nome");
    setLeads((data || []) as Lead[]);
  }

  const reunioesNoDia = reunioes.filter(r =>
    isSameDay(parseISO(r.data_hora_inicio), selectedDate)
  );

  // Dias com reunião para marcar no calendário
  const diasComReuniao = reunioes
    .filter(r => r.status === "agendada")
    .map(r => parseISO(r.data_hora_inicio));

  function openNew() {
    setForm({
      ...DEFAULT_FORM,
      data: format(selectedDate, "yyyy-MM-dd"),
    });
    setEditingId(null);
    setDialogOpen(true);
  }

  function openEdit(r: Reuniao) {
    const dt = parseISO(r.data_hora_inicio);
    setForm({
      titulo: r.titulo,
      descricao: r.descricao || "",
      data: format(dt, "yyyy-MM-dd"),
      hora_inicio: format(dt, "HH:mm"),
      hora_fim: r.data_hora_fim ? format(parseISO(r.data_hora_fim), "HH:mm") : "10:00",
      link_videoconferencia: r.link_videoconferencia || "",
      local: r.local || "",
      lead_id: r.lead_id || "none",
      status: r.status,
    });
    setEditingId(r.id);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.titulo.trim() || !form.data) {
      toast({ title: "Preencha o título e a data", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const dataInicio = `${form.data}T${form.hora_inicio}:00`;
    const dataFim = `${form.data}T${form.hora_fim}:00`;

    const payload = {
      user_id: user.id,
      titulo: form.titulo.trim(),
      descricao: form.descricao || null,
      data_hora_inicio: dataInicio,
      data_hora_fim: dataFim,
      link_videoconferencia: form.link_videoconferencia || null,
      local: form.local || null,
      lead_id: form.lead_id !== "none" ? form.lead_id : null,
      status: form.status,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from("reunioes").update(payload as any).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("reunioes").insert(payload as any));
    }

    if (error) {
      toast({ title: "Erro ao salvar reunião", variant: "destructive" });
    } else {
      toast({ title: editingId ? "Reunião atualizada!" : "Reunião agendada!" });
      setDialogOpen(false);
      fetchReunioes();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("reunioes").delete().eq("id", id);
    if (!error) {
      setReunioes(prev => prev.filter(r => r.id !== id));
      toast({ title: "Reunião excluída" });
    }
  }

  async function handleStatus(id: string, status: string) {
    await supabase.from("reunioes").update({ status } as any).eq("id", id);
    setReunioes(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  }

  function updateForm(key: string, val: string) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  const hoje = reunioes.filter(r => {
    const dt = parseISO(r.data_hora_inicio);
    return isSameDay(dt, new Date()) && r.status === "agendada";
  });

  const proximas = reunioes.filter(r => {
    const dt = parseISO(r.data_hora_inicio);
    return isAfter(dt, addHours(new Date(), 1)) && r.status === "agendada";
  }).slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Calendário de Reuniões</h1>
        <Button onClick={openNew} className="gradient-primary text-primary-foreground gap-2">
          <Plus className="h-4 w-4" /> Nova Reunião
        </Button>
      </div>

      {/* Hoje */}
      {hoje.length > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="py-3 px-4">
            <p className="text-xs font-semibold text-primary mb-2 uppercase tracking-wider">
              Hoje — {hoje.length} reunião{hoje.length > 1 ? "ões" : ""}
            </p>
            <div className="space-y-1.5">
              {hoje.map(r => (
                <div key={r.id} className="flex items-center gap-2 text-sm">
                  <Clock className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  <span className="font-medium">{format(parseISO(r.data_hora_inicio), "HH:mm")}</span>
                  <span>{r.titulo}</span>
                  {r.link_videoconferencia && (
                    <a href={r.link_videoconferencia} target="_blank" rel="noopener noreferrer"
                      className="ml-auto text-primary hover:underline text-xs flex items-center gap-1">
                      <Link2 className="h-3 w-3" /> Entrar
                    </a>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
        {/* Calendário */}
        <div className="space-y-3">
          <Card>
            <CardContent className="p-3">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                locale={ptBR}
                className="rounded-md"
                modifiers={{ reuniao: diasComReuniao }}
                modifiersClassNames={{ reuniao: "bg-primary/20 text-primary font-semibold rounded-full" }}
              />
            </CardContent>
          </Card>

          {/* Próximas reuniões */}
          {proximas.length > 0 && (
            <Card>
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Próximas</p>
                {proximas.map(r => (
                  <div key={r.id} className="flex items-center gap-2 text-xs">
                    <CalendarDays className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{r.titulo}</p>
                      <p className="text-muted-foreground">{format(parseISO(r.data_hora_inicio), "dd/MM 'às' HH:mm", { locale: ptBR })}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Reuniões do dia */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </h2>
            <Button size="sm" variant="outline" onClick={openNew} className="h-7 text-xs gap-1">
              <Plus className="h-3 w-3" /> Agendar
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : reunioesNoDia.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhuma reunião neste dia</p>
              <Button size="sm" variant="outline" className="mt-3 text-xs" onClick={openNew}>
                Agendar reunião
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {reunioesNoDia
                .sort((a, b) => a.data_hora_inicio.localeCompare(b.data_hora_inicio))
                .map(r => {
                  const lead = leads.find(l => l.id === r.lead_id);
                  const statusCfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.agendada;
                  return (
                    <Card key={r.id} className="hover:border-border/80 transition-colors">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="text-sm font-semibold">
                                {format(parseISO(r.data_hora_inicio), "HH:mm")}
                                {r.data_hora_fim && ` – ${format(parseISO(r.data_hora_fim), "HH:mm")}`}
                              </span>
                              <Badge className={`text-[10px] ${statusCfg.color}`}>{statusCfg.label}</Badge>
                            </div>
                            <p className="font-medium">{r.titulo}</p>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(r)}>
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(r.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-1 text-xs text-muted-foreground">
                          {lead && (
                            <div className="flex items-center gap-1.5">
                              <User className="h-3 w-3" />
                              <span>{lead.nome}{lead.empresa ? ` — ${lead.empresa}` : ""}</span>
                            </div>
                          )}
                          {r.local && (
                            <div className="flex items-center gap-1.5">
                              <MapPin className="h-3 w-3" />
                              <span>{r.local}</span>
                            </div>
                          )}
                          {r.link_videoconferencia && (
                            <div className="flex items-center gap-1.5">
                              <Link2 className="h-3 w-3" />
                              <a href={r.link_videoconferencia} target="_blank" rel="noopener noreferrer"
                                className="text-primary hover:underline truncate">
                                {r.link_videoconferencia}
                              </a>
                            </div>
                          )}
                          {r.descricao && <p className="mt-1 italic">{r.descricao}</p>}
                        </div>

                        {r.status === "agendada" && (
                          <div className="flex gap-2 pt-1">
                            <Button size="sm" variant="outline" className="h-6 text-xs gap-1 text-success border-success/30 hover:bg-success/10"
                              onClick={() => handleStatus(r.id, "realizada")}>
                              <CheckCircle2 className="h-3 w-3" /> Realizada
                            </Button>
                            <Button size="sm" variant="outline" className="h-6 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                              onClick={() => handleStatus(r.id, "cancelada")}>
                              <XCircle className="h-3 w-3" /> Cancelar
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Dialog nova/editar reunião */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Reunião" : "Nova Reunião"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Título <span className="text-destructive">*</span></Label>
              <Input value={form.titulo} onChange={e => updateForm("titulo", e.target.value)} placeholder="Ex: Reunião de Discovery — Empresa XYZ" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Data <span className="text-destructive">*</span></Label>
                <Input type="date" value={form.data} onChange={e => updateForm("data", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={v => updateForm("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agendada">Agendada</SelectItem>
                    <SelectItem value="realizada">Realizada</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Início</Label>
                <Input type="time" value={form.hora_inicio} onChange={e => updateForm("hora_inicio", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fim</Label>
                <Input type="time" value={form.hora_fim} onChange={e => updateForm("hora_fim", e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Lead Vinculado</Label>
              <Select value={form.lead_id} onValueChange={v => updateForm("lead_id", v)}>
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
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
              <Label className="text-xs">Link de Videoconferência</Label>
              <Input value={form.link_videoconferencia} onChange={e => updateForm("link_videoconferencia", e.target.value)} placeholder="https://meet.google.com/..." />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Local</Label>
              <Input value={form.local} onChange={e => updateForm("local", e.target.value)} placeholder="Sala A, escritório, etc." />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Descrição / Pauta</Label>
              <Textarea value={form.descricao} onChange={e => updateForm("descricao", e.target.value)} placeholder="Objetivos da reunião, pauta..." className="resize-none" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gradient-primary text-primary-foreground">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingId ? "Salvar Alterações" : "Agendar Reunião"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
