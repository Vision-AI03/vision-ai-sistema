import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DayPicker } from "react-day-picker";
import {
  CalendarDays, Plus, Loader2, Clock, MapPin, Link2, User,
  CheckCircle2, XCircle, Edit2, Trash2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
} from "lucide-react";
import { format, isSameDay, parseISO, isAfter, addHours, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from "date-fns";
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

const STATUS_CONFIG: Record<string, { label: string; badgeColor: string; barHex: string; borderColor: string }> = {
  agendada:  { label: "Agendada",  badgeColor: "bg-primary/20 text-primary",        barHex: "#3b82f6", borderColor: "border-l-primary" },
  realizada: { label: "Realizada", badgeColor: "bg-success/20 text-success",         barHex: "#22c55e", borderColor: "border-l-success" },
  cancelada: { label: "Cancelada", badgeColor: "bg-destructive/20 text-destructive", barHex: "#ef4444", borderColor: "border-l-destructive" },
};

const DEFAULT_FORM = {
  titulo: "", descricao: "", data: "", hora_inicio: "09:00", hora_fim: "10:00",
  link_videoconferencia: "", local: "", lead_id: "none", status: "agendada",
};

// ─── Expandable meeting card ────────────────────────────────────────────────
function ReuniaoCard({ reuniao, lead, onEdit, onDelete, onStatus }: {
  reuniao: Reuniao; lead?: Lead;
  onEdit: (r: Reuniao) => void; onDelete: (id: string) => void; onStatus: (id: string, s: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[reuniao.status] || STATUS_CONFIG.agendada;
  const hasDetails = reuniao.link_videoconferencia || reuniao.local || reuniao.descricao;

  return (
    <Card className={`transition-colors border-l-4 ${cfg.borderColor} ${hasDetails ? "cursor-pointer hover:bg-secondary/20" : ""}`}
      onClick={() => hasDetails && setExpanded(v => !v)}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-semibold">
                {format(parseISO(reuniao.data_hora_inicio), "HH:mm")}
                {reuniao.data_hora_fim && ` – ${format(parseISO(reuniao.data_hora_fim), "HH:mm")}`}
              </span>
              <Badge className={`text-[10px] ${cfg.badgeColor}`}>{cfg.label}</Badge>
            </div>
            <p className="font-medium text-sm">{reuniao.titulo}</p>
            {lead && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <User className="h-3 w-3" />
                <span>{lead.nome}{lead.empresa ? ` — ${lead.empresa}` : ""}</span>
              </div>
            )}
          </div>
          <div className="flex gap-1 flex-shrink-0 items-center">
            {hasDetails && (
              <span className="text-muted-foreground">
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </span>
            )}
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={e => { e.stopPropagation(); onEdit(reuniao); }}>
              <Edit2 className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              onClick={e => { e.stopPropagation(); onDelete(reuniao.id); }}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
        {expanded && hasDetails && (
          <div className="space-y-1 text-xs text-muted-foreground pt-1 border-t border-border">
            {reuniao.link_videoconferencia && (
              <div className="flex items-center gap-1.5">
                <Link2 className="h-3 w-3 flex-shrink-0" />
                <a href={reuniao.link_videoconferencia} target="_blank" rel="noopener noreferrer"
                  className="text-primary hover:underline truncate" onClick={e => e.stopPropagation()}>
                  {reuniao.link_videoconferencia}
                </a>
              </div>
            )}
            {reuniao.local && (
              <div className="flex items-center gap-1.5"><MapPin className="h-3 w-3 flex-shrink-0" /><span>{reuniao.local}</span></div>
            )}
            {reuniao.descricao && <p className="italic mt-1 leading-relaxed">{reuniao.descricao}</p>}
          </div>
        )}
        {reuniao.status === "agendada" && (
          <div className="flex gap-2 pt-1" onClick={e => e.stopPropagation()}>
            <Button size="sm" variant="outline" className="h-6 text-xs gap-1 text-success border-success/30 hover:bg-success/10"
              onClick={() => onStatus(reuniao.id, "realizada")}>
              <CheckCircle2 className="h-3 w-3" /> Realizada
            </Button>
            <Button size="sm" variant="outline" className="h-6 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => onStatus(reuniao.id, "cancelada")}>
              <XCircle className="h-3 w-3" /> Cancelar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Custom mini-calendar with event bars ────────────────────────────────────
function MiniCalendar({ reunioes, leads, selectedDate, onSelectDate }: {
  reunioes: Reuniao[]; leads: Lead[];
  selectedDate: Date; onSelectDate: (d: Date) => void;
}) {
  const [viewMonth, setViewMonth] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const [tooltip, setTooltip] = useState<{ day: Date; x: number; y: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const daysInMonth = eachDayOfInterval({ start: startOfMonth(viewMonth), end: endOfMonth(viewMonth) });
  const firstDow = getDay(startOfMonth(viewMonth)); // 0=Sun
  const weekHeaders = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  function getReunioesDia(day: Date) {
    const dateStr = format(day, "yyyy-MM-dd");
    return reunioes.filter(r => r.data_hora_inicio.startsWith(dateStr));
  }

  function handleMouseEnter(day: Date, e: React.MouseEvent) {
    const reuDia = getReunioesDia(day);
    if (reuDia.length > 0) {
      setTooltip({ day, x: e.clientX, y: e.clientY });
    }
  }

  function handleMouseMove(day: Date, e: React.MouseEvent) {
    const reuDia = getReunioesDia(day);
    if (reuDia.length > 0) {
      setTooltip({ day, x: e.clientX, y: e.clientY });
    }
  }

  function handleMouseLeave() {
    setTooltip(null);
  }

  const tooltipReunioes = tooltip ? getReunioesDia(tooltip.day) : [];

  return (
    <div className="relative select-none">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3 px-1">
        <button className="p-1 rounded hover:bg-secondary" onClick={() => setViewMonth(subMonths(viewMonth, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium capitalize">
          {format(viewMonth, "MMMM yyyy", { locale: ptBR })}
        </span>
        <button className="p-1 rounded hover:bg-secondary" onClick={() => setViewMonth(addMonths(viewMonth, 1))}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Week headers */}
      <div className="grid grid-cols-7 mb-1">
        {weekHeaders.map(h => (
          <div key={h} className="text-center text-[10px] text-muted-foreground font-medium py-1">{h}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-1">
        {/* Empty cells before first day */}
        {Array.from({ length: firstDow }).map((_, i) => <div key={`empty-${i}`} />)}

        {daysInMonth.map(day => {
          const reuDia = getReunioesDia(day);
          const isSelected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={day.toISOString()}
              className={`relative flex flex-col items-center cursor-pointer rounded-md py-1 px-0.5 transition-colors
                ${isSelected ? "bg-primary text-primary-foreground" : isToday ? "bg-accent" : "hover:bg-secondary"}`}
              style={{ minHeight: 44 }}
              onClick={() => onSelectDate(day)}
              onMouseEnter={e => handleMouseEnter(day, e)}
              onMouseMove={e => handleMouseMove(day, e)}
              onMouseLeave={handleMouseLeave}
            >
              <span className={`text-xs font-medium ${isSelected ? "text-primary-foreground" : ""}`}>
                {day.getDate()}
              </span>
              {/* Colored event bars */}
              {reuDia.length > 0 && (
                <div className="flex flex-col gap-[2px] mt-[3px] w-full px-1">
                  {reuDia.slice(0, 3).map(r => (
                    <div
                      key={r.id}
                      style={{
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: isSelected ? "rgba(255,255,255,0.7)" : (STATUS_CONFIG[r.status]?.barHex || "#3b82f6"),
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Fixed-position tooltip */}
      {tooltip && tooltipReunioes.length > 0 && (
        <div
          ref={tooltipRef}
          style={{
            position: "fixed",
            left: tooltip.x + 12,
            top: tooltip.y - 8,
            zIndex: 9999,
            pointerEvents: "none",
          }}
        >
          <div style={{
            background: "#0f172a",
            color: "#f8fafc",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 12,
            lineHeight: 1.6,
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            minWidth: 160,
            maxWidth: 260,
          }}>
            {tooltipReunioes.map(r => {
              const horaInicio = r.data_hora_inicio.split("T")[1]?.slice(0, 5) || "";
              const horaFim = r.data_hora_fim ? r.data_hora_fim.split("T")[1]?.slice(0, 5) : null;
              const lead = leads.find(l => l.id === r.lead_id);
              const barColor = STATUS_CONFIG[r.status]?.barHex || "#3b82f6";
              return (
                <div key={r.id} style={{ marginBottom: tooltipReunioes.length > 1 ? 8 : 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: barColor, flexShrink: 0 }} />
                    <span style={{ fontWeight: 600 }}>{r.titulo}</span>
                  </div>
                  <div style={{ paddingLeft: 14, color: "#94a3b8", fontSize: 11 }}>
                    {horaInicio}{horaFim ? ` – ${horaFim}` : ""}
                    {lead && <div>{lead.nome}{lead.empresa ? ` · ${lead.empresa}` : ""}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
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

  useEffect(() => { fetchReunioes(); fetchLeads(); }, []);

  async function fetchReunioes() {
    setLoading(true);
    const { data } = await supabase.from("reunioes").select("*").order("data_hora_inicio", { ascending: true });
    setReunioes((data || []) as Reuniao[]);
    setLoading(false);
  }

  async function fetchLeads() {
    const { data } = await supabase.from("leads").select("id, nome, empresa").order("nome");
    setLeads((data || []) as Lead[]);
  }

  const reunioesNoDia = reunioes
    .filter(r => isSameDay(parseISO(r.data_hora_inicio), selectedDate))
    .sort((a, b) => a.data_hora_inicio.localeCompare(b.data_hora_inicio));

  const proximas = reunioes
    .filter(r => isAfter(parseISO(r.data_hora_inicio), addHours(new Date(), 1)) && r.status === "agendada")
    .slice(0, 4);

  const hoje = reunioes.filter(r =>
    isSameDay(parseISO(r.data_hora_inicio), new Date()) && r.status === "agendada"
  );

  function openNew() {
    setForm({ ...DEFAULT_FORM, data: format(selectedDate, "yyyy-MM-dd") });
    setEditingId(null);
    setDialogOpen(true);
  }

  function openEdit(r: Reuniao) {
    const dt = parseISO(r.data_hora_inicio);
    setForm({
      titulo: r.titulo, descricao: r.descricao || "",
      data: format(dt, "yyyy-MM-dd"), hora_inicio: format(dt, "HH:mm"),
      hora_fim: r.data_hora_fim ? format(parseISO(r.data_hora_fim), "HH:mm") : "10:00",
      link_videoconferencia: r.link_videoconferencia || "", local: r.local || "",
      lead_id: r.lead_id || "none", status: r.status,
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

    const payload = {
      user_id: user.id, titulo: form.titulo.trim(), descricao: form.descricao || null,
      data_hora_inicio: `${form.data}T${form.hora_inicio}:00`,
      data_hora_fim: `${form.data}T${form.hora_fim}:00`,
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
    if (!error) { setReunioes(prev => prev.filter(r => r.id !== id)); toast({ title: "Reunião excluída" }); }
  }

  async function handleStatus(id: string, status: string) {
    await supabase.from("reunioes").update({ status } as any).eq("id", id);
    setReunioes(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Calendário de Reuniões</h1>
        <Button onClick={openNew} className="gradient-primary text-primary-foreground gap-2">
          <Plus className="h-4 w-4" /> Nova Reunião
        </Button>
      </div>

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

      {/* 40/60 split */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-5 items-start w-full">
        {/* Left: Calendar */}
        <div className="space-y-3">
          <Card>
            <CardContent className="p-4">
              <MiniCalendar
                reunioes={reunioes}
                leads={leads}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
              />
            </CardContent>
          </Card>

          {proximas.length > 0 && (
            <Card>
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Próximas</p>
                {proximas.map(r => {
                  const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.agendada;
                  return (
                    <button key={r.id} className="flex items-center gap-2 text-xs w-full text-left hover:opacity-80"
                      onClick={() => setSelectedDate(parseISO(r.data_hora_inicio))}>
                      <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.barHex }} />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{r.titulo}</p>
                        <p className="text-muted-foreground">
                          {format(parseISO(r.data_hora_inicio), "dd/MM 'às' HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Day events */}
        <div className="space-y-3 min-h-[400px]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold capitalize text-muted-foreground">
              {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </h2>
            {reunioesNoDia.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {reunioesNoDia.length} reunião{reunioesNoDia.length !== 1 ? "ões" : ""}
              </Badge>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : reunioesNoDia.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <CalendarDays className="h-12 w-12 mb-3 opacity-25" />
              <p className="text-sm">Nenhuma reunião neste dia</p>
              <p className="text-xs mt-1 opacity-70">Clique em "Nova Reunião" para agendar</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reunioesNoDia.map(r => (
                <ReuniaoCard key={r.id} reuniao={r} lead={leads.find(l => l.id === r.lead_id)}
                  onEdit={openEdit} onDelete={handleDelete} onStatus={handleStatus} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0 pb-2">
            <DialogTitle>{editingId ? "Editar Reunião" : "Nova Reunião"}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 px-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Título <span className="text-destructive">*</span></Label>
              <Input value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))}
                placeholder="Ex: Reunião de Discovery — Empresa XYZ" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Data <span className="text-destructive">*</span></Label>
                <Input type="date" value={form.data} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
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
                <Input type="time" value={form.hora_inicio} onChange={e => setForm(p => ({ ...p, hora_inicio: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fim</Label>
                <Input type="time" value={form.hora_fim} onChange={e => setForm(p => ({ ...p, hora_fim: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Lead Vinculado</Label>
              <Select value={form.lead_id} onValueChange={v => setForm(p => ({ ...p, lead_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {leads.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.nome}{l.empresa ? ` — ${l.empresa}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Link de Videoconferência</Label>
              <Input value={form.link_videoconferencia} onChange={e => setForm(p => ({ ...p, link_videoconferencia: e.target.value }))}
                placeholder="https://meet.google.com/..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Local</Label>
              <Input value={form.local} onChange={e => setForm(p => ({ ...p, local: e.target.value }))}
                placeholder="Sala A, escritório, etc." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição / Pauta</Label>
              <Textarea value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
                placeholder="Objetivos da reunião, pauta..." className="resize-none" rows={3} />
            </div>
          </div>
          <DialogFooter className="flex-shrink-0 pt-3 border-t border-border mt-1">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gradient-primary text-primary-foreground">
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingId ? "Salvar Alterações" : "Agendar Reunião"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
